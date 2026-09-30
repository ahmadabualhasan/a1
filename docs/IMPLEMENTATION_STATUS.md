# CODEK — Implementation status (resume state)

_Last updated: 2026-09-30_

## Resume instructions (read first)
1. `git log --oneline | head -20`, `git status` on branch `claude/compassionate-allen-kn8zop`.
2. Start deps: `docker compose -f infra/docker-compose.yml up -d` (or local PostgreSQL 18 + Redis), `cp .env.example .env`
   and fill local values, then `pnpm install && pnpm db:migrate && pnpm db:seed`.
3. Health: `pnpm verify` (build + typecheck + lint + secret scan) and `pnpm test` must be green before new work.
4. Continue at **Next task** below. Never restart completed phases.

## Current phase / task
- Phase: 19 — Deployment, monitoring, runbooks (Phases 1–18 complete).
- Task: images verified in CI (`images` job), docs complete; remaining: final release-gate review and final report.

## Last successful checkpoint
- CI run #17 (commit 726d44b) — **success**: build-test (lint, typecheck, unit/integration, audit, secret scan) and
  e2e (Playwright journey + a11y + backup/restore drill). The only e2e failure in history was run #12 (Playwright CLI
  invoked from the repo root; fixed in b9a3b56 and green since run #14).
- Local (this checkpoint): `pnpm verify` clean; API integration 110, domain 53, config 8, database 9, api-client 3,
  web unit 3, Playwright 30 (E2E + accessibility), load 3; Docker images built and smoke-tested.

## Status legend
IMPLEMENTED · TESTED · VERIFIED · BLOCKED · NOT CONFIGURED · CREDENTIAL_REQUIRED

## Completed phases & features
- Monorepo (pnpm workspaces): apps/{api,worker,web}, packages/{domain,config,api-client,ui,testing,eslint-config,tsconfig}, database/.
- `@codek/domain`: money (bigint minor units, decimal.js), commission engine, fee engine, attribution engine,
  code normalization/generation, state machines, double-entry postings, RBAC catalogue, normalized event contracts,
  URL/SSRF safety, hashing — TESTED (vitest).
- `@codek/config`: validated environment schema with production guards — TESTED.
- Local infra: docker compose (PostgreSQL 18, Redis 7, optional MinIO/Mailpit), CI workflow, secret scan script.

- Phase 2 (database): Prisma schema with all spec §19 entities + documented additions, init migration, DB invariant
  migration (balanced/immutable ledger, audit hash chain, no-delete history, check constraints), idempotent reference
  seed — TESTED (database/test/invariants.test.ts, 8 tests on PostgreSQL 18.6).

- Phase 3 (auth/RBAC): NestJS 11 API with standard envelopes, request/correlation ids, pino logging (redaction),
  helmet, CORS allowlist, CSRF origin check, Redis rate limiting, Better Auth (DB sessions, email verification,
  reset, TOTP MFA endpoints, change password, session list/revoke), global AuthGuard + AccessService (tenant/object
  checks), audit service, transactional outbox — TESTED (apps/api/test/auth.test.ts).
- Phase 4 (profiles): businesses (create/update with optimistic locking, members, verification request), creators
  (profile, social accounts with provenance, business-facing discovery, performance stats) — TESTED
  (apps/api/test/profiles.test.ts incl. cross-tenant isolation and property-level authorization).

- Phase 5 (catalog/campaigns): catalog CRUD; campaigns with all §3.5A fields, commission rules as immutable
  versions, attribution policy versioning, eligibility rules, lifecycle (draft→pending_review→published→active→
  paused→ended→archived) with publish gates, admin review, scheduler transitions, marketplace cards/filters,
  public vs member detail views — TESTED (apps/api/test/campaigns.test.ts).

- Phase 6 (applications/partnerships): apply (eligibility, deadline, cap, ordered waitlist), accept/reject with
  row-locked capacity, invitations, partnerships with immutable hashed term snapshots (commission rule, attribution
  policy, fee plan, hold, rights, deliverables, legal versions), creator re-confirmation when terms changed,
  status control, timeline — TESTED incl. concurrent acceptance (apps/api/test/partnerships.test.ts).
- Phase 7 (promotion assets): concurrency-safe unique codes (ON CONFLICT), referral links with allowlisted
  destination host, QR PNG stored via storage abstraction (local/S3), authorized file download, business code
  pause/resume/revoke, expiry — TESTED.

