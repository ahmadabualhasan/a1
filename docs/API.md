# API conventions

- Base path `/api/v1`; OpenAPI served at `/api/docs` outside production and exported to
  `packages/api-client/openapi.json` (`pnpm --filter @codek/api openapi`), from which the typed client is generated.
- Authentication: session cookie (`codek.session_token`, HttpOnly). State-changing cookie requests must send an allowed
  `Origin`. There are no API keys for end users in this build.
- Success: `{ "data": …, "meta": { "requestId", "pagination?": { total, limit, offset } } }`.
- Errors: `{ "error": { "code", "message", "details", "requestId" } }`. Codes: `VALIDATION_FAILED` (400, with
  `details.issues[{path,message}]`), `UNAUTHENTICATED` (401), `EMAIL_NOT_VERIFIED`, `MFA_REQUIRED`, `FORBIDDEN` (403),
  `NOT_FOUND` (404 — also used for resources in other tenants), `CONFLICT` / `VERSION_CONFLICT` (409),
  `INVALID_STATE_TRANSITION`, `BUSINESS_RULE_VIOLATION`, `UNSUPPORTED_CONFIGURATION`, `INSUFFICIENT_BALANCE` (422),
  `RATE_LIMITED` (429 + `Retry-After`), `FEATURE_DISABLED`, `SERVICE_UNAVAILABLE` (503).
- Pagination: `?limit` (1–100, default 25) and `?offset`.
- Money: integer minor units (`amountMinor`, JOD has 3 decimals) plus ISO currency; rates are decimal strings
  (`"0.15"` = 15%). Large values may be serialized as strings; clients must not do floating-point arithmetic.
- Optimistic concurrency: mutable resources carry `version`; PATCH must send it; stale writes get `VERSION_CONFLICT`.
- Idempotency: monetary POSTs (`/creator/payouts/request`, `/businesses/:id/funding`) require an `Idempotency-Key`
  header; retries with the same key return the original result.
- Timestamps are ISO-8601 with offset (UTC recommended).
- Webhooks (inbound): `POST /api/v1/webhooks/:provider` — see docs/INTEGRATIONS.md.
- Rate limits: `X-RateLimit-Limit/Remaining/Reset` headers on limited routes.
