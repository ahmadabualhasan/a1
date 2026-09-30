# Deployment

CODEK ships as four container images built from the repository `Dockerfile` (verified in CI by the `images` job,
which builds them, runs the migration job against an empty database and smoke-tests the running containers).

| Image target | Runs | Port / health | Scale |
|---|---|---|---|
| `migrate` | `prisma migrate deploy` + idempotent reference seed, then exits | — | one-off job per release |
| `api` | NestJS REST API `/api/v1`, webhooks, referral redirects `/r/:token`, metrics | 4000 · `/api/v1/health/live`, `/api/v1/health/ready` | horizontal (stateless) |
| `worker` | BullMQ consumers + schedulers (webhooks, payouts, outbox, sweepers, reconciliation, analytics, billing, retention) | 4100 · `/health/live`, `/health/ready` | ≥ 2 replicas (jobs are idempotent; schedulers are deduplicated by BullMQ) |
| `web` | Next.js (standalone) — public site and Creator/Business/Admin apps; proxies `/api/v1/*` and `/r/*` to the API | 3000 · `/` | horizontal |

All images run as the unprivileged `node` user, contain only compiled output and production dependencies, and never
contain secrets. Pin the base image by digest in your registry mirror.

## Build

```bash
docker build --target migrate -t codek-migrate:$SHA .
docker build --target api     -t codek-api:$SHA .
docker build --target worker  -t codek-worker:$SHA .
docker build --target web     -t codek-web:$SHA --build-arg API_INTERNAL_URL=http://api:4000 .
# Behind a TLS-intercepting build proxy only: add --secret id=extra_ca,src=/path/ca.pem (not baked into layers).
```

`API_INTERNAL_URL` is compiled into the web image's rewrite table. Use a stable internal service name (e.g. the
Kubernetes Service `http://api:4000`) so one image works in every environment.

## Environments

| | development | staging | production |
|---|---|---|---|
| `APP_ENV` | development | staging | production |
| Data | local Docker | anonymised/synthetic only | live |
| Payout provider | sandbox | sandbox or PayPal sandbox | PayPal live (`PAYOUT_PROVIDER=paypal`, `PAYPAL_ENVIRONMENT=live`) — sandbox refused |
| Email | log driver | SMTP to a test inbox | SMTP — log driver refused |
| Email verification | optional | required | required (enforced) |
| Admin MFA | optional | required | required |
| Metrics token | optional | required | required |
| Legal documents | placeholders published | placeholders published | placeholders created as **drafts**; sign-up stays closed until counsel-approved versions are published (D-022) |

The configuration schema (`packages/config/src/env.ts`, documented in docs/ENVIRONMENT.md) refuses to start with an
unsafe combination.

## Topology and client IPs

```
Internet → CDN/WAF (optional) → load balancer/ingress (TLS) → web (Next.js) ──/api/v1, /r──→ api → PostgreSQL 18
                                                            └──── /api/v1/webhooks/* (direct) ─→ api   Redis 7
                                                                                         worker ─┘   S3-compatible storage
```

- Per-IP rate limits and hashed IPs rely on `X-Forwarded-For`. The web tier's proxy forwards that header unchanged, so
  the ingress **must set/append** it (never pass a client-supplied value through untouched) and the API's
  `TRUST_PROXY` must equal the number of proxies that append to it (load balancer only = 1; CDN + load balancer = 2).
- Route provider webhooks (`/api/v1/webhooks/*`) straight to the API service; keep request bodies unmodified (the raw
  body is signature-verified).
- Only the web tier (and optionally the webhook path) is public. PostgreSQL, Redis and the worker are private.
- Scrape metrics from `/api/v1/metrics` with `Authorization: Bearer $METRICS_TOKEN` (infra/monitoring/).

## Release procedure (release gates)

1. CI green on the commit: build, lint, typecheck, unit/integration tests (incl. security sweeps and recovery),
   dependency audit (fails on high/critical), secret scan, Playwright E2E + accessibility, backup/restore drill,
   image build + smoke test.
2. Review `docs/DECISIONS.md` items marked DECISION NEEDED that affect the release; production requires published
   counsel-approved legal documents and configured provider credentials (docs/INTEGRATIONS.md).
3. Take a fresh backup (`infra/scripts/db-backup.sh`) and confirm the latest restore drill passed.
4. Run the `migrate` job. It must succeed before any new api/worker version starts.
5. Roll out `worker`, then `api`, then `web` (rolling update; readiness probes gate traffic).
6. Run `infra/scripts/smoke-test.sh` against the environment (`WEB_URL`, `API_URL`, `METRICS_TOKEN`).
7. Watch alerts for 30 minutes (infra/monitoring/alerts.yml): 5xx rate, latency, webhook backlog, ledger invariant.

### Migrations and rollback

- Migrations are forward-only and never deleted or edited once merged (`database/prisma/migrations`).
- Use **expand → migrate → contract**: add nullable columns/tables first (compatible with the running version), deploy
  code that writes both, backfill, then remove old structures in a later release. This keeps application rollbacks
  possible without database rollbacks.
- Application rollback = redeploy the previous image tags (the schema remains compatible by construction).
- Never "fix" financial data with ad-hoc SQL: ledger rows are immutable by trigger. Corrections are dual-approved
  adjustments/reversals through the admin console (docs/RECOVERY.md).
- If a migration itself fails, the job exits non-zero and the rollout stops; resolve with `prisma migrate resolve`
  only after understanding the failure, and restore from backup if data was affected.

## First administrator

There is no self-service path to admin. After the operator signs up and verifies their email:

```bash
docker run --rm --env-file prod.env -e ADMIN_EMAIL=ops@example.com -e ADMIN_ROLE=platform_admin \
  -e ADMIN_REASON="initial operator, ticket OPS-1" codek-api:$SHA node dist/scripts/create-admin.js
```

The grant is audit-logged. The account must enable TOTP before it can use the admin console. Further role grants use
Admin → Users and require a second administrator's approval.

## Local production-like run

`docker compose -f infra/docker-compose.yml up -d` for PostgreSQL/Redis, then run the built images with
`--network host` as the CI `images` job does, and `infra/scripts/smoke-test.sh`.
