# Testing

| Layer | Where | Runs in | Count (2026-09-30) |
|---|---|---|---|
| Domain unit tests (money, commission, fees, attribution, ledger postings, state machines, URL safety) | `packages/domain/src/*.test.ts` | `pnpm test` / CI | 53 |
| Config validation (production guards) | `packages/config/src/env.test.ts` | `pnpm test` / CI | 7 |
| Database invariants (balanced/immutable ledger, audit chain, no-delete, seed) on PostgreSQL 18 | `database/test/invariants.test.ts` | `pnpm test` / CI | 9 |
| API integration (real PostgreSQL + Redis, HTTP through the Nest app) | `apps/api/test/*.test.ts` | `pnpm test` / CI | 113 |
| API client helpers | `packages/api-client` | `pnpm test` / CI | 3 |
| Web unit (string-based rate/money conversion) | `apps/web/lib/*.test.ts` | `pnpm test` / CI | 3 |
| E2E journeys, public pages, WCAG 2.1 A/AA (axe) — desktop + mobile | `apps/web/e2e/*.spec.ts` (Playwright, real API + web) | `pnpm test:e2e` / CI | 30 |
| Backup → restore → integrity drill | `infra/scripts/db-restore-drill.sh` | CI (after E2E) | — |
| Container build + migration job + smoke test | CI `images` job, `infra/scripts/smoke-test.sh` | CI | — |
| Load scenarios | `apps/api/test/load/*.load.ts` | `pnpm --filter @codek/api test:load` (manual/nightly) | 3 |

## What the API integration suite covers
- **auth** — sign-up with legal acceptance (fails closed while terms are unpublished), verification, sign-in/out,
  enumeration resistance, password reset, CSRF origin check, rate limits, failed-sign-in metric.
- **security** — OpenAPI-driven 401/tenant/admin sweeps, MFA end to end with an independent TOTP implementation,
  Redis-outage fail-closed credential endpoints, headers and error hygiene.
- **profiles / campaigns / partnerships** — tenant and property-level isolation, publish gates, admin review,
  eligibility, caps and waitlists under concurrency, frozen term snapshots and re-confirmation.
- **pipeline** — tracking, attribution conflicts and ties, idempotent conversions, out-of-order events, refunds,
  commission lifecycle, funding allocation, hold release, ledger invariants.
- **payouts** — payout requests, retries, failures, cancellation, clawback netting and its reversal, concurrency.
- **webhooks** — signatures, replay window, idempotency, test mode → live, dead letters, Shopify mapping,
  reconciliation.
- **collaboration / admin / analytics / billing** — notifications, messaging moderation, uploads, deliverables,
  dual approvals, fraud, disputes, audit chain, privacy, KPI provenance and ledger cross-check, fee plan snapshots.
- **recovery** — crashed webhook worker, Redis down at ingest, crashed outbox dispatcher, crashed payout worker.
- **email-smtp / create-admin / secret-rotation** — SMTP delivery through an in-process server; audited admin
  bootstrap; master-key rotation. Uploads include ClamAV scanning against an in-process clamd; payouts include
  provider-returned payouts.

## Running locally
```bash
docker compose -f infra/docker-compose.yml up -d   # PostgreSQL 18 + Redis (or local services)
cp .env.example .env                                # fill local values
pnpm install && pnpm db:migrate && pnpm db:seed
pnpm verify                                          # build + typecheck + lint + secret scan (required before push)
pnpm test                                            # unit + integration (tests create/reset codek_test only)
# E2E: create/migrate/seed a codek_e2e database, then
DATABASE_URL=postgresql://…/codek_e2e pnpm test:e2e   # add PW_CHROMIUM_PATH=… to use a preinstalled Chromium
pnpm --filter @codek/api test:load                   # writes apps/api/load-report.md
```
Test helpers refuse to reset databases whose names are not `*_test`, `*_e2e` or `*_ci`.

## Latest load results
Single API process on a 4-vCPU container, PostgreSQL 18 and Redis 7 on the same host:

| Scenario | Requests | Concurrency | req/s | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|---|
| Signed webhook ingest (1/3 duplicate deliveries) | 900 | 50 | 216 | 221 | 297 | 628 |
| Webhook processing drain (10 workers) | 600 | 10 | 31 | — | — | — |
| Tracking redirect `/r/:token` | 2000 | 50 | 348 | 140 | 156 | 376 |
| Public marketplace list | 1000 | 50 | 254 | 195 | 253 | 277 |
| Creator earnings (authenticated) | 500 | 25 | 175 | 144 | 160 | 168 |

After each burst the tests assert correctness: one conversion and one commission per order despite duplicates, every
click recorded once, ledger invariants hold. Webhook processing is intentionally serialized per order (advisory lock);
scale throughput with worker replicas.
