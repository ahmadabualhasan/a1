# ADR-0003: Better Auth used as a library behind CODEK's own auth routes

- Status: Accepted (D-010)
- Date: 2026-09-29

## Context
The spec requires Better Auth, database-backed sessions, email verification, password reset, TOTP MFA for admins,
session revocation, legal acceptance at sign-up, audit logging and CODEK's standard response envelopes. Mounting Better
Auth's handler directly would expose its own route shapes and error formats and bypass CODEK's validation, rate limits,
audit and envelope conventions.

## Decision
- CODEK controllers under `/api/v1/auth/*` call `auth.api.*` with `asResponse: true` and forward `Set-Cookie`.
- Prisma adapter; sessions stored in PostgreSQL; cookie prefix `codek`; HttpOnly, SameSite=Lax, Secure in
  staging/production; IP addresses are not stored raw (hashed via database hooks).
- Twofactor plugin for TOTP + single-use backup codes; admin MFA enforced by the global guard in staging/production.
- Sign-up requires accepting every published required legal document (and is refused while any is unpublished).

## Consequences
- Uniform envelopes, rate limits, CSRF origin checks and audit entries for all auth flows.
- Better Auth upgrades must be re-verified against `apps/api/test/auth.test.ts` and `security.test.ts` (MFA flow).
