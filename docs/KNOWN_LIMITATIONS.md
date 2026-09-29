# Known limitations

Only real, current limitations are listed. Updated at every checkpoint.

- **External providers not configured:** PayPal payouts, SMTP email, S3 object storage and Shopify require owner
  credentials. Sandbox/local adapters are used in development and tests and are refused in production by config validation.
- **Attribution is not perfect** (spec §6.7): cross-device journeys, cookie/consent restrictions and incomplete merchant
  data can prevent attribution. CODEK never claims 100% attribution.
- **Legal/compliance:** legal documents are placeholders; Jordan PDPL obligations, retention periods and payment-provider
  structure require counsel review before production (see D-020..D-022).
