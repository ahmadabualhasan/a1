# CODEK — Implementation status (resume state)

_Last updated: 2026-09-29_

## Resume instructions (read first)
1. `git log --oneline | head -20`, `git status` on branch `claude/compassionate-allen-kn8zop`.
2. Start deps: `docker compose -f infra/docker-compose.yml up -d` (or local PostgreSQL 18 + Redis), `cp .env.example .env`
   and fill local values, then `pnpm install && pnpm db:migrate && pnpm db:seed`.
3. Health: `pnpm verify` (build + typecheck + lint + secret scan) and `pnpm test` must be green before new work.
4. Continue at **Next task** below. Never restart completed phases.

## Current phase / task
- Phase: 15 — Analytics & reporting (Phases 1–14 complete).
- Task: KPI/funnel endpoints with provenance and verified/self-reported breakdown, ledger reconciliation of totals,
  CSV exports, daily aggregation job.

## Last successful checkpoint
- CI run #8 (commit c4566eb, Phase 12) — **success**. Run #7 failed on a test-file type error that was fixed in c4566eb.
- Local: `pnpm verify` clean; API integration tests 78/78, domain 53/53, config 5/5, database 8/8.

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

## Next task
Phase 15 analytics → 16 billing/pricing → 17 web app + api-client → 18 hardening/E2E/load/backup → 19 deployment.

## Tests
- Passing: domain (53), config (5), database invariants (8), API integration (89). Failing: none.

## Known issues / blockers
- None blocking. External credentials required for live providers (see below). Decisions pending: docs/DECISIONS.md.

## External credentials required (IMPLEMENTED — CREDENTIAL REQUIRED)
- PayPal Payouts (PAYPAL_CLIENT_ID/SECRET) · SMTP email · S3-compatible storage · Shopify app webhook secret/Admin API
  token per merchant · (optional) AWS Secrets Manager backend (NOT CONFIGURED in this build).

## Environment notes
- Dev container: Node 22.22, pnpm 10.33, PostgreSQL 18.6 in Docker (`codek-pg`), Redis 7.0 system service.
