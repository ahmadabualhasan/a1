# Known limitations

Only real, current limitations are listed. Updated at every checkpoint.

- **External providers not configured:** PayPal payouts, SMTP email, S3 object storage and Shopify require owner
  credentials. Sandbox/local adapters are used in development and tests and are refused in production by config validation.
- **Attribution is not perfect** (spec §6.7): cross-device journeys, cookie/consent restrictions and incomplete merchant
  data can prevent attribution. CODEK never claims 100% attribution.
- **Legal/compliance:** legal documents are placeholders; Jordan PDPL obligations, retention periods and payment-provider
  structure require counsel review before production (see D-020..D-022).
- **Returned payouts** are recorded by finance admins (dual approval) from the provider's notice; automatic
  detection from provider return webhooks is not wired (needs live PayPal webhook credentials/events).
- **Payout granularity**: payouts settle whole commissions (D-016); a requested amount smaller than the oldest
  available commission cannot be paid partially.
- **Legal documents in production** are created as drafts by the seed; sign-up stays closed until an administrator
  publishes counsel-approved versions of every required document (Admin → Legal).
- **Upload malware scanning is opt-in** (`MALWARE_SCANNER=clamav` + a clamd service); with the default `none` only the
  MIME allowlist, magic-byte sniffing and size limit apply.
- **Secret backends / error reporting**: only the local AES-256-GCM secret store is implemented; `aws-secrets-manager`
  and `SENTRY_DSN` are rejected at startup rather than silently ignored.
- **Web → API proxy and client IPs**: the Next.js rewrite proxy forwards `X-Forwarded-For` unchanged; correct per-IP
  rate limits require an ingress that sets it and a matching `TRUST_PROXY` hop count (docs/DEPLOYMENT.md).
- **`API_INTERNAL_URL` is build-time** for the web image (Next.js rewrites); use a stable internal service name.
- **Webhook processing throughput** is serialized per order (advisory lock) — measured ~31 events/s per worker
  process in the load test; scale with worker replicas.
- **Demo data**: there is no demo-data seeder; use the E2E journey or the UI to create sample data.
- **NestJS 11 (CommonJS)**: moving to NestJS 12 (ESM-only) is a future upgrade (ADR-0002).
