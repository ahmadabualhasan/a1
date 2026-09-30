# Environment variables

Validated at startup by `packages/config/src/env.ts` (api, worker and scripts). Invalid or unsafe combinations stop the
process with a list of offending keys (values are never printed). Copy `.env.example` for local development; in
deployed environments inject values from the secret manager. Never commit real values.

## Core
| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | development | development · test · staging · production. Drives safety guards below. |
| `NODE_ENV` | development | Set `production` in images. |
| `LOG_LEVEL` | info | pino levels; logs are JSON with redaction. |
| `API_PORT` | 4000 | |
| `API_PUBLIC_URL` | http://localhost:4000 | Public base URL of the API (webhook URLs shown to merchants). |
| `WEB_PUBLIC_URL` | http://localhost:3000 | Used in emails/notification links. |
| `TRACKING_PUBLIC_URL` | http://localhost:4000 | Base of referral links `/r/:token`. |
| `CORS_ALLOWED_ORIGINS` | http://localhost:3000 | Comma-separated; also the CSRF origin allowlist. |
| `TRUST_PROXY` | false | Hop count (`false`=0, `true`=1, or a number). See DEPLOYMENT.md "Topology and client IPs". |

## Data stores
| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — (required) | PostgreSQL 18. Prisma `?schema=public` accepted. |
| `REDIS_URL` | redis://localhost:6379 | Queues, rate limits. |
| `QUEUE_PREFIX` | codek | Namespace for BullMQ and rate-limit keys (tests use `codek-test`, E2E `codek-e2e`). |

## Secrets and auth (required, no defaults)
| Variable | Notes |
|---|---|
| `AUTH_SECRET` | ≥ 32 chars. Rotating it signs everyone out. |
| `HASH_PEPPER` | ≥ 16 chars. Pepper for hashed IPs/user agents/customer refs. Rotate only on compromise. |
| `SECRETS_MASTER_KEY` | Base64 32-byte key for AES-256-GCM encryption of integration credentials. Escrow it. |
| `SECRETS_BACKEND` | `local-encrypted` (default). `aws-secrets-manager` is rejected at startup (not in this build). |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | true. Must be true in production. |
| `SESSION_TTL_SECONDS` | 604800 (7 days). |

## Storage and email
| Variable | Default | Notes |
|---|---|---|
| `STORAGE_DRIVER` | local | `s3` requires `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ region/endpoint in .env.example). |
| `STORAGE_LOCAL_DIR` | ./storage-data | Development only. |
| `MAX_UPLOAD_BYTES` | 10485760 | |
| `EMAIL_DRIVER` | log | `log` is refused in production. `smtp` requires `SMTP_HOST`. |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | | CREDENTIAL REQUIRED for real email. |

## Payments and integrations
| Variable | Default | Notes |
|---|---|---|
| `PAYOUT_PROVIDER` | sandbox | `sandbox` is refused in production. `paypal` requires `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`. |
| `PAYPAL_ENVIRONMENT` | sandbox | `live` for production payouts. |
| `WEBHOOK_TOLERANCE_SECONDS` | 300 | Timestamp tolerance for signed webhooks (replay window). |
| `OUTBOUND_HOST_ALLOWLIST` | PayPal API hosts, myshopify.com | Host suffixes the server may call (SSRF egress control). |

## Limits and observability
| Variable | Default | Notes |
|---|---|---|
| `RATE_LIMIT_TTL_SECONDS` / `RATE_LIMIT_MAX` | 60 / 120 | Global per-user/IP budget; sensitive routes have stricter buckets. |
| `METRICS_ENABLED` | true | Prometheus endpoint `/api/v1/metrics`. |
| `METRICS_TOKEN` | — | ≥ 24 chars; required in staging/production when metrics are enabled. |
| `SENTRY_DSN` | — | Reserved; must be empty (no error-reporting SDK is bundled). |

## Production guards (enforced)
Production refuses: sandbox payouts, log email driver, disabled email verification, missing metrics token (also in
staging). The reference seed never publishes placeholder legal documents in production, and sign-up stays closed until
counsel-approved versions are published.

## Worker and web
- Worker: all of the above plus `WORKER_HEALTH_PORT` (default 4100).
- Web (Next.js): `API_INTERNAL_URL` (build time, default `http://api:4000` in images), `PORT`, `HOSTNAME`.
