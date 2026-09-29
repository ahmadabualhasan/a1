# CODEK decision log

Format per spec §34: question · why it matters · options · impact · current safe default · status.
Status values: **DECIDED** (by spec or ADR), **IMPLEMENTED DEFAULT — CONFIRM** (conservative default in code, owner
should confirm), **DECISION NEEDED** (blocked or feature-flagged until the owner decides).

| ID | Topic | Current behaviour | Status |
|---|---|---|---|
| D-001 | NestJS major version | NestJS 11.x (CommonJS). NestJS 12 is ESM-only; 11 keeps the tested ecosystem (swagger, terminus, nestjs-zod, SWC test runner). See ADR-0002. | DECIDED |
| D-002 | Prisma version | Prisma ORM 7.10.x stable with `@prisma/adapter-pg`; Prisma 8 is RC (spec §17.3). | DECIDED (spec) |
| D-003 | CODEK fee / take rate | Fee engine supports `none`, `percentage_of_commission`, `percentage_of_sale`. Seeded default plan is `none` (0 fee) until pricing is decided (spec §3.7 requires unit-economics modelling first). | DECISION NEEDED |
| D-004 | Conversion amount semantics | `gross` = subtotal before discount excl. tax/shipping; `discounted` = gross − discount; `net` = source net or gross − discount − other fees; tax/shipping added only when the rule includes them. | IMPLEMENTED DEFAULT — CONFIRM |
| D-005 | `custom` commission base | Rejected (`UNSUPPORTED_CONFIGURATION`); schema keeps the enum value for future use. | DECISION NEEDED |
| D-006 | Partial refund on a fixed commission | Fixed commission unchanged on partial refunds; fully reversed on full refund. | DECISION NEEDED |
| D-007 | CODEK fee on refunds | Fee reversed proportionally with the commission reversal (fee is 0 by default, D-003). | DECISION NEEDED |
| D-008 | `refund_behavior` semantics | `reverse`: reverse unpaid commission only; `clawback`: reverse unpaid and claw back paid commission (netted against future earnings); `none`: no change. | IMPLEMENTED DEFAULT — CONFIRM |
| D-009 | Node.js runtime | Production images pin Node 24 LTS (spec §17.3). The build container runs Node 22; `engines` allows ≥22.12. | DECIDED |
| D-010 | Better Auth integration | Better Auth is used as a library behind CODEK's own `/api/v1/auth/*` controllers (community NestJS adapter avoided). DB-backed sessions. Better Auth stores the random session token (cookie is HMAC-signed); column named `token` instead of `token_hash`. | DECIDED (ADR-0003) |
| D-011 | Campaign review gate | `publish` moves a campaign to `pending_review`; businesses with `verified` status are auto-approved to `published` when the `campaigns.auto_publish_verified` setting is on (default on). Otherwise an admin approves. | IMPLEMENTED DEFAULT — CONFIRM |
| D-012 | Conversion approval | Campaign setting `conversionApprovalMode`: `auto_verified` (default) approves a commission when a verified source reports ORDER_PAID/ORDER_COMPLETED/BOOKING_COMPLETED or a controlled redemption is recorded; `manual` requires the business to approve. Self-reported conversions are never auto-approved. | IMPLEMENTED DEFAULT — CONFIRM |
| D-013 | Hold period | No platform default is invented: every campaign must specify `holdPeriodDays` (0–365), snapshotted into partnership terms. Availability = approved ∧ funded ∧ now ≥ occurred_at + hold. | DECIDED |
| D-014 | Invitations entity | Added `campaign_invitations` table (spec requires invitation flow, entity list omits a table). | DECIDED |
| D-015 | Platform role assignment | Added `user_roles` for platform-scope roles and `users.account_type` (business / creator / admin). Admins cannot self-register; bootstrap via CLI. | DECIDED |
| D-016 | Payout allocation | Payouts are composed of whole available commissions (oldest first) up to the requested amount, net of outstanding clawbacks. | IMPLEMENTED DEFAULT — CONFIRM |
| D-017 | Minimum payout threshold | Stored in system setting `payouts.minimum_minor` per currency. Seeded value 0 until decided. | DECISION NEEDED |
| D-018 | Funding allocation order | Merchant funding is allocated FIFO to the oldest approved, unfunded commissions (same currency). | IMPLEMENTED DEFAULT — CONFIRM |
| D-019 | Multi-currency | No FX conversion in V1. Ledger accounts are per currency; a commission rule with a currency rejects conversions in another currency (flagged for review). | DECIDED (safe default) |
| D-020 | Payout / funding provider for launch market | Provider abstraction implemented with a `sandbox` adapter (test only) and a PayPal Payouts adapter (credentials required). Provider choice for Jordan requires legal/provider review (spec §10.7). | DECISION NEEDED (credential + legal) |
| D-021 | Customer data retention period | Retention job and settings exist; seeded retention periods are placeholders flagged in settings until counsel confirms (spec §14). | DECISION NEEDED |
| D-022 | Legal document wording | Versioned legal document records are seeded with placeholder content marked DRAFT; real wording requires counsel. | DECISION NEEDED |
