# ADR-0002: NestJS 11 on CommonJS (not NestJS 12)

- Status: Accepted (D-001)
- Date: 2026-09-29

## Context
NestJS 12 is ESM-only. At build time the surrounding ecosystem used here (`@nestjs/swagger`, `nestjs-zod`, the SWC-based
Vitest transform used for decorator metadata, BullMQ integration) was verified on NestJS 11. Better Auth ships as ESM.

## Decision
Use NestJS 11.x compiled to CommonJS with `module`/`moduleResolution: nodenext`. ESM-only dependencies (Better Auth)
are loaded through Node's `require(esm)` support (Node ≥ 22.12, enforced via `engines`).

## Consequences
- Stable decorator metadata and test tooling; no dual-package hazards in the API.
- Upgrading to NestJS 12 later is a contained change (module format + test transform), tracked in KNOWN_LIMITATIONS.
