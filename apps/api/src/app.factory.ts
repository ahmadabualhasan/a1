import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { parseList, type Env } from '@codek/config';
import { AppModule } from './app.module';
import { ENV } from './config/config.module';
import { csrfMiddleware } from './common/csrf.middleware';
import { requestIdMiddleware } from './common/request-id.middleware';
import { COOKIE_PREFIX } from './auth/better-auth';
import { MetricsService } from './observability/metrics.service';
import { httpMetricsMiddleware } from './observability/http-metrics.middleware';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, bufferLogs: true });
  const env = app.get<Env>(ENV);
  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY > 0 ? env.TRUST_PROXY : false);
  app.disable('x-powered-by');
  app.use(requestIdMiddleware(env.HASH_PEPPER));
  app.use(httpMetricsMiddleware(app.get(MetricsService)));
  // Webhooks keep the exact raw bytes (signature verification) and are never JSON-parsed by the framework,
  // so malformed payloads can still be stored as evidence.
  app.use('/api/v1/webhooks', express.raw({ type: () => true, limit: '1mb' }), (req: express.Request & { rawBody?: Buffer }, _res: express.Response, next: express.NextFunction) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'", 'data:'], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  const origins = parseList(env.CORS_ALLOWED_ORIGINS);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    exposedHeaders: ['X-Request-Id', 'X-Correlation-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
  });
  app.use(csrfMiddleware(origins, COOKIE_PREFIX));
  app.setGlobalPrefix('api/v1', { exclude: ['r/:token'] });
  app.enableShutdownHooks();
  if (env.APP_ENV !== 'production') {
    const doc = buildOpenApi(app);
    SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/openapi.json' });
  }
  return app;
}

export function buildOpenApi(app: NestExpressApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CODEK API')
    .setDescription(
      'CODEK REST API (/api/v1). Success envelope `{ data, meta: { requestId, pagination? } }`; error envelope `{ error: { code, message, details, requestId } }`. Money values are integer minor units with ISO-4217 currency.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('codek.session_token')
    .build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
