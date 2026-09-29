# CODEK — Implementation status (resume state)

_Last updated: 2026-09-29_

## Current phase
Phase 8 — Tracking/attribution/conversions/ledger (Phases 1–7 complete).

## Status legend
IMPLEMENTED · TESTED · VERIFIED · BLOCKED · NOT CONFIGURED · CREDENTIAL_REQUIRED

## Completed
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

## Next task
Phases 8–10 — tracking (redirect + click API), attribution touchpoints/decisions, conversion pipeline, commission
engine persistence, double-entry ledger service.

## Environment notes
- Local dev container: Node 22.22, pnpm 10.33, PostgreSQL 18.6 via Docker (`codek-pg`), Redis 7.0 (system service).
