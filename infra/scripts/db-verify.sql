-- Integrity report for a CODEK database. Run against the source and a restored copy; the outputs must match.
\pset format unaligned
\pset tuples_only on
SELECT 'migrations_applied=' || count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT 'ledger_unbalanced_entries=' || count(*) FROM (
  SELECT ledger_entry_id FROM ledger_entry_lines GROUP BY ledger_entry_id
  HAVING sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE 0 END) <> sum(CASE WHEN direction = 'credit' THEN amount_minor ELSE 0 END)
) u;
SELECT 'ledger_currency_' || currency || '_net=' || sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END)
  FROM ledger_entry_lines GROUP BY currency ORDER BY currency;
SELECT 'audit_chain_first_broken_seq=' || coalesce(codek_verify_audit_chain()::text, 'none');
SELECT 'audit_last_hash=' || coalesce((SELECT hash FROM audit_logs ORDER BY seq DESC LIMIT 1), 'none');
SELECT 'rows_' || t || '=' || n FROM (
  SELECT 'users' AS t, count(*) AS n FROM users UNION ALL
  SELECT 'businesses', count(*) FROM businesses UNION ALL
  SELECT 'creators', count(*) FROM creators UNION ALL
  SELECT 'campaigns', count(*) FROM campaigns UNION ALL
  SELECT 'partnerships', count(*) FROM partnerships UNION ALL
  SELECT 'partnership_terms_snapshots', count(*) FROM partnership_terms_snapshots UNION ALL
  SELECT 'conversions', count(*) FROM conversions UNION ALL
  SELECT 'commission_calculations', count(*) FROM commission_calculations UNION ALL
  SELECT 'ledger_entries', count(*) FROM ledger_entries UNION ALL
  SELECT 'ledger_entry_lines', count(*) FROM ledger_entry_lines UNION ALL
  SELECT 'payouts', count(*) FROM payouts UNION ALL
  SELECT 'webhook_events', count(*) FROM webhook_events UNION ALL
  SELECT 'audit_logs', count(*) FROM audit_logs
) x ORDER BY t;
