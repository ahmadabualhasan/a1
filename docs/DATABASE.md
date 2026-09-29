# Database

PostgreSQL 18 · Prisma ORM 7.10 (`prisma-client` generator, `@prisma/adapter-pg`) · schema in
`database/prisma/schema.prisma` · migrations in `database/prisma/migrations`.

## Conventions
- UUID primary keys, snake_case tables/columns (`@@map`/`@map`), `timestamptz` in UTC. Campaign/business timezones
  are stored as IANA names where local time has business meaning.
- Money: `BigInt` minor units + `char(3)` ISO currency. Rates: `Decimal(9,6)` fractions (0.15 = 15%). Never float.
- JSONB only for extensible configuration and frozen snapshots; queryable fields are columns.
- Optimistic locking: `version` columns on mutable aggregates (campaigns, partnerships, conversions, commissions, payouts…).

## Entity inventory
All 60 spec §19 entities are implemented. Additions (see docs/DECISIONS.md): `user_roles` (D-015),
`campaign_invitations` (D-014), `two_factors` (Better Auth MFA), `partnership_events` (timeline, spec §12.5),
`promotion_code_redemptions` (usage/per-customer limits), `payout_items` (D-016), `encrypted_secrets` (local secret
store), `idempotency_keys` (API idempotency), `message_reports` (abuse reports), `pricing_plans`, split billing tables,
`data_subject_requests` (PDPL workflows), `analytics_daily_stats` (aggregates).

## Database-level invariants (`20260929215941_db_invariants`)
| Invariant | Mechanism |
|---|---|
| Every ledger entry balances (≥2 lines, Σdebit = Σcredit, single currency incl. account currency) | Deferred constraint triggers checked at COMMIT |
| Ledger entries/lines immutable | `BEFORE UPDATE OR DELETE` → exception |
| Commission amounts/snapshots frozen; reversal totals monotonic and bounded | trigger + CHECK |
| Commission rule versions immutable | trigger (edits create a new version) |
| Partnership term snapshots, attribution decisions immutable | trigger |
| Raw webhook evidence (payload, signature/replay results) immutable | trigger |
| History tables cannot be deleted (conversions, payouts, attempts, fundings, codes, partnerships, disputes…) | `BEFORE DELETE` → exception |
| TRUNCATE of financial/audit tables blocked unless `SET LOCAL codek.allow_truncate='on'` (test reset only) | statement trigger |
| Audit log append-only and hash-chained (tamper-evident); `codek_verify_audit_chain()` returns first broken seq | trigger + function |
| Promotion code identity immutable; revoked codes cannot be reactivated; `usage_count <= usage_limit` (concurrency-safe limit) | trigger + CHECK |
| Scoped uniqueness: `(business_id, normalized_code)`, `(business_id, source_system, external_ref)` for conversions, `(business_id, source, external_event_id)` for conversion events, ledger account `(owner_type, owner_key, account_type, currency)` | unique indexes |
| Non-negative money, ISO currency formats, lower-case emails, campaign caps/hold/window | CHECK constraints |

Balances are derived via the `ledger_account_balances` view; there is no mutable balance column.

## Operations
- Generate client: `pnpm db:generate` · Apply migrations: `pnpm db:migrate` (`prisma migrate deploy`) · Seed reference
  data (idempotent: RBAC, default fee plan, settings, placeholder legal docs): `pnpm db:seed`.
- New migration: edit schema → `pnpm --filter @codek/database exec prisma migrate dev --name <change> --create-only`,
  review SQL, apply. Never edit a migration that has been deployed to a shared environment.
- Tests: `pnpm --filter @codek/database test` uses `TEST_DATABASE_URL` (refuses DB names without test/e2e/ci).