- Phase 8 (tracking/attribution): `/r/:token` redirect (allowlisted destination re-validated, `codek_ref` click id,
  hashed IP/UA, first-party session cookie, bot flag), `POST /track/click`; touchpoints from CODEK codes, click refs,
  referral tokens; immutable versioned decisions using the snapshot policy of the primary evidence (D-025) — TESTED.
- Phase 9 (conversions): idempotent pipeline (per-order advisory lock + unique event ids), out-of-order handling
  (parked refunds/cancels replayed; paid-before-created), cumulative refunds, controlled redemption interface
  (verified), manual evidence (self-reported, admin approval only), business approve/reject — TESTED.
- Phase 10 (commission/ledger): commission from frozen snapshot, fee from snapshot fee plan, lifecycle
  pending→approved→funded→available with FIFO funding allocation and hold release, proportional reversals and
  clawbacks, idempotent balanced postings, invariant verification — TESTED (apps/api/test/pipeline.test.ts).

- Phase 11 (funding/payouts): provider abstraction (sandbox test adapter, PayPal Payouts adapter —
  CREDENTIAL_REQUIRED), SSRF-safe outbound HTTP client, Idempotency-Key interceptor, merchant funding (sandbox
  auto-confirm outside production; bank transfer confirmed by finance admin) with FIFO allocation and shortfall view,
  ledger-derived earnings (pending/approved/available/in-progress/paid/clawback), payout request (whole commissions,
  clawback netting, minimum threshold, readiness, risk-review block, per-creator lock), provider attempts with retry
  and final-failure fund return, cancellation, BullMQ producer — TESTED (apps/api/test/payouts.test.ts).

- Phase 12 (integrations/webhooks/worker): integration lifecycle (test mode before live, pause, disconnect keeps
  history), AES-256-GCM secret store, custom signed-webhook adapter (HMAC + timestamp) and Shopify adapter (HMAC,
  cumulative refunds; IMPLEMENTED — CREDENTIAL REQUIRED for live), webhook pipeline (signature → replay → idempotency →
  raw storage → queue → normalize → conversion), DLQ, admin replay, sweeper, reconciliation (provider orders + ledger/
  payout internal), transactional outbox dispatcher, scheduled jobs, Prometheus metrics, worker app — TESTED
  (apps/api/test/webhooks.test.ts; worker boot verified locally).
- Phase 13 (collaboration): outbox-driven notifications with per-type preferences (in-app/email, idempotent),
  partnership-scoped messaging (rate limits, reports, moderation hides without deleting), secure uploads (allowlist +
  magic-byte sniffing, private storage, ownership-checked attach/download), deliverables & submissions
  (changes-requested/resubmit/approve), content rights view — TESTED (apps/api/test/collaboration.test.ts).

- Phase 14 (admin/trust/risk): admin console API (overview queues, users suspend/reactivate/grant role, tenants,
  verification cases & status, social metric verification, campaigns/partnerships/conversions/payouts/fundings/
  webhooks/integrations/reconciliations lists, ledger balances/entries), dual-approval admin actions (manual ledger
  adjustments, commission reversal, re-attribution, platform role grant, user anonymization), fraud signals
  (self-referral, repeated orders, conversion spike, code leakage, staff redemptions, refund spike, attribution
  conflict, webhook replay) → flags → cases with holds, disputes lifecycle with evidence/hold/decision/adjustment,
  audit log API + chain verification, settings/flags, legal document versioning & re-acceptance, privacy requests,
  data export and anonymization — TESTED (apps/api/test/admin.test.ts).

- Phase 15 (analytics): business overview KPIs + funnel with verified/self-reported/attribution-state breakdown,
  provenance, ledger cross-check, creator & campaign tables, creator analytics, platform analytics, CSV export
  (formula-injection safe), hourly daily-aggregation job, timeseries — TESTED (apps/api/test/analytics.test.ts).
  Definitions: docs/ANALYTICS.md.
- Phase 16 (billing/pricing): public transparent pricing, admin pricing plans, subscriptions behind the pricing
  decision flag (off), fee plan resolution frozen into partnership snapshots (verified: plan change affects only new
  partnerships), idempotent invoice generation job — TESTED (apps/api/test/billing.test.ts). Payment collection for
  subscription invoices: DECISION NEEDED (D-003) / CREDENTIAL_REQUIRED.

