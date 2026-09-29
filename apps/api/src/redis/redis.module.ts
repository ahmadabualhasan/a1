import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import IORedis, { type Redis } from 'ioredis';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      // maxRetriesPerRequest: null is required by BullMQ workers sharing this connection style.
      useFactory: (env: Env): Redis => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
