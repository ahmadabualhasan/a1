# Release gates (spec §32) — status at commit dae10bf (2026-09-30)

| Gate | Status | Evidence |
|---|---|---|
| All critical unit/integration/E2E tests pass | ✅ PASS | CI build-test + e2e jobs; local: API 113, domain 53, database 9, config 8, api-client 3, web 3, Playwright 30 |
| Webhook security / replay / idempotency | ✅ PASS | `webhooks.test.ts`, load test (duplicate deliveries), `recovery.test.ts` |
| Financial commission / refund / clawback / payout | ✅ PASS | `pipeline.test.ts`, `payouts.test.ts` (incl. clawback netting reversal), domain commission tests |
| Ledger invariants | ✅ PASS | DB triggers + `invariants.test.ts`; invariant checks after load/recovery; hourly monitor + alert |
| Tenant isolation and authorization | ✅ PASS | OpenAPI sweeps in `security.test.ts` (401 / cross-tenant / admin 403), per-module isolation tests, E2E isolation step |
| Security review | ✅ COMPLETED (automated + code review) — external penetration test recommended | docs/SECURITY.md; fixes landed: metrics token, fail-closed credential limits, auth failure metric, legal fail-closed, dependency audit blocking |
| Backup/restore test | ✅ PASS | `infra/scripts/db-restore-drill.sh` runs in CI after the E2E journey |
| Staging UAT | ⏳ OWNER ACTION | Requires a staging environment and business/creator testers |
| Monitoring/alerts configured | ✅ DEFINED — deploy with Prometheus/Alertmanager | `infra/monitoring/alerts.yml` covers §33.2 signals (auth failures, API errors/latency, webhook backlog/failures, reconciliation differences, ledger invariants, funding shortfalls, payout failures, fraud anomalies, API down) |
| Production smoke tests | ✅ SCRIPT + CI (containers) — ⏳ run against production at launch | `infra/scripts/smoke-test.sh`; CI `images` job runs it against the built containers |
| Rollback plan tested/documented | ✅ DOCUMENTED — forward-only, expand/contract migrations; image rollback | docs/DEPLOYMENT.md "Migrations and rollback" |
| Reconciliation operational before financial launch | ✅ IMPLEMENTED — needs live provider credentials | nightly ledger + provider reconciliation, admin resolution UI |
| Legal/compliance review for the target market | ⏳ OWNER / COUNSEL ACTION | D-020..D-022: counsel-approved legal documents (production sign-up stays closed until published), Jordan PDPL review, payment-provider structure |

## Required before production launch (cannot be completed from code)
1. Owner decisions marked DECISION NEEDED in docs/DECISIONS.md (fee pricing, minimum payout, retention periods, legal
   wording, payment provider structure, subscription billing collection).
2. Credentials: PayPal Payouts, SMTP, S3-compatible storage, per-merchant Shopify secrets (docs/INTEGRATIONS.md).
3. Counsel-approved legal documents published in Admin → Legal.
4. Staging environment, UAT sign-off, first administrator bootstrap with MFA, monitoring stack deployment.