- Phase 17 (web): typed API client from OpenAPI; accessible UI kit; Next.js app with same-origin API proxy and
  security headers. Public site, auth (sign-up with versioned legal acceptance, sign-in + MFA step, verification,
  reset, sessions, privacy). Creator area (onboarding, dashboard, marketplace, applications, invitations,
  partnerships with saved terms/assets/deliverables/messages/timeline, codes & links, sales, earnings, payout method
  and idempotent payout requests, profile/social/verification). Business area (onboarding, dashboard, settings/team/
  verification, catalog, campaign create/edit/lifecycle, applications/invitations, creator discovery/invite,
  partnerships with lifecycle and code controls, sales with approve/reject + counter redemption + manual sales,
  funding, analytics + CSV, integrations incl. test mode/go-live/secret rotation/health/events/reconciliation,
  billing). Admin area (overview queues, dual approvals, verification, users, businesses, creators, campaign review,
  conversions review/reverse/re-attribute, ledger balances/entries/adjustments, fundings/payouts, ledger
  reconciliation, integrations/webhooks replay/reconciliation items, fraud flags/cases, disputes, moderation, audit
  log + chain verification, legal documents, settings/pricing, privacy requests). Shared notifications and
  disputes. Money is formatted from integer minor units and converted with string arithmetic only — TESTED
  (web unit tests + Playwright journey: business onboarding → campaign → admin approval → creator application →
  acceptance → code → counter redemption → approval → creator sees 0.550 JOD approved; tenant isolation).
- Fixes found while building the UI: failed/cancelled payouts that had netted a clawback now restore the clawback
  (previously the creator's available balance was left short and later payouts failed) — regression tested;
  campaign reviewers can read campaigns awaiting review (without member-only fields).

- Phase 18 (hardening/QA): OpenAPI-driven authorization sweeps (anonymous 401, cross-tenant, admin 403), MFA TOTP
  flow, fail-closed credential rate limits during Redis outages, metrics token enforcement, failed-sign-in metric,
  WCAG 2.1 AA checks (axe) with fixes, dependency audit clean and blocking in CI, load scenarios with correctness
  checks, backup/restore drill in CI, crash-recovery tests (webhook worker, Redis outage, outbox, payout worker) with
  sweeper/lease fixes, SMTP delivery test after the nodemailer 10 upgrade — TESTED.
- Phase 19 (deployment): multi-target Dockerfile (api/worker/web/migrate; non-root, health checks, prod-only deps,
  optional build CA secret), CI `images` job (build → migrate empty DB in production mode → staging containers →
  smoke test), Prometheus alert rules + scrape config, smoke-test script, audited first-admin bootstrap script,
  production seed never publishes placeholder legal docs and sign-up fails closed, TRUST_PROXY hop counts. Docs:
  ARCHITECTURE, API, ENVIRONMENT, SECURITY, INTEGRATIONS, TESTING, DEPLOYMENT, RECOVERY, ADR-0001..0005 — VERIFIED
  locally (images built, migrate job on empty DB, smoke test passed).

## Next task
Final release-gate review (spec §39) and final report. After that: owner decisions in docs/DECISIONS.md and
provider credentials (below) are required before a production launch.

## Tests
- Passing: domain (53), config (8), database (9), API integration (110), api-client (3), web unit (3), Playwright
  E2E + accessibility (30), load (3). Failing: none.

## Known issues / blockers
- None blocking. External credentials required for live providers (see below). Decisions pending: docs/DECISIONS.md.

## External credentials required (IMPLEMENTED — CREDENTIAL REQUIRED)
- PayPal Payouts (PAYPAL_CLIENT_ID/SECRET) · SMTP email · S3-compatible storage · Shopify app webhook secret/Admin API
  token per merchant · (optional) AWS Secrets Manager backend (NOT CONFIGURED in this build).

## Environment notes
- Dev container: Node 22.22, pnpm 10.33, PostgreSQL 18.6 in Docker (`codek-pg`), Redis 7.0 system service.
- E2E locally: create/migrate/seed a `codek_e2e` database, build (`pnpm build`), then
  `DATABASE_URL=…/codek_e2e PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e`. The E2E helper refuses to
  write to databases not named codek_e2e/codek_test/codek_ci; E2E uses the `codek-e2e` Redis namespace.
