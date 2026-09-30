import { z } from 'zod';

/**
 * Central, validated environment schema for every CODEK process (api, worker, web server side).
 * Secrets are never given defaults. Development-only defaults are clearly local values.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Optional secret-like value: an empty string (as in .env.example) means "not set". */
const optionalToken = (min: number) => z.preprocess((v) => (v === '' ? undefined : v), z.string().min(min).optional());

export const appEnvSchema = z.enum(['development', 'test', 'staging', 'production']);
export type AppEnv = z.infer<typeof appEnvSchema>;

export const envSchema = z
  .object({
    APP_ENV: appEnvSchema.default('development'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    // Network
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_PUBLIC_URL: z.url().default('http://localhost:4000'),
    WEB_PUBLIC_URL: z.url().default('http://localhost:3000'),
    /** Public base URL used when building referral links / QR codes (redirect domain). */
    TRACKING_PUBLIC_URL: z.url().default('http://localhost:4000'),
    /** Comma-separated origin allowlist for CORS + CSRF origin checks. */
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    /**
     * Reverse-proxy hops to trust for the client IP (X-Forwarded-For), used by per-IP rate limits and hashed IPs.
     * `false`/`0` = none, `true` = 1. Set to the number of proxies that APPEND to X-Forwarded-For in front of the API
     * (e.g. load balancer = 1, CDN + load balancer = 2). The web tier's rewrite proxy forwards the header unchanged.
     */
    TRUST_PROXY: z
      .union([z.enum(['true', 'false']), z.coerce.number().int().min(0).max(10)])
      .default('false')
      .transform((v) => (v === 'true' ? 1 : v === 'false' ? 0 : v)),

    // Data stores
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    QUEUE_PREFIX: z.string().default('codek'),

    // Auth
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    AUTH_REQUIRE_EMAIL_VERIFICATION: bool.default(true),
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),

    // Hashing / encryption
    /** Pepper for pseudonymous hashes (IP/user agent/customer references). */
    HASH_PEPPER: z.string().min(16),
    /** base64-encoded 32-byte key for the local encrypted secret store (AES-256-GCM). */
    SECRETS_MASTER_KEY: z.string().min(40),
    SECRETS_BACKEND: z.enum(['local-encrypted', 'aws-secrets-manager']).default('local-encrypted'),

    // Storage
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage-data'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

    // Email
    EMAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
    EMAIL_FROM: z.string().default('CODEK <no-reply@codek.local>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: bool.default(false),

    // Payments / payouts
    PAYOUT_PROVIDER: z.enum(['sandbox', 'paypal']).default('sandbox'),
    PAYPAL_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),
    PAYPAL_CLIENT_ID: z.string().optional(),
    PAYPAL_CLIENT_SECRET: z.string().optional(),

    // Webhooks
    WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),

    // Rate limiting
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    // Outbound HTTP egress allowlist (comma-separated host suffixes) for server-side fetching.
    OUTBOUND_HOST_ALLOWLIST: z.string().default('api-m.sandbox.paypal.com,api-m.paypal.com,myshopify.com'),

    // Observability
    /** Reserved: no error-reporting SDK is bundled in this build, so a value is rejected rather than silently ignored. */
    SENTRY_DSN: optionalToken(1),
    METRICS_ENABLED: bool.default(true),
    /** Bearer token for the Prometheus scrape endpoint; required in staging/production when metrics are enabled. */
    METRICS_TOKEN: optionalToken(24),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
    if (env.EMAIL_DRIVER === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required when EMAIL_DRIVER=smtp' });
    }
    if (env.PAYOUT_PROVIDER === 'paypal' && (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['PAYPAL_CLIENT_ID'], message: 'PayPal credentials are required when PAYOUT_PROVIDER=paypal' });
    }
    if (env.SENTRY_DSN) {
      ctx.addIssue({ code: 'custom', path: ['SENTRY_DSN'], message: 'Error reporting is not implemented in this build; leave SENTRY_DSN empty (use structured logs + metrics)' });
    }
    if ((env.APP_ENV === 'production' || env.APP_ENV === 'staging') && env.METRICS_ENABLED && !env.METRICS_TOKEN) {
      ctx.addIssue({ code: 'custom', path: ['METRICS_TOKEN'], message: 'METRICS_TOKEN is required when metrics are enabled outside development' });
    }
    if (env.APP_ENV === 'production') {
      if (env.PAYOUT_PROVIDER === 'sandbox') {
        ctx.addIssue({ code: 'custom', path: ['PAYOUT_PROVIDER'], message: 'The sandbox payout provider is not allowed in production' });
      }
      if (env.EMAIL_DRIVER === 'log') {
        ctx.addIssue({ code: 'custom', path: ['EMAIL_DRIVER'], message: 'EMAIL_DRIVER=log is not allowed in production' });
      }
      if (!env.AUTH_REQUIRE_EMAIL_VERIFICATION) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_REQUIRE_EMAIL_VERIFICATION'], message: 'Email verification must be required in production' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parse and validate process.env. Throws a readable error listing invalid keys (never values). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env, opts: { cache?: boolean } = {}): Env {
  if (cached && opts.cache !== false && source === process.env) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid CODEK environment configuration:\n${issues}`);
  }
  if (source === process.env && opts.cache !== false) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache(): void {
  cached = undefined;
}

export function parseList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
