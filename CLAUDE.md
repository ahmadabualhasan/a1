# CLAUDE.md — CODEK agent instructions

1. `docs/CODEK_MASTER_BUILD_SPECIFICATION.md` is the authoritative source of truth. Do not invent product, financial,
   attribution, legal or security rules; record open questions in `docs/DECISIONS.md` as **DECISION NEEDED**.
2. On every session start: read `docs/IMPLEMENTATION_STATUS.md` (resume point), `git log --oneline | head`, then run the
   health checks listed there before continuing from the exact unfinished task.
3. Loop per slice: inspect → plan → implement → migrate → test → security check → lint/typecheck → review diff →
   update docs/status → commit → push.
4. Never: float money, client-side financial authority, mutating ledger history, frontend authorization, committed secrets,
   skipping/deleting tests to get green.
5. Layout: `apps/api` (NestJS modular monolith, `/api/v1`), `apps/worker` (BullMQ workers reusing api modules),
   `apps/web` (Next.js App Router), `packages/domain` (pure financial/attribution/state logic — put business rules here),
   `database` (Prisma schema, migrations, seed, SQL invariants), `packages/api-client` (typed client from OpenAPI).
6. Commands: `pnpm install`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm build`, `pnpm test`,
   `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`. Local deps: `docker compose -f infra/docker-compose.yml up -d`.
