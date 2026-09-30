# Security

This document maps CODEK's controls to the threats in the specification (OWASP ASVS/Top 10 oriented). Every control
listed here is covered by an automated test unless marked otherwise.

## Identity and sessions
- Better Auth behind CODEK routes (ADR-0003). Passwords ≥ 10 chars; email verification required outside development;
  generic errors that do not reveal whether an email exists (`auth.test.ts`).
- DB-backed sessions; cookies `HttpOnly`, `SameSite=Lax`, `Secure` in staging/production; session list and
  revoke-others; suspension revokes all sessions immediately.
- TOTP MFA with single-use backup codes and lockout after repeated failures; required for administrators in
  staging/production (`security.test.ts` exercises enable → sign-in challenge → wrong/right code → backup code reuse).
- First administrator only via the audited break-glass script; further grants are dual-approved.

## Authorization and tenant isolation
- Global `AuthGuard` (deny by default; public routes are an explicit allowlist) + `AccessService` object checks:
  cross-tenant resources return 404, missing permissions 403, platform permissions for `/admin/*`.
- OpenAPI-driven sweeps: every non-public operation returns 401 anonymously; every `{businessId}` operation fails for
  another tenant; every admin operation returns 403 for creator and business accounts (`security.test.ts`).
- Property-level authorization: creators never see customer PII, merchant-internal fields or other creators' data;
  businesses never see creator payout details (`profiles.test.ts`, `pipeline.test.ts`).
- Sensitive admin actions (manual ledger adjustments, commission reversals, re-attribution, platform role grants,
  anonymization) require a second administrator; requesters cannot approve their own requests.

## Input, output and transport
- Zod validation on every body/query (machine-readable errors); strict schemas for money (integer minor units) and
  rates (decimal strings); never trust client-supplied financial amounts — commissions are computed server-side from
  frozen partnership snapshots.
- Standard error envelope with request id; no stack traces or internals in responses.
- Helmet headers on the API; the web app sets CSP (`frame-ancestors 'none'`, `default-src 'self'`), X-Frame-Options
  DENY, nosniff, strict Referrer-Policy, Permissions-Policy (E2E asserts).
- CSRF: cookie-authenticated state-changing requests must carry an allowed `Origin`.
- Rate limits per IP/user in Redis; credential endpoints fail closed if Redis is unavailable. Correct client IPs
  require the ingress/`TRUST_PROXY` setup in docs/DEPLOYMENT.md.

## Webhooks, redirects and outbound calls
- Provider signatures verified on the raw body (HMAC, constant-time compare), timestamp tolerance and replay
  protection, idempotent storage before processing; test mode before live.
- Referral redirects only to destinations on the business's allowlisted hosts (re-validated at redirect time).
- `SafeHttpClient` for server-side fetches: egress host allowlist, private/link-local address blocking, no redirects
  (SSRF).

## Files
- MIME allowlist plus magic-byte sniffing, size limit, optional ClamAV scan before storage (fail closed; infected
  uploads audited), private storage keys, downloads authorized per object.

## Secrets and data protection
- Secrets only from the environment/secret manager; `.env` is git-ignored; CI secret scan
  (`infra/scripts/check-secrets.sh`); no secrets in images (build CA passed as a BuildKit secret only).
- Integration credentials encrypted at rest (AES-256-GCM, `SECRETS_MASTER_KEY`), shown once at creation.
- IPs, user agents and customer references stored as peppered hashes; logs redact cookies, authorization headers,
  passwords, tokens and secrets; emails masked in logs.
- Privacy requests (access, correction, deletion, portability); anonymization retains financial and audit history as
  required by law.

## Integrity and audit
- Double-entry ledger with database-enforced invariants and immutable history (ADR-0004); audit log hash chain with
  on-demand verification (Admin → Audit log) and in the restore drill.

## Dependencies and supply chain
- Exact versions (`save-exact`), frozen lockfile in CI, `pnpm audit` fails the build on high/critical advisories,
  optional peers trimmed from server bundles (`.pnpmfile.cjs`).

## Reporting
Report vulnerabilities privately to the security contact configured by the operator (not yet defined — see
DECISIONS). Do not open public issues for security reports.

## Known gaps
See docs/KNOWN_LIMITATIONS.md (e.g. WAF/bot management is an infrastructure responsibility).
