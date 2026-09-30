# ADR-0001: pnpm monorepo with a pure domain package

- Status: Accepted
- Date: 2026-09-29

## Context
The specification fixes the stack (TypeScript, Next.js App Router, NestJS, PostgreSQL, Prisma, Better Auth, Redis,
BullMQ, S3-compatible storage, REST `/api/v1`, OpenAPI, typed client). Financial rules (money, commission, fees,
attribution, ledger postings, state machines) must be identical wherever they run, and must be testable without a
database.

## Decision
- One pnpm workspace: `apps/{api,worker,web}`, `database/` (Prisma schema, migrations, seed), `packages/{domain,config,
  api-client,ui,testing,eslint-config,tsconfig}`.
- `@codek/domain` is framework-free: bigint minor units + decimal.js for rates, explicit rounding modes, commission and
  fee engines, deterministic attribution, state machines, balanced posting templates, permission catalogue, event
  schemas, URL/SSRF safety. The API and worker import it; the web app never computes money.
- `@codek/config` validates every process's environment with production guards.
- The typed client is generated from the API's OpenAPI document (`pnpm --filter @codek/api openapi`).

## Consequences
- One lockfile, one CI pipeline, shared lint/tsconfig. Workspace packages compile to `dist` and are bundled per service
  with `pnpm deploy` for container images.
- Domain logic has fast unit tests; integration tests exercise it through the API against real PostgreSQL/Redis.
