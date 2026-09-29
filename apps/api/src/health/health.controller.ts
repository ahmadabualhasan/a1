import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@codek/database';
import { Public } from '../auth/decorators';
import { RawResponse } from '../common/envelope.interceptor';
import { PRISMA } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

/** Liveness/readiness (spec §24.3). Readiness checks dependencies without exposing internals. */
@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @RawResponse()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @RawResponse()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks = { database: 'down', redis: 'down' } as Record<string, 'up' | 'down'>;
    await Promise.all([
      this.prisma.$queryRawUnsafe('SELECT 1').then(() => (checks.database = 'up')).catch(() => undefined),
      withTimeout(this.redis.ping(), 1000).then(() => (checks.redis = 'up')).catch(() => undefined),
    ]);
    const ok = Object.values(checks).every((c) => c === 'up');
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', checks };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
