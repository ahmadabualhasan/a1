# CODEK — Implementation status (resume state)

_Last updated: 2026-09-29_

## Current phase
Phase 3 — Authentication, sessions, users, roles, permissions, RBAC (Phases 1–2 complete).

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

## Next task
Phase 3 — API app (NestJS 11): bootstrap, error envelope, request ids, logging, Better Auth, sessions, RBAC guards.

## Environment notes
- Local dev container: Node 22.22, pnpm 10.33, PostgreSQL 18.6 via Docker (`codek-pg`), Redis 7.0 (system service).
