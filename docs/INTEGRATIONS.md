# Integrations and external services

Status legend: **IMPLEMENTED** · **IMPLEMENTED — CREDENTIAL REQUIRED** (code and tests exist; live use needs
credentials the operator must provide) · **NOT IN THIS BUILD**.

| Service | Status | Configuration |
|---|---|---|
| Custom signed webhooks (any website/app/POS/booking system) | IMPLEMENTED | Business connects in *Integrations*; secret shown once |
| Shopify orders (webhooks + reconciliation) | IMPLEMENTED — CREDENTIAL REQUIRED | Per merchant: shop domain, webhook signing secret, optional read-only Admin API token |
| PayPal Payouts | IMPLEMENTED — CREDENTIAL REQUIRED | `PAYOUT_PROVIDER=paypal`, `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_ENVIRONMENT` |
| Sandbox payout/funding provider | IMPLEMENTED (non-production only) | default outside production |
| Bank-transfer funding | IMPLEMENTED | Finance admin confirms receipt (Admin → Ledger & payouts → Fundings) |
| SMTP email | IMPLEMENTED — CREDENTIAL REQUIRED | `EMAIL_DRIVER=smtp` + SMTP_* |
| S3-compatible object storage | IMPLEMENTED — CREDENTIAL REQUIRED | `STORAGE_DRIVER=s3` + S3_* |
| Subscription billing payment collection | NOT IN THIS BUILD (decision D-003) | invoices are generated; collection pending |
| AWS Secrets Manager backend, error-reporting SDK | NOT IN THIS BUILD | rejected at startup if configured |

## Custom webhook contract
`POST {API_PUBLIC_URL}/api/v1/webhooks/custom` with JSON body and headers:
- `X-Codek-Integration-Id`: integration id
- `X-Codek-Event-Id`: unique id per event (retries reuse it — duplicates are acknowledged, not reprocessed)
- `X-Codek-Timestamp`: unix seconds (must be within `WEBHOOK_TOLERANCE_SECONDS`)
- `X-Codek-Signature`: `v1=` + hex HMAC-SHA256 of `"{timestamp}.{raw body}"` with the signing secret
- `X-Codek-Test: true` for test events (validated, never recorded as sales)

Body (normalized order event, `packages/domain/src/events.ts`): `eventType`, `externalEventId`, `externalRef` (order
id), `occurredAt`, `currency`, `grossMinor`, optional `discountMinor`, `taxMinor`, `shippingMinor`, `otherFeeMinor`,
`netMinor`, `totalMinor`, `refundedTotalMinor` (cumulative), `discountCodes[]`, `referralClickId` (the `codek_ref`
value appended by the redirect), `referralToken`, `conversionType`, `lineItems[]`.
Responses: `202 { received, queued }` for new events, `200` for duplicates, `401` for bad signatures/replays.

Lifecycle: connect (test mode) → run connection test → send a signed test event → **Go live**. Pause keeps events
stored; disconnect revokes credentials and keeps history. Secrets can be rotated (old secret stops immediately).

## Shopify
Configure webhooks for `orders/create`, `orders/paid`, `orders/fulfilled`, `orders/cancelled` and `orders/updated`
(refunds are read from `orders/updated` as cumulative totals) pointing at `{API_PUBLIC_URL}/api/v1/webhooks/shopify` with the app's signing secret. With an Admin API token, *Reconcile orders* compares Shopify orders to CODEK conversions for a date range.

## Outbound calls
All server-side HTTP goes through `SafeHttpClient`: host allowlist (`OUTBOUND_HOST_ALLOWLIST`), private addresses
blocked, redirects refused, timeouts.
