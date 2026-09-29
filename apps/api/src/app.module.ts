import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { loadEnv } from '@codek/config';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.service';
import { OutboxModule } from './outbox/outbox.service';
import { AccessModule } from './access/access.service';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { RateLimitGuard } from './common/rate-limit';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { HealthController } from './health/health.controller';
import { DOMAIN_MODULES } from './modules';

const env = loadEnv();

export const CORE_MODULES: Array<Type | DynamicModule> = [
  ConfigModule,
  LoggerModule.forRoot({
    pinoHttp: {
      level: env.APP_ENV === 'test' && !process.env.CODEK_TEST_LOG ? 'silent' : env.LOG_LEVEL,
      genReqId: (req) => (req as unknown as { id?: string }).id ?? '',
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', 'req.headers["x-shopify-hmac-sha256"]', 'req.headers["x-codek-signature"]'],
        censor: '[redacted]',
      },
      serializers: {
        req: (req: { id?: string; method?: string; url?: string }) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
      },
      customProps: () => ({ service: 'codek-api', env: env.APP_ENV }),
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health/') },
    },
  }),
  PrismaModule,
  RedisModule,
  AuditModule,
  OutboxModule,
  AccessModule,
  AuthModule,
];

@Module({
  imports: [...CORE_MODULES, ...DOMAIN_MODULES],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
