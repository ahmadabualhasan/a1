# Architecture

CODEK is a creator–business partnership marketplace with attribution infrastructure and a commission/payout ledger.
It records obligations and orchestrates payouts through licensed providers; it is not a wallet or escrow.

## Components
```
apps/web (Next.js 16, React 19)        public site + Creator / Business / Admin apps; same-origin proxy to the API
apps/api (NestJS 11, Express)          REST /api/v1 + OpenAPI, auth, tenancy, domain modules, webhooks, /r/:token
apps/worker (NestJS context + BullMQ)  webhook processing, payouts, outbox dispatch, sweepers, reconciliation,
                                       analytics aggregation, billing, retention, ledger monitoring
database (Prisma 7, PostgreSQL 18)     schema, forward-only migrations, DB invariants, reference seed
packages/domain                        pure business rules (money, commission, fees, attribution, ledger, states)
packages/config · api-client · ui      env validation · typed client · accessible UI kit
```

## Request path
Browser → web (CSP, security headers) → `/api/v1/*` rewrite → API: request id + logging → CSRF origin check →
AuthGuard (session → principal, email verified, platform permissions, admin MFA) → RateLimitGuard → Zod validation →
controller → service (AccessService tenant/object checks) → Prisma (transaction) → envelope `{ data, meta }` or
`{ error: { code, message, details, requestId } }`.

## API modules
auth · businesses · creators · catalog · campaigns · applications/invitations/partnerships · promotion (codes, links,
QR) · tracking · conversions (pipeline + attribution) · finance (ledger, commissions) · funding · payouts ·
integrations (adapters, webhooks, reconciliation) · notifications · messaging · deliverables · files · fraud ·
disputes · legal · admin (+ dual-approval actions, privacy) · analytics · billing · health · metrics.

## Core flows
1. **Campaign → partnership.** A business publishes a campaign (admin review unless verified). A creator applies or is
   invited; acceptance creates a partnership with an immutable, hashed terms snapshot (commission rule, attribution
   policy, fee plan, hold period, rights, deliverables, legal versions) plus a unique code, referral link and QR.
2. **Tracking → conversion.** Clicks on `/r/:token` are recorded (hashed IP/UA) and redirect to allowlisted
   destinations. Orders arrive by signed webhook (custom/Shopify), counter redemption (verified) or manual evidence
   (self-reported, ops review). The pipeline is idempotent per event and serialized per order; attribution decisions
   are deterministic and versioned.
3. **Commission → ledger → payout.** Commissions are computed from the snapshot, posted to the double-entry ledger,
   approved (manually or automatically for verified sources), funded by the business (FIFO), released after the hold
   period, and paid out through the provider abstraction. Refunds reverse or claw back per the saved terms.
4. **Trust & operations.** Fraud signals → flags → cases (with holds); disputes; reconciliation; audit hash chain;
   dual approvals for sensitive admin actions.

## Reliability model
Transactional outbox, raw webhook storage before acknowledgement, idempotency keys everywhere, sweepers that rebuild
queues from PostgreSQL (ADR-0005). The ledger is enforced by database triggers (ADR-0004). See RECOVERY.md.

## Decisions
docs/DECISIONS.md (product/financial decisions and pending owner decisions) and docs/adr/ (technical ADRs).
