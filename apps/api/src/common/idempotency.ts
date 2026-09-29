import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { PrismaClient } from '@codek/database';
import { sha256Hex, stableStringify } from '@codek/domain';
import { PRISMA } from '../prisma/prisma.service';
import type { AuthedRequest } from '../auth/principal';
import { ApiError } from './errors';
import { toJsonSafe } from './json';

const IDEMPOTENT = 'codek:idempotent';
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;
const TTL_MS = 24 * 3600 * 1000;

/**
 * Idempotency-Key support for monetary/state-changing POSTs (spec §20.1). Same key + same body → the stored response
 * is replayed; same key + different body → IDEMPOTENCY_KEY_REUSED; concurrent duplicate → IDEMPOTENCY_IN_PROGRESS.
 * Errors are not cached, so a failed request can be retried with the same key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.handle(ctx, next));
  }

  private async handle(ctx: ExecutionContext, next: CallHandler): Promise<unknown> {
    const scopeName = this.reflector.get<string>(IDEMPOTENT, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = req.header('idempotency-key');
    if (!key || !KEY_PATTERN.test(key)) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header (8-128 characters) is required for this request');
    const scope = `${scopeName}:${req.principal?.userId ?? 'anon'}:${req.params ? stableStringify(req.params) : ''}`;
    const requestHash = sha256Hex(stableStringify(req.body ?? {}));
    const inserted = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO idempotency_keys (id, scope, key, request_hash, created_at, expires_at)
      VALUES (gen_random_uuid(), ${scope}, ${key}, ${requestHash}, now(), ${new Date(Date.now() + TTL_MS)})
      ON CONFLICT (scope, key) DO NOTHING RETURNING id`;
    if (!inserted.length) {
      const existing = await this.prisma.idempotencyKey.findUniqueOrThrow({ where: { scope_key: { scope, key } } });
      if (existing.requestHash !== requestHash) throw new ApiError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was used with a different request');
      if (existing.responseCode == null) throw new ApiError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed');
      res.status(existing.responseCode);
      res.setHeader('Idempotent-Replayed', 'true');
      return existing.responseBody;
    }
    const id = inserted[0]!.id;
    try {
      const value = await lastValueFrom(next.handle());
      const body = toJsonSafe(value ?? null);
      await this.prisma.idempotencyKey.update({ where: { id }, data: { responseCode: res.statusCode, responseBody: body as object } });
      return value;
    } catch (err) {
      await this.prisma.idempotencyKey.delete({ where: { id } }).catch(() => undefined);
      throw err;
    }
  }
}

export const Idempotent = (scope: string) => applyDecorators(SetMetadata(IDEMPOTENT, scope), UseInterceptors(IdempotencyInterceptor));
