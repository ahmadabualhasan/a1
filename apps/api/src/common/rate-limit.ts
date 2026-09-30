import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';
import { REDIS } from '../redis/redis.module';
import { ApiError } from './errors';
import { currentContext } from './request-context';

export interface RateLimitOptions {
  /** Bucket name, e.g. "auth.sign-in". */
  bucket: string;
  limit: number;
  windowSeconds: number;
  /** Key by user when authenticated (default) or always by IP. */
  by?: 'user_or_ip' | 'ip';
  /**
   * Behaviour when Redis is unavailable. Defaults to fail-closed for credential endpoints (`auth.*` buckets) so an
   * outage cannot be used to brute-force passwords, MFA or backup codes; other traffic fails open for availability.
   */
  failClosed?: boolean;
}

export const RATE_LIMIT = 'codek:rate-limit';
export const RateLimit = (opts: RateLimitOptions): MethodDecorator & ClassDecorator => SetMetadata(RATE_LIMIT, opts);

/**
 * Redis fixed-window rate limiter (shared across API instances). Sets X-RateLimit-* headers and Retry-After.
 * Every route has the global default; sensitive routes declare tighter @RateLimit buckets.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request & { principal?: { userId: string } }>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const specific = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]);
    const opts: RateLimitOptions = specific ?? { bucket: 'global', limit: this.env.RATE_LIMIT_MAX, windowSeconds: this.env.RATE_LIMIT_TTL_SECONDS };
    const who = opts.by !== 'ip' && req.principal?.userId ? `u:${req.principal.userId}` : `ip:${currentContext()?.ipHash ?? req.ip ?? 'unknown'}`;
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `${this.env.QUEUE_PREFIX}:rl:${opts.bucket}:${who}:${window}`;
    let count: number;
    try {
      const results = await this.redis.multi().incr(key).expire(key, opts.windowSeconds + 1).exec();
      count = Number(results?.[0]?.[1] ?? 0);
    } catch {
      // Readiness reports Redis down either way.
      if (opts.failClosed ?? opts.bucket.startsWith('auth.')) {
        res.setHeader('Retry-After', '30');
        throw new ApiError('SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again shortly.');
      }
      return true;
    }
    const remaining = Math.max(0, opts.limit - count);
    const reset = (window + 1) * opts.windowSeconds;
    res.setHeader('X-RateLimit-Limit', String(opts.limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(reset));
    if (count > opts.limit) {
      res.setHeader('Retry-After', String(Math.max(1, reset - Math.floor(Date.now() / 1000))));
      throw new ApiError('RATE_LIMITED', 'Too many requests, please try again later');
    }
    return true;
  }
}
