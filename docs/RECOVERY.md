# Backup, recovery and incident runbooks

## Backups

| What | How | Frequency (recommended default — confirm with the owner, see DECISIONS D-021) | Retention |
|---|---|---|---|
| PostgreSQL (all business, financial and audit data) | Managed PITR (WAL archiving) **and** logical dumps via `infra/scripts/db-backup.sh` (custom format + SHA-256) | PITR continuous; logical daily | PITR 7–35 days; daily 35 days, monthly 12 months |
| Object storage (QR codes, uploads, evidence) | Bucket versioning + cross-region replication | continuous | 90 days of versions |
| Redis | Not backed up: queues are rebuilt from PostgreSQL by the sweepers (ADR-0005) | — | — |
| Secrets | Secret manager's own versioning; `SECRETS_MASTER_KEY` escrowed offline by two people | on change | indefinitely |

Targets (recommended defaults): **RPO ≤ 5 minutes** (PITR), **RTO ≤ 2 hours**.

Dumps contain personal and financial data: store them encrypted (SSE-KMS), restrict access to the operations group,
never copy them to laptops or tickets. Losing `SECRETS_MASTER_KEY` makes stored integration credentials unrecoverable
(merchants would need to reconnect) — escrow it.

## Restore procedure

1. Create an empty database (never restore over a live one; `db-restore.sh` refuses non-empty targets).
2. `TARGET_DATABASE_URL=… infra/scripts/db-restore.sh codek-<db>-<timestamp>.dump` (verifies the checksum first).
3. Verify: `psql "$TARGET" -f infra/scripts/db-verify.sql` — expect `ledger_unbalanced_entries=0`,
   `audit_chain_first_broken_seq=none`, migrations count equal to the repository's.
4. Point the api/worker at the restored database, run the `migrate` job (no-op if current), start workers.
5. Sweepers re-queue webhook events, payouts and outbox rows from PostgreSQL automatically; confirm queue depths drain.
6. Run provider reconciliation for the gap window (Admin → Integrations) to recover events providers sent while down;
   providers retry webhooks, and duplicates are ignored by idempotency keys.

**Drill:** `infra/scripts/db-restore-drill.sh` performs backup → restore into a scratch database → compares integrity
reports. CI runs it on every push after the E2E journey. Run it against staging monthly and record the result.

## Runbooks

### Ledger invariant failure
Alert `LedgerInvariantFailure` (`codek_ledger_invariant_ok == 0`). Severity: page.
1. Pause payouts: Admin → Settings → `payouts.enabled` = false (audited). Do **not** edit ledger rows (immutable by
   design; triggers reject it).
2. Admin → Ledger & payouts → Reconciliation → run; inspect `ledger_unbalanced_entries` and currency nets with
   `infra/scripts/db-verify.sql`.
3. Identify the offending entries (entry type/reference); correct with dual-approved manual adjustments or reversals.
   Every correction is a new entry with a reason.
4. Re-run the check; re-enable payouts; write a post-incident note.

### Worker down
Alerts `LedgerInvariantNotReported`, `WebhookBacklog`, `QueueBacklog`.
1. Check worker pods and `/health/ready`; check Redis connectivity.
2. Restart workers. Nothing is lost: webhook raw payloads, outbox rows and payout attempts are in PostgreSQL; sweepers
   re-queue `received/queued/failed` webhook events, events stuck `processing` > 15 min, expired outbox leases, and
   payouts in `requested/processing`.
3. Confirm backlog gauges fall to normal.

### Redis outage
Webhooks are still accepted and stored (`queued: false`); sessions live in PostgreSQL so signed-in users keep working.
Rate limiting fails **closed** for credential endpoints (sign-in, sign-up, MFA, backup codes, password reset return
503 with `Retry-After`) and open for other traffic. After Redis returns, sweepers re-queue work within a minute.

### Webhook dead letters
Alert `WebhookDeadLetters`.
1. Admin → Integrations & webhooks → Webhook events → state `dead letter`; read the error.
2. Mapping/validation errors: fix the adapter or ask the merchant to fix their payload, deploy, then **Replay** (uses
   the stored raw payload; idempotent).
3. Signature failures are never replayable (possible spoofing) — investigate the integration's secret.

### Payout provider outage
Alert `PayoutFailuresElevated`.
1. Check provider status. Retryable failures back off automatically; final failures return the amount (and any
   netted clawback) to the creator's available balance.
2. For a prolonged outage, set `payouts.enabled` = false so creators get a clear message instead of failures.
3. After recovery, `requested/processing` payouts are swept and resumed; verify no duplicate `payout_paid` entries
   (idempotency keys per payout).

### Reconciliation differences
Alert `ReconciliationDifferences`. Admin → Integrations & webhooks → Reconciliations → items. Replay missing events,
record accepted differences with a note, or request a dual-approved adjustment. Never adjust balances outside the
ledger.

### Suspected account compromise
Admin → Users → Suspend (ends all sessions immediately). Review the audit log for the actor; rotate affected
integration secrets (custom integrations: Rotate secret); reset MFA only after identity is re-verified.

### Secret rotation
- `AUTH_SECRET`: rotating signs out every user — schedule it.
- `HASH_PEPPER`: rotation breaks correlation of historical hashed IP/customer references; only rotate on compromise.
- `SECRETS_MASTER_KEY`: requires re-encrypting stored credentials (not automated in this build — see
  KNOWN_LIMITATIONS); rotate only with a planned migration.
- `METRICS_TOKEN`, SMTP, PayPal, S3 credentials: rotate in the secret manager and restart the affected services.
