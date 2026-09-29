# Known limitations

Only real, current limitations are listed. Updated at every checkpoint.

- **External providers not configured:** PayPal payouts, SMTP email, S3 object storage and Shopify require owner
  credentials. Sandbox/local adapters are used in development and tests and are refused in production by config validation.
- **Attribution is not perfect** (spec §6.7): cross-device journeys, cookie/consent restrictions and incomplete merchant
  data can prevent attribution. CODEK never claims 100% attribution.
- **Legal/compliance:** legal documents are placeholders; Jordan PDPL obligations, retention periods and payment-provider
  structure require counsel review before production (see D-020..D-022).
- **Returned payouts** (provider reverses a completed payout): the ledger posting exists (`payout_returned`) but no
  automated workflow is wired yet; handle via admin adjustment until provider-specific return events are defined.
- **Payout granularity**: payouts settle whole commissions (D-016); a requested amount smaller than the oldest
  available commission cannot be paid partially.
