# CODEK — Implementation status (resume state)

_Last updated: 2026-09-29_

## Current phase
Phase 1 — Repository, tooling, environment, monorepo, configuration, Docker, CI foundation.

## Status legend
IMPLEMENTED · TESTED · VERIFIED · BLOCKED · NOT CONFIGURED · CREDENTIAL_REQUIRED

## Completed
- Monorepo (pnpm workspaces): apps/{api,worker,web}, packages/{domain,config,api-client,ui,testing,eslint-config,tsconfig}, database/.
- `@codek/domain`: money (bigint minor units, decimal.js), commission engine, fee engine, attribution engine,
  code normalization/generation, state machines, double-entry postings, RBAC catalogue, normalized event contracts,
  URL/SSRF safety, hashing — TESTED (vitest).
- `@codek/config`: validated environment schema with production guards — TESTED.
- Local infra: docker compose (PostgreSQL 18, Redis 7, optional MinIO/Mailpit), CI workflow, secret scan script.

## Next task
Phase 2 — Prisma schema for the full entity inventory (spec §19), migrations, DB-level invariants, seed.

## Environment notes
- Local dev container: Node 22.22, pnpm 10.33, PostgreSQL 18.6 via Docker (`codek-pg`), Redis 7.0 (system service).
