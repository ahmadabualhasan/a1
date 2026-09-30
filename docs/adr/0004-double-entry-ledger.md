# ADR-0004: Double-entry ledger as the financial source of truth, enforced in the database

- Status: Accepted
- Date: 2026-09-29

## Context
CODEK records obligations between businesses, creators and the platform (it is not a wallet or escrow). Balances must be
explainable, idempotent under retries and duplicate provider events, and impossible to silently rewrite.

## Decision
- Every money movement is a balanced posting (`@codek/domain` templates) written with an idempotency key
  (`ON CONFLICT DO NOTHING`); balances are derived from lines, never stored.
- PostgreSQL enforces invariants: deferred constraint trigger for balanced entries, ledger/snapshot/decision/raw-webhook
  immutability, no-delete history tables, TRUNCATE guard, frozen commission amounts, audit hash chain with
  `codek_verify_audit_chain()`.
- Corrections are new entries (reversals, clawbacks, netting reversals, dual-approved manual adjustments).
- Commission lifecycle: pending → approved → funded → available → payout_requested → processing → paid, with
  reversed/clawback branches; payouts settle whole commissions (D-016) and net outstanding clawbacks.

## Consequences
- Hourly invariant monitoring (`codek_ledger_invariant_ok`) and the backup/restore drill verify integrity.
- Schema changes touching financial tables need expand/contract migrations (docs/DEPLOYMENT.md).
