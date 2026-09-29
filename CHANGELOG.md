# Changelog

All notable changes to CODEK are documented here. Format: Keep a Changelog; versions follow SemVer once released.

## [Unreleased]
### Added
- Phase 1: monorepo foundation, shared TypeScript/ESLint config, validated environment schema, pure domain package
  (money, commission, attribution, ledger postings, state machines, permissions, events, URL safety), docker compose,
  CI workflow, secret scanning.
- Phase 2: full PostgreSQL schema with DB-level financial/audit invariants and reference seed.
- Phases 3–7: NestJS API, Better Auth sessions, RBAC/tenant isolation, profiles, catalog, campaigns, applications,
  invitations, partnerships with frozen snapshots, promotion codes/links/QR.
- Phases 8–11: tracking, deterministic attribution, conversion pipeline, commission lifecycle, double-entry ledger,
  funding, payouts with provider abstraction.
- Phase 12: integrations (custom signed webhooks, Shopify), webhook pipeline, reconciliation, outbox, worker, metrics.
- Phase 13: notifications, messaging, secure uploads, deliverables and content submissions.
### Fixed
- CI run #7: type error from a dynamic import in a test file; `pnpm verify` is now mandatory before pushing.
