# CODEK — MASTER BUILD SPECIFICATION
Version 1.2 | 2026-09-30

> **NON-NEGOTIABLE:** Treat this document and the repository documentation as source of truth. Do not invent unspecified product, financial, attribution, legal, security, or data rules.

---

# CODEK — MASTER BUILD SPECIFICATION

Version 1.2 | Consolidated Source of Truth | Project state: ready for autonomous implementation

This document consolidates the CODEK decisions, requirements, architecture, product rules, financial model, UX rules, security requirements, integration model, testing requirements, launch requirements, research conclusions, and Claude execution protocol established throughout the project.

Important: This is a project specification, not a transcript. It is intended to be the persistent source of truth that an AI coding agent such as Claude can read and follow without inventing missing rules.

## How Claude must use this document

- Treat this document plus the project source files under docs/ as the authority for CODEK.
- Do not invent a business rule merely because implementation is inconvenient.
- Do not silently simplify financial, attribution, security, tenant-isolation, or audit behavior.
- When a detail is intentionally deferred, keep the data model extensible and mark the item as DECISION NEEDED rather than guessing.
- Prefer the smallest production-safe implementation that satisfies the documented requirements.
- Preserve working behavior. Never rewrite large working areas without a clear reason and tests.
- Every completed phase must leave the repository in a working, tested, documented state.
## Non-negotiable product principles

- CODEK is a real startup platform, not a graduation project.
- CODEK is not an e-commerce store. The customer normally purchases from the business, not from CODEK.
- CODEK is not limited to online shops. It must support online and offline businesses and multiple industries.
- The customer normally does not create a CODEK account.
- CODEK must not claim perfect or 100% attribution. Attribution confidence depends on the source system, method, privacy constraints, and policy.
- A click, code entry attempt, or client-side claim alone must never create an authoritative commissionable sale.
- Financial history must be reproducible and auditable.
- Historical partnership, commission, attribution, and legal terms must remain reproducible after later edits.
- The frontend is never the security boundary and never the authoritative source for money calculations.
- The user experience should be simple enough for a normal non-technical user while the internal platform remains technically rigorous.
# 1. PRODUCT DEFINITION AND POSITIONING

## 1.1 Product definition

CODEK is a Creator–Business Partnership Marketplace + Attribution Infrastructure + Commission & Payout Platform.

The product combines a two-sided marketplace with partnership workflow, promotion assets, conversion attribution, financial calculation, ledgering, payout operations, integrations, and reconciliation.

Its differentiating thesis is not that codes, links, commissions, or creator marketplaces are individually unique. Those patterns already exist. The differentiation is the integrated infrastructure layer across industries and online/offline conversion sources, with partnership management, attribution, reconciliation, and financial controls in one system.

## 1.2 Core relationship chain

```text
Business → Catalog Item → Campaign → Partnership → Promotion Assets (Code + Referral Link + QR) → Conversion → Attribution → Commission Ledger → Payout
```

## 1.3 Core customer journey

- Business creates a catalog item or selects an existing one.
- Business creates a campaign and defines commercial terms.
- Creator discovers the campaign and applies, or the Business invites a Creator.
- Business accepts the Creator or Creator accepts the invitation.
- CODEK creates a Partnership and freezes a terms snapshot.
- CODEK generates unique promotion assets for the Partnership.
- Creator publishes content using the configured assets.
- Customer uses the referral path, creator code, or QR and interacts with the Business.
- The Business/source-of-truth system produces a verified event when supported.
- CODEK validates, deduplicates, normalizes, attributes, records the conversion, calculates commission, creates ledger effects, and later makes the approved amount payout-eligible.
- Payout is processed through an approved provider path and reconciled against provider and internal records.
## 1.4 What CODEK is not

- Not a customer-facing store by default.
- Not a wallet or escrow service by assumption.
- Not an arbitrary manual sales-entry system.
- Not a promise of perfect tracking across every browser, device, POS, privacy environment, or third-party system.
- Not an e-commerce-only creator affiliate platform.
- Not a free-for-all chat platform; business–creator messaging belongs to partnerships.
# 2. ACTORS AND PERMISSIONS

## 2.1 Business role

A Business is the merchant/service provider that creates offers and funds its commercial obligations. Business members must be tenant-isolated by business_id and authorized by role/permission.

Business capabilities: profile, verification, catalog, campaigns, applications, invitations, partnerships, promotion assets, sales/conversions, funding/payment readiness, analytics, integrations, messaging, notifications, and later team management.

## 2.2 Creator role

A Creator is an individual or creator account participating in campaigns. Creator access is scoped to the creator’s own profile, applications, accepted partnerships, promotion assets, conversions, earnings, deliverables, messages, notifications, and payouts.

## 2.3 Admin role

Admin is a privileged operational role. Admin actions must be explicitly authorized, audited, and restricted. Sensitive financial or destructive operations may require dual approval depending on the risk level.

## 2.4 Customer role

Customer is an external conversion participant and normally has no CODEK account. Customer PII must be minimized. Normal analytics must not expose customer PII.

# 3. BUSINESS MODEL AND MARKETPLACE

## 3.1 Marketplace model

The marketplace is two-sided. Creators discover business campaigns and businesses discover qualified creators. The system supports both creator-initiated applications and business-initiated invitations.

## 3.2 Campaign card

- Campaign image
- Product/service name
- Business name
- Price or relevant price context
- Customer discount
- Creator commission
- Collaboration/compensation type
- Duration
- Location
- Relevant creator platform(s)
## 3.3 Marketplace filters

- Category
- Location
- Commission
- Customer discount
- Creator platform
- Duration
- Product/service provided
- Compensation type
- Online/offline
- Audience or creator-fit metadata when available
## 3.4 Campaign lifecycle

```text
Draft → Pending Review → Published → Active → Paused → Ended → Archived
```

No hard delete should remove historically relevant financial or operational evidence. Archive instead when history matters.

## 3.5 Campaign detail must explain

- Product/service
- Price and customer discount
- Creator commission and calculation method
- Creator responsibilities
- Content requirements
- Deadlines
- Content ownership and usage rights
- Exclusivity if any
- Campaign duration
- Creator capacity/count
- Product/service gifting
- Promotion rules
- Attribution rules
- Cancellation/refund treatment
- Relevant legal terms

## 3.5A Mandatory campaign configuration details

The following are explicit product requirements and must not be guessed by implementation:

- `application_deadline_at`: optional deadline after which new creator applications are not accepted unless an authorized business/admin action reopens the flow.
- `participant_cap`: maximum number of active/accepted creator partnerships for the campaign. This may be represented by `creator_capacity`, but the business rule must be explicit.
- `waitlist_enabled`: whether eligible creators may enter a controlled waitlist after the participant cap is reached.
- Waitlist behavior must preserve application order/position and must never silently convert an application into an accepted partnership.
- `destination_url`: the business-controlled purchase, booking, registration, or relevant conversion destination.
- `conversion_source_type`: the expected verification source, such as webhook/API, POS, booking system, controlled redemption interface, or another explicitly supported source.
- `integration_id`: optional link to the integration expected to provide authoritative conversion events.
- `product_service_provided`: explicit indication of whether the business provides the product/service to participating creators.
- Customer discount configuration, creator compensation, deliverables, content rights, attribution policy, cancellation/refund behavior, and legal terms remain versioned/snapshot-compatible.

These requirements must appear in the database/API/UI where applicable and be enforced by the server.

## 3.6 Compensation models

- Commission-only
- Gift + Commission
- Fixed Fee + Commission
- Paid Content
V1 may launch with a smaller subset, but the schema and domain model must permit future expansion without destructive redesign.

## 3.7 Commercial model

Potential CODEK revenue models documented for consideration: subscription, transaction/performance fee, hybrid, campaign/hiring fee, and payout/processing fee where lawful and economically appropriate.

Before full commercial launch, model CAC, gross margin, ARPA, take rate, payout/processing costs, support/fraud costs, creator liquidity, and merchant retention. Pricing and fees must be transparent before commitment. Billing/pricing flows must integrate with legal terms and ledger behavior.

# 4. CREATOR MODEL

## 4.1 Creator application flow

```text
Creator → Apply → Pending → Business Accept/Reject
```

Alternative business-led path: Business → Invite Creator → Creator Accept/Reject.

## 4.2 Partnership creation

Acceptance must create the Partnership entity and an immutable/snapshot-compatible set of agreed commercial and legal terms. Promotion assets are linked to the Partnership.

## 4.3 Creator profile

- Name
- Profile photo
- Bio
- City/country
- Languages
- Categories
- Social platforms
- Follower counts
- Average views
- Engagement
- Likes/comments when available
- Audience data when available and lawful
- Portfolio
- CODEK performance: campaigns, sales, conversion rate, commissions, completion rate
Every social metric must carry provenance: source platform/API, fetched_at, metric definition/version, and a Verified or Self-reported state. Platform data availability is not assumed to be identical across social networks.

## 4.4 Creator dashboard

- Active Campaigns
- My Codes
- Referral Links
- QR assets
- Sales/Conversions
- Earnings
- Deliverables/Content
- Payouts
- Notifications
- Messages
## 4.5 Promotion asset status

```text
Pending / Active / Paused / Expired / Revoked
```

## 4.6 Earnings states

```text
Total / Pending / Approved / Available / Paid
```

Available means payout-eligible obligation derived from the financial system. It does not by itself mean CODEK holds funds in escrow or a wallet.

## 4.7 Deliverable states

```text
Not Started → Submitted → Approved
```

```text
Submitted → Changes Requested → Resubmitted → Approved
```

# 5. BUSINESS EXPERIENCE

## 5.1 Business dashboard

- Overview
- Campaigns
- Catalog
- Creator Applications
- Active Creators / Partnerships
- Sales/Conversions
- Payments/Funding
- Analytics
- Integrations
- Messaging
- Notifications
## 5.2 Overview KPIs

- Total sales
- Creator-attributed sales
- Creator commissions
- CODEK fees
- Active campaigns
- Active creators
## 5.3 Active creator table

- Creator
- Campaign
- Code
- Clicks
- Conversions
- Sales
- Commission
- Conversion rate
## 5.4 Business workflow

```text
Sign up → Complete profile → Add product/service → Create campaign → Review/applications → Accept/invite creator → Partnership → Promote → Verify conversions → Pay/fund → Reconcile → Analyze
```

# 6. ATTRIBUTION AND TRACKING

## 6.1 Core principle

CODEK cannot magically know sales in arbitrary external systems. The Business/source-of-truth system must verify the conversion whenever possible. A customer-side claim, click, or code attempt is not sufficient for authoritative financial attribution.

## 6.2 Tracking layers

Layer A: Touchpoints/events before a final decision.

- Click
- Visit/referral session
- QR scan
- Code attempt/redemption
- Other measurable referral touchpoint
Layer B: Attribution Decision after policy evaluation.

- Selected creator/partnership
- Attribution method
- Attribution policy and version
- Attribution window
- Competing touchpoints
- Conflict result
- Deduplication result
- Decision timestamp
## 6.3 Canonical attribution pipeline

```text
Raw Event → Validation → Idempotency → Normalization → Attribution → Conversion State → Commission Calculation → Ledger Entry
```

## 6.4 Attribution mechanisms

- Creator code
- Referral link
- QR/offline path
- Future mechanisms may be added without changing the core decision architecture.
## 6.5 Attribution policy

Attribution rules are deterministic, configurable, versioned, and campaign-specific. Historical attribution decisions must not silently change when a later policy is edited.

- Possible policy mechanisms include code-first, link-first, last-touch, and first-touch, but the actual campaign configuration is authoritative.
## 6.6 Conflict handling

Example: Customer clicks Creator A referral link but uses Creator B code. CODEK detects the conflict and applies the campaign’s configured policy. The system must record the conflict and final decision. It must never guess or double-credit unless an explicit policy allows that behavior.

## 6.7 Attribution limitations

- Cross-device attribution may fail.
- Browser/cookie restrictions may break link continuity.
- Privacy/consent choices can reduce tracking.
- Third-party systems can provide incomplete event data.
- First-party/server-side methods should be preferred where appropriate.
- No public claim of 100% attribution is allowed.
## 6.8 Conversion confidence

- Verified conversion: supported by the business/source system or controlled redemption flow.
- Self-reported conversion: explicitly labeled and treated with lower trust.
- Conflict/unattributed/invalid/duplicate states must be visible in analytics and operational systems.
## 6.9 Deduplication

Use external event/order identifiers plus business/integration scope and idempotency controls. Duplicate external events must not create duplicate conversions or commissions.

## 6.10 Offline conversions

- Preferred: POS/API integration.
- Controlled fallback: Merchant Redemption Interface.
- Optional lower-confidence fallback: receipt/proof-of-purchase workflow.
- Free manual sales entry is not the primary truth source and must have controls/evidence if supported at all.
# 7. CODE ENGINE AND PROMOTION ASSETS

## 7.1 Code requirements

- Internal CODE ID globally unique/opaque.
- External code string unique within the correct business/scope.
- Case-insensitive normalization.
- Concurrency-safe uniqueness.
- Links to business, campaign, partnership, creator.
- Status and validity window.
- Usage limit.
- Per-customer usage limit where applicable.
- Redemption rules.
- Stacking rules.
- No reuse after expiry or revoke.
- Conflict/blacklist controls for merchant coupon systems.
- Code leakage detection signals.
## 7.2 Code lifecycle

```text
Pending → Active → Paused → Expired → Revoked
```

## 7.3 Referral URL security

Referral destinations must be validated/allowlisted to avoid open-redirect and phishing/security abuse. Tracking endpoints must never become unrestricted URL proxy/fetch endpoints.

# 8. COMMISSION ENGINE

## 8.1 Supported rule structure

- Percentage
- Fixed amount
- Hybrid in later versions
- Commission base
- Excluded products/categories/SKUs
- Caps/floors
- Currency
- Rounding
- Refund/clawback behavior
## 8.2 Commission base must be explicit

- Gross
- Discounted amount
- Net amount
- Tax treatment
- Shipping treatment
The exact base is a business rule and must be snapshotted. Never allow the frontend to choose or calculate an authoritative financial amount.

## 8.3 Commission lifecycle

```text
Pending → Approved → Funded → Available → Payout Requested → Processing → Paid
```

Additional states include Reversed, Clawback, or negative adjustment when needed for refunds or corrections.

## 8.4 Hold period

A configurable hold period may be used to account for cancellations/refunds before commission becomes available, subject to commercial terms and applicable law.

# 9. FINANCIAL LEDGER

## 9.1 Non-negotiable architecture

Financial state must use a real ledger subsystem, preferably double-entry, immutable-style, and auditable. Do not model creator earnings as one mutable balance field.

## 9.2 Logical financial accounts

- Merchant Funding / merchant obligation account
- Creator Payable
- CODEK Revenue
- CODEK Fees
- Payout Clearing
- Reversals/Adjustments
Exact chart-of-accounts expansion may evolve, but every financial movement must resolve through balanced ledger entries and lines.

## 9.3 Ledger rules

- Every financial operation creates balanced ledger lines.
- Commission calculation references an immutable commercial/commission snapshot.
- Refund/chargeback creates reversal effects; it does not silently edit the original financial history.
- Payout movement records the provider transaction reference.
- Available payout balance is derived from ledger state and payout eligibility, not a manually edited wallet balance.
- Financial history is append-only/immutable in principle; corrections use explicit adjustment/reversal entries.
- All monetary operations are transactionally consistent.
- Ledger invariants must be monitored and tested.
## 9.4 Money representation

- Use integer minor units for money values.
- Store ISO currency code.
- Use Decimal-safe arithmetic; never Float for money.
- Standardize rounding rules.
- Use UTC for timestamps; retain business/campaign timezone where business meaning depends on local time.
# 10. FUNDING, PAYMENTS, AND PAYOUTS

## 10.1 Money flow

The customer normally pays the Business directly. The Business funds CODEK obligations/fees, or an approved provider-mediated marketplace settlement flow is used where legally and technically supported. CODEK pays creators through a payout provider.

## 10.2 Provider abstraction

- Provider integrations must be behind an abstraction layer.
- Potential providers include PayPal, local/regional PSPs, card/payment gateways, and other lawful providers by market.
- Core ledger logic must not be hardwired to one provider.
## 10.3 Custody warning

CODEK must not assume escrow, wallet custody, or holding customer/creator money unless the chosen legal structure and licensed provider explicitly support it. Product copy and architecture must reflect this distinction.

## 10.4 Configurable funding models

- Merchant pre-funding/reserve.
- Provider-mediated marketplace settlement.
- Merchant-direct/provider payout where legal and supported.
## 10.5 Payout requirements

- Available balance.
- Minimum payout threshold.
- KYC/readiness state.
- Payout method.
- Risk flags.
- Payout request.
- Payout attempts.
- Provider transaction ID.
- Status.
- Retry logic.
- Failure history preserved; failed attempts are not deleted.
## 10.6 Reconciliation

Reconcile CODEK Ledger ↔ Provider ↔ Merchant Funding ↔ Payouts.

- Detect missing records.
- Detect duplicates.
- Detect late/mismatched states.
- Require explicit adjustment workflows.
- Never silently repair financial mismatches by overwriting history.
## 10.7 Jordan payment constraints — verify before production

As of the project verification date, PayPal documentation lists Jordan as supporting send, receive, and withdraw for payouts. This does not prove that every marketplace, multiparty settlement, or custody model is available in Jordan.

Stripe’s direct account-country availability must be checked at implementation/launch; Jordan is not to be assumed as a directly supported Stripe account country merely because Stripe products exist globally.

Any flow involving holding or transferring third-party funds requires legal and provider review in the target market.

# 11. INTEGRATION LAYER

## 11.1 Supported integration categories

- Shopify
- Custom websites
- POS systems
- Booking platforms
- Mobile apps
- Payment systems
- CRM systems
Additional providers must plug into the adapter layer rather than changing the core domain model.

## 11.2 Integration lifecycle

```text
Not Connected → Connecting → Connected → Testing → Live → Paused/Error → Disconnected
```

## 11.3 Authentication methods

- OAuth
- API key/secret
- HMAC/signature
- Signed webhooks
- Access/refresh tokens
Secrets must be stored in a secure secret-management mechanism and never in plaintext database fields, logs, source code, or client responses.

## 11.4 Webhook processing pipeline

```text
Verify Signature → Timestamp/Replay Check → Event ID/Idempotency → Store Raw Event → Queue → Process → Normalize → Reconcile
```

## 11.5 Normalized CODEK events

- ORDER_CREATED
- ORDER_PAID / PAYMENT_CONFIRMED
- ORDER_COMPLETED
- ORDER_CANCELLED
- ORDER_REFUNDED
- BOOKING_CREATED
- BOOKING_COMPLETED
- REDEMPTION_CREATED
- Additional normalized events may be added without exposing provider-specific schemas to domain consumers.
## 11.6 Event lineage

```text
Raw provider event → Normalized event → Conversion/Attribution Decision → Commission effect → Ledger effect
```

## 11.7 Reliability

- Out-of-order events must be supported.
- Retries use exponential backoff.
- Workers must be idempotent.
- Dead-letter queues must capture poison/failing events.
- Transactional outbox is required for reliable internal event publication where applicable.
- Reconciliation jobs are mandatory for financial/integration correctness.
- Test mode must exist before live integration behavior.
- Disconnect preserves historical records and financial evidence.
# 12. NOTIFICATIONS, MESSAGING, DELIVERABLES, RIGHTS

## 12.1 Notifications

- In-app
- Email
- Later: push/SMS/WhatsApp as appropriate
- Notification preferences must be configurable per notification type.
## 12.2 Messaging

Messaging is Business ↔ Creator inside a Partnership, not a general-purpose social chat system.

- Text
- Image/file where required
- System messages
- Access control by partnership membership
- Rate limits
- Abuse/report controls
- Defined retention behavior
## 12.3 Deliverables

- Type
- Description
- Due date
- Status
- Submission
- Approval state
- Revision history as appropriate
## 12.4 Content rights

- Ownership
- Organic usage
- Paid-ad usage
- Whitelisting
- Duration
- Territory
- Exclusivity
- Rights must be agreed and recorded per partnership where relevant.
## 12.5 Partnership activity timeline

- Partnership created
- Accepted
- Promotion assets generated
- Content submitted
- Content approved
- First conversion
- Commission approved
- Payout
# 13. FRAUD, SECURITY, AND DISPUTES

## 13.1 Fraud signals

- Self-referral
- Code leakage
- Coupon-site leakage
- Abnormal conversion spikes
- Repeated orders
- Refund spikes
- Suspicious staff redemptions
- Click/order anomalies
- Webhook replay
- Attribution conflicts
## 13.2 Fraud workflow

```text
Signal/Flag → Fraud Case → Evidence/Review → Decision → Action
```

Do not auto-punish blindly. Automated signals can flag cases; consequential decisions should have review and auditable reasoning.

## 13.3 Dispute workflow

```text
Open → Evidence → Hold → Review → Decision → Adjustment/Reversal → Closed
```

## 13.4 Security baseline

- Secure authentication.
- HttpOnly/SameSite cookie/session strategy where cookie authentication is used.
- CSRF protection where applicable.
- MFA, especially for admins.
- RBAC plus object-level and property-level authorization.
- Strict tenant isolation tests.
- HMAC/signed webhook verification.
- Replay protection.
- Rate limiting.
- Encrypted secret storage.
- Backups and restore testing.
- Audit logs.
- Monitoring and alerts.
- Dependency/security scanning.
- SSRF protections and egress allowlists for outbound URL fetching.
- OWASP ASVS and OWASP API Security practices as security baselines.
## 13.5 Audit log

- Actor/who
- Action/what
- Before state
- After state
- Timestamp
- Reason/context
Audit history should be append-only/tamper-evident where practical. Sensitive admin financial actions must always be auditable.

# 14. PRIVACY, LEGAL, AND COMPLIANCE

## 14.1 Jordan privacy baseline

Jordan Personal Data Protection Law No. 24 of 2023 was enacted September 17, 2023 and came into effect March 17, 2024. CODEK must treat privacy and data governance as first-class product requirements for Jordan operations.

- Data mapping
- Controller/processor role analysis
- Data minimization
- Consent and lawful processing analysis
- Data-subject rights workflows
- Retention schedules
- Processor agreements
- Cross-border transfer controls
- DPIA/risk assessment where required
- Privacy by design
Legal counsel must confirm the exact obligations, contracts, sector rules, and cross-border arrangements before production launch. Technical architecture should not assume that a generic privacy policy alone makes the platform compliant.

## 14.2 Data handling principles

- Store the minimum customer data needed.
- Use pseudonymous customer references where possible.
- Do not expose customer PII in normal creator/business analytics.
- Separate operational deletion, anonymization, and legally required retention.
- Soft delete is not the same as legal erasure.
- Financial/audit data may have legally required retention and should be anonymized or minimized where possible instead of casually deleted.
## 14.3 Required legal documents

- Terms of Service
- Privacy Policy
- Business Agreement
- Creator Agreement
- Commission Terms
- Refund/Dispute Policy
- Content Rights / Usage Terms
- Prohibited Categories
Legal documents must be versioned. Material acceptance must record the document version, actor, and timestamp.

## 14.4 Creator disclosure

Creator disclosure requirements must be configurable by jurisdiction and campaign/legal requirements. Do not hardcode one jurisdiction’s disclosure assumptions globally.

# 15. ANALYTICS AND REPORTING

## 15.1 KPIs

- Clicks
- Tracked visits
- Conversions
- Verified sales
- Conversion rate
- Commission
- CODEK fees
- Active creators
- Campaign performance
- Payout metrics
## 15.2 Attribution funnel

```text
Impressions (if available) → Clicks → Tracked Visits → Conversions → Approved Conversions → Commission
```

Metrics must make clear whether they are verified, self-reported, attributed, conflicted, unattributed, duplicate, or otherwise uncertain.

## 15.3 Metric provenance

- Source/provenance
- Freshness/fetched_at
- Attribution model/version
- Metric definition/version where needed
## 15.4 Analytics correctness

- Analytics totals should reconcile with financial ledger totals where both represent the same monetary scope.
- Heavy aggregations should use background jobs/materialized summaries as scale requires.
- Exports should be CSV/Excel-ready.
- Normal analytics must not expose customer PII.
# 16. VERIFICATION AND TRUST

## 16.1 Business trust model

- Profile completion
- Verification status
- Business detail validation
- Billing/tax readiness
## 16.2 Creator trust model

- Profile completeness
- Social account connection
- Verified/self-reported metrics
- Campaign history
- Conversion history
- Completion history
- Dispute/refund history where appropriate
Do not use an early 1–5 rating as the primary trust mechanism. Trust should be grounded in verified data and operational history.

## 16.3 Verification lifecycle

```text
Unverified → Pending → Verified
```

Suspended or Expired states may be used where verification becomes invalid or risk conditions change.

# 17. TECHNICAL ARCHITECTURE

## 17.1 Architecture choice

Use a Modular Monolith for V1 with a separate web frontend in a monorepo. Do not build microservices in V1 unless a later documented decision changes this architecture.

## 17.2 Stack

| Layer | Decision |
| --- | --- |
| Language | TypeScript end-to-end |
| Frontend | Next.js App Router + React, responsive |
| Backend | NestJS with Express adapter V1 |
| Database | PostgreSQL 18.x |
| ORM | Prisma; use the latest stable release at implementation time; do not build production on Prisma 8 RC |
| Authentication | Better Auth integrated with NestJS; DB-backed sessions; email/password; verification; reset; MFA-ready |
| Queues/Workers | Redis + BullMQ |
| Storage | S3-compatible object storage |
| API | REST JSON under /api/v1 |
| Validation | DTO/schema validation |
| API documentation | OpenAPI/Swagger |
| Testing | Unit + integration + E2E + security + financial + webhook + concurrency + load |
| Deployment | Containers; separate staging and production; managed infrastructure where practical |

## 17.3 Version guidance verified 2026-09-30

- Node.js 24 is an LTS line; Node.js 26 is Current. Use a pinned LTS baseline for production rather than a moving Current release unless a deliberate compatibility decision is documented.
- Next.js 16.3.3 is the Active LTS release identified in the August 2026 security update. Pin/verify the exact compatible version at implementation.
- PostgreSQL 18.6 is a current PostgreSQL 18 minor release as of August 13, 2026.
- Prisma ORM 8 is still a release candidate as of September 30, 2026; use the supported stable branch instead of the RC for production unless this decision is explicitly revisited after GA and testing.
- BullMQ 6.x is the active major line in the current project baseline; pin a tested exact version.
- Better Auth supports DB-backed sessions and MFA plugins; its NestJS integration is community maintained, so exact versions must be pinned and covered by E2E tests.
## 17.4 Environment separation

```text
Development → Staging → Production
```

- Separate credentials and configuration.
- Never use production secrets in local development.
- Never use production customer/payment data for ordinary testing.
- CI/CD should gate changes before production deployment.
## 17.5 Monorepo structure

```text
apps/web
apps/api
apps/worker
packages/domain
packages/api-client
packages/ui
packages/config
packages/testing
packages/eslint-config
packages/tsconfig
docs/
prisma/ or database/
infra/
root workspace files
CI configuration
.env examples
CLAUDE.md
AGENTS.md
security documentation
```

# 18. BACKEND MODULES

The backend should be organized as domain modules. Modules may begin inside one deployable NestJS application but must have clear boundaries.

- auth
- users
- businesses
- creators
- social-accounts
- catalog
- campaigns
- applications
- partnerships
- promotion
- tracking
- attribution
- conversions
- commissions
- ledger
- funding
- payouts
- payments
- integrations
- webhooks
- analytics
- notifications
- messaging
- deliverables
- content-rights
- verification
- fraud
- disputes
- admin
- audit
- billing
- system/health
# 19. DATABASE DATA DICTIONARY — MASTER ENTITY SET

This is the required V1 entity inventory. The exact field-level implementation must be completed from the same rules below and may be expanded only through controlled migrations.

| # | Entity | Purpose |
| --- | --- | --- |
| 1 | users | Primary user identity and account owner record |
| 2 | sessions | Authenticated sessions |
| 3 | accounts/credentials | Authentication provider and credential data |
| 4 | verification_tokens | Email/account verification and recovery tokens |
| 5 | roles | Roles |
| 6 | permissions | Fine-grained permissions |
| 7 | role_permissions | Role-to-permission mapping |
| 8 | businesses | Merchant/service-provider tenants |
| 9 | business_members | Users associated with businesses |
| 10 | creators | Creator profile and operational data |
| 11 | social_accounts | Connected social accounts and metric provenance |
| 12 | catalog_items | Underlying products/services |
| 13 | campaigns | Commercial marketing campaigns |
| 14 | campaign_eligibility_rules | Creator eligibility constraints |
| 15 | campaign_applications | Creator applications |
| 16 | partnerships | Accepted business-creator-campaign relationships |
| 17 | partnership_terms_snapshots | Frozen partnership terms |
| 18 | promotion_codes | Unique creator promotion codes |
| 19 | referral_links | Creator referral links |
| 20 | qr_assets | QR promotion assets |
| 21 | tracking_clicks | Referral/click events |
| 22 | tracking_sessions | Referral tracking sessions |
| 23 | attribution_touchpoints | Pre-decision attribution evidence |
| 24 | attribution_decisions | Final deterministic attribution results |
| 25 | conversions | Canonical conversion records |
| 26 | conversion_events | External/internal conversion event lineage |
| 27 | commission_rules | Commission calculation configuration |
| 28 | commission_calculations | Commission results and snapshots |
| 29 | ledger_accounts | Double-entry accounts |
| 30 | ledger_entries | Financial journal entries |
| 31 | ledger_entry_lines | Balanced debit/credit lines |
| 32 | merchant_fundings | Merchant funding obligations |
| 33 | payouts | Creator payout headers |
| 34 | payout_attempts | Provider payout attempts |
| 35 | payment_provider_transactions | Provider payment/transfer records |
| 36 | reconciliations | Reconciliation runs |
| 37 | reconciliation_items | Individual reconciliation findings |
| 38 | integrations | External system connections |
| 39 | integration_credentials_refs | Secure references to stored secrets/credentials |
| 40 | webhook_events | Raw inbound provider events |
| 41 | outbox_events | Reliable internal event publication |
| 42 | notifications | User notifications |
| 43 | notification_preferences | Notification settings |
| 44 | conversations | Partnership-specific conversations |
| 45 | messages | Messages within conversations |
| 46 | deliverables | Campaign/partnership deliverables |
| 47 | content_submissions | Submitted creator content |
| 48 | content_rights | Usage/content-rights terms |
| 49 | verification_cases | Business/creator verification workflows |
| 50 | fraud_flags | Fraud indicators |
| 51 | fraud_cases | Fraud review cases |
| 52 | disputes | Commercial/financial disputes |
| 53 | dispute_evidence | Evidence attached to disputes |
| 54 | admin_actions | Privileged operational actions |
| 55 | audit_logs | Audit history |
| 56 | files/media | Object/media metadata and access controls |
| 57 | billing_customers/subscriptions/invoices | Billing entities as required |
| 58 | legal_documents | Versioned legal documents |
| 59 | legal_acceptances | Who accepted which version and when |
| 60 | feature_flags/system_settings | Controlled configuration |

## 19.1 Database-wide rules

- Use UUIDs or other opaque IDs. Never expose sequential sensitive identifiers when unnecessary.
- Use separate external references for provider IDs/order numbers.
- Use foreign keys and database constraints to protect core invariants.
- Tenant isolation must be enforced through business_id/object ownership and tested at the service/API level and ideally reinforced in database design where appropriate.
- Use scoped unique constraints for codes, external IDs, memberships, and other tenant-scoped identifiers.
- Soft delete only where it is appropriate. Financial/audit/history records should not be deleted to hide history.
- Version/snapshot mutable commercial terms.
- Use version fields/optimistic locking where concurrent edits may conflict.
- Use idempotency keys for selected state-changing and monetary mutations.
- Use DB transactions for financial and important state transitions.
- All timestamps are UTC unless a stored business timezone has explicit domain meaning.
## 19.2 Field requirements by table family

Every entity specification must document: purpose, primary key, foreign keys, field types, nullable/default behavior, unique/index constraints, status/lifecycle, tenant/ownership scope, audit requirements, and deletion/retention behavior.

Financial entities additionally document: currency, minor-unit amounts, journal relationships, immutable references, correction/reversal strategy, and reconciliation/provider references.

Attribution entities additionally document: policy version, source, event lineage, confidence/status, timestamps, and conflict/deduplication information.

Integration entities additionally document: provider, auth method, secure credential reference, environment, connection state, health/test status, and last successful synchronization where applicable.

# 20. API CONTRACTS

## 20.1 API standards

- REST JSON under /api/v1.
- Consistent response and error envelope.
- Machine-readable error codes.
- Cursor/offset pagination chosen consistently and documented.
- Standard filter/sort conventions.
- Correlation/request IDs.
- Rate-limit headers and behavior.
- Idempotency-Key on selected monetary/state-changing POST requests.
- OpenAPI is the contract used for documentation, testing, and typed client generation.
- Never return provider secrets.
- Do not include customer PII in normal analytics responses.
## 20.2 Auth routes

```text
POST /api/v1/auth/sign-up
POST /api/v1/auth/sign-in
POST /api/v1/auth/sign-out
POST /api/v1/auth/verify-email
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
GET  /api/v1/auth/session
POST /api/v1/auth/mfa/*
```

## 20.3 Business routes

```text
GET/POST /api/v1/businesses
GET/PATCH /api/v1/businesses/:id
GET/POST /api/v1/businesses/:id/catalog
GET/POST /api/v1/businesses/:id/campaigns
POST /api/v1/campaigns/:id/publish
POST /api/v1/campaigns/:id/pause
GET /api/v1/businesses/:id/applications
POST /api/v1/applications/:id/accept
POST /api/v1/applications/:id/reject
POST /api/v1/businesses/:id/invitations
```

## 20.4 Creator/marketplace routes

```text
GET /api/v1/marketplace/campaigns
GET /api/v1/campaigns/:id
POST /api/v1/campaigns/:id/apply
GET /api/v1/creator/partnerships
GET /api/v1/creator/promotion-assets
GET /api/v1/creator/sales
GET /api/v1/creator/earnings
POST /api/v1/creator/payouts
```

## 20.5 Tracking and conversions

```text
POST /api/v1/track/click
POST /api/v1/webhooks/:provider
GET /api/v1/conversions/:id
POST /api/v1/redemptions
GET /api/v1/attributions/:id
```

## 20.6 Payments/funding/payouts

```text
POST /api/v1/businesses/:id/funding
GET  /api/v1/businesses/:id/funding
GET  /api/v1/creator/payouts
POST /api/v1/creator/payouts/request
```

## 20.7 Integrations

```text
GET  /api/v1/integrations
POST /api/v1/integrations/:provider/connect
POST /api/v1/integrations/:id/test
POST /api/v1/integrations/:id/reconcile
POST /api/v1/integrations/:id/disconnect
```

## 20.8 Admin routes

Admin routes live under /api/v1/admin/... for users, businesses, creators, campaigns, applications/partnerships, conversions, payouts, fraud, disputes, reconciliations, audit, and operational support.

## 20.9 API authorization pipeline

```text
Authentication → Role/Permission Check → Object Ownership/Tenant Isolation → Property-Level Authorization → State/Business-Rule Validation → Operation
```

Every protected endpoint must be tested for unauthorized access, cross-tenant access, object-level access, and function-level authorization.

## 20.10 Financial API rule

Client requests may provide intent and references. They must never be accepted as authoritative commission, balance, ledger, payout, or other financial totals calculated in the browser.

## 20.11 Webhook API rule

Webhook endpoints must validate provider signature, timestamp/replay protections, provider event ID/idempotency, and store the raw event before asynchronous processing where appropriate.

# 21. EVENT CONTRACTS

## 21.1 External events

- ORDER_CREATED
- ORDER_PAID
- ORDER_COMPLETED
- ORDER_CANCELLED
- ORDER_REFUNDED
- BOOKING_CREATED
- BOOKING_COMPLETED
- REDEMPTION_CREATED
## 21.2 Internal events

- ConversionRecorded
- AttributionResolved
- CommissionCalculated
- CommissionApproved
- FundingReceived
- PayoutRequested
- PayoutProcessed
- PayoutFailed
- DisputeOpened
- FraudFlagged
## 21.3 Event envelope

Each event should carry: event_id, event_type, schema_version, occurred_at, received_at, source, tenant/business scope, correlation_id, idempotency reference, payload, processing state, retry metadata.

Event schemas must be versioned and stable. Provider-specific payloads stay at the integration boundary; downstream domain logic consumes normalized CODEK contracts.

# 22. UI / UX SYSTEM

## 22.1 Simplicity requirement

The intended UX target is a modern global SaaS experience for ordinary non-technical users. Internal complexity must be hidden behind clear user actions.

- Users see only functionality relevant to their role.
- Technical concepts such as ledger internals, reconciliation mechanics, webhook retries, and attribution lineage should not be exposed unless useful to the user.
- Core workflows should be obvious and sequential.
- Use plain labels and clear status states.
- Avoid forms that ask users for technical information unless the information is truly required.
- Progressive disclosure: simple defaults first, advanced controls only when relevant.
- Destructive actions require confirmation and explain the consequence.
- Errors explain what happened and what the user can do next.
- Loading, empty, error, and success states are designed for every data-driven screen.
- Financial figures are read from backend APIs and show appropriate status/context.
- Accessibility and responsive behavior are requirements, not polish tasks.
## 22.2 Core creator mental model

```text
Sign up → Complete profile → Find campaign → Apply → Get accepted → Get code/link/QR → Publish → Track results → Get paid
```

## 22.3 Core business mental model

```text
Sign up → Complete business → Add product/service → Create campaign → Review creators → Accept/invite → Run partnership → Verify sales → Fund/pay → Reconcile → Analyze
```

# 23. SCREEN-BY-SCREEN SPECIFICATION

## 23.1 Public site

- Home
- How It Works
- For Businesses
- For Creators
- Pricing
- About
- Resources
- Case Studies
- FAQ
- Contact
- Terms
- Privacy
## 23.2 Authentication

- Business Sign Up
- Creator Sign Up
- Login
- Email Verification
- Forgot Password
- Reset Password
- MFA/Security
- Session/security management where exposed to users
## 23.3 Creator screens

- Onboarding
- Dashboard
- Marketplace
- Campaign Details
- Apply
- Applications
- Invitations
- Partnerships
- Partnership Details
- Promotion Assets
- Sales/Conversions
- Earnings/Ledger View
- Deliverables
- Content Submission
- Messages
- Notifications
- Payouts
- Profile
- Social Accounts
## 23.4 Business screens

- Onboarding
- Dashboard
- Profile
- Catalog
- Catalog Item Detail/Edit
- Campaign List
- Create/Edit Campaign
- Campaign Detail
- Applications
- Creator Profile
- Invitations
- Active Partnerships
- Partnership Detail
- Sales/Conversions
- Funding/Payments
- Analytics
- Integrations
- Reconciliation/Integration Health
- Messages
- Notifications
## 23.5 Admin screens

- Overview
- Users
- Businesses
- Creators
- Campaigns
- Applications/Partnerships
- Conversions
- Ledger/Financial Operations
- Funding/Payouts
- Reconciliation
- Integrations/Webhooks
- Fraud Cases
- Disputes
- Moderation
- Audit Logs
- Legal/Compliance
- System Settings/Feature Flags
## 23.6 Every screen must specify

- Purpose
- Actor
- Data source/API
- Permissions
- Primary actions
- Secondary actions
- Validation
- Loading state
- Empty state
- Error state
- Success state
- Destructive confirmation
- Audit requirement
- Responsive behavior
- Accessibility behavior
- Navigation/back behavior
# 24. OBSERVABILITY AND OPERATIONS

## 24.1 Logs

- Structured logs.
- Correlation/request IDs.
- No secrets or sensitive customer data in logs.
- Useful domain/event identifiers for debugging.
## 24.2 Metrics/alerts

- API latency/error rate
- Queue depth
- Webhook backlog
- Webhook failure/retry/DLQ counts
- Conversion mismatch rate
- Ledger invariant failure
- Funding shortfall
- Payout failures
- Fraud spikes
- Authentication failures
- Uptime/health/readiness
- Critical incident alerts
## 24.3 Health endpoints

Provide liveness and readiness checks that reflect application and infrastructure dependencies without leaking secrets or internal security details.

# 25. QUEUES AND WORKERS

## 25.1 Required queue categories

- webhook-processing
- reconciliation
- notifications
- email
- analytics-aggregation
- social-sync
- payout-processing
- retry/dead-letter handling
- fraud-scoring
- cleanup/retention
- report-export
## 25.2 Worker rules

- Workers must be idempotent.
- Jobs must have retry/backoff policies.
- Poison jobs go to explicit DLQs.
- Do not create duplicate financial effects when a job is retried.
- Workers must emit enough context for operational debugging without logging secrets.
# 26. TESTING STRATEGY

## 26.1 Unit tests

- Commission formulas
- Attribution policy decisions
- Code normalization
- State transitions
- Ledger balancing
- Refund/clawback rules
- Money rounding
- Permission logic
## 26.2 Integration tests

- Database constraints
- Transactions
- Webhook ingestion
- Provider adapters
- Queue processing
- Reconciliation
- Storage access control
## 26.3 E2E tests

- Business signup/onboarding
- Creator signup/onboarding
- Campaign creation/publish
- Application/acceptance/partnership
- Promotion asset use
- Verified conversion
- Commission lifecycle
- Funding
- Payout
- Refund/reversal
- Dispute
- Admin workflows
## 26.4 Webhook tests

- Valid signature
- Invalid signature
- Replay
- Duplicate event
- Retry
- Out-of-order events
- Malformed payload
- Unknown provider event
## 26.5 Financial tests

- Percentage commission
- Fixed commission
- Discounted base
- Tax/shipping inclusion/exclusion
- Rounding
- Full refund
- Partial refund
- Chargeback
- Clawback
- Payout failure
- Retry
- Insufficient funding
- Multi-currency boundary cases
## 26.6 Concurrency tests

- Concurrent code creation
- Concurrent redemptions
- Duplicate event processing
- Concurrent state transitions
- Payout race conditions
## 26.7 Security tests

- RBAC
- Object-level authorization
- Property-level authorization
- Tenant isolation
- CSRF where relevant
- SSRF
- Webhook signature/replay
- Rate limits
- Secret exposure
- Injection classes
## 26.8 Load and recovery tests

- API load
- Webhook ingestion load
- Queue load
- Database backup/restore
- Failure/recovery of workers
- Rollback/redeploy behavior
# 27. DEVOPS, DEPLOYMENT, AND RECOVERY

## 27.1 Deployment architecture

- Containerized services.
- Managed PostgreSQL, Redis, and object storage where practical.
- Separate staging and production infrastructure/credentials.
- CI/CD with automated checks.
- Versioned migrations.
- Safe deployment strategy.
- Rollback strategy.
## 27.2 Backups

- Scheduled database backups.
- Object storage durability/versioning as appropriate.
- Retention policy.
- Restore procedure.
- Restore must be tested, not merely assumed.
## 27.3 Production readiness

- Domain and DNS
- SSL/TLS
- Email delivery
- Authentication
- Database
- Object storage
- Queues
- Webhooks
- Payments/funding
- Monitoring
- Backups
- Alerts
- Legal documents
- Secure admin bootstrap
- Smoke tests
- Rollback plan
- Incident response
- Reconciliation enabled before financial launch
# 28. PRODUCT PHASING AND V1 SCOPE

## 28.1 Build order

| Step | Scope |
| --- | --- |
| 1 | Repository/tooling/environment |
| 2 | Database/migrations/seed |
| 3 | Auth/users/RBAC |
| 4 | Business/Creator profiles |
| 5 | Catalog/Campaigns |
| 6 | Applications/Partnerships/terms snapshots |
| 7 | Codes/Links/QR |
| 8 | Tracking/Attribution |
| 9 | Conversion pipeline |
| 10 | Commission/Ledger |
| 11 | Funding/Payout abstraction |
| 12 | Integrations/Webhooks/Reconciliation |
| 13 | Notifications/Messaging/Deliverables |
| 14 | Admin/Fraud/Disputes/Audit |
| 15 | Analytics |
| 16 | Billing/Pricing |
| 17 | Public site/Dashboards |
| 18 | Security/Performance/QA/Load |
| 19 | Production deployment/Monitoring/Recovery |

## 28.2 Focused launch principle

Architecture should be global-ready, but the launch should focus on a specific market/use case and a limited number of integrations. This reduces operational complexity and helps the two-sided marketplace solve liquidity/chicken-and-egg problems.

AI creator matching is intentionally postponed as a feature, but creator and campaign metadata must be structured to support future matching.

# 29. COMPETITOR AND MARKET RESEARCH

## 29.1 Competitors/benchmarks reviewed

- ADLTIX
- Steer
- Cetail
- Viffy
- impact.com
- Shopify Collabs
- Refersion
- Collabstr
- ShopMy
- MagicLinks
- Branch
- Awin
- Everflow
## 29.2 Research conclusions

- Marketplace discovery, applications/invites, creator codes, referral links, performance analytics, payouts, content workflows, and affiliate/attribution mechanisms are established market patterns.
- The strongest CODEK differentiation is the combination of partnership marketplace + attribution infrastructure + financial/reconciliation layer + cross-industry and offline support, not claiming that any one feature is unprecedented.
- Do not market CODEK as “first”, “only”, or “unique” without independent evidence.
- Marketplace liquidity and the creator/business chicken-and-egg problem are fundamental launch challenges.
- Creator selection should consider content fit, audience, communication, credibility, and verified performance rather than follower count alone.
- Measurement, standards, creator selection, and ROI/attribution are major pain points in the creator economy, supporting the need for robust infrastructure.
Competitor claims are not treated as independently verified facts unless verified from primary sources. Do not copy competitor rankings, scores, or “best” judgments into CODEK strategy.

# 30. RESEARCH-BASED PRODUCT GUARDRAILS

- Do not promise 100% attribution.
- Do not treat every self-reported social metric as verified.
- Do not treat every manual conversion as financially authoritative.
- Do not expose sensitive customer data to creators.
- Do not rely on client-side financial calculations.
- Do not equate a payout-eligible balance with custody of funds.
- Do not bind the ledger to a single payment provider.
- Do not let a campaign edit rewrite historical partnership terms.
- Do not let an attribution-policy change silently rewrite historical decisions.
# 31. CLAUDE BUILD PROTOCOL — MASTER EXECUTION RULES

## 31.1 Before coding

- Read this document and all project docs first.
- Read architecture, product, security, API, database, legal/decision notes, and any existing implementation notes before modifying code.
- Inspect the repository before making assumptions.
- Identify the current phase and the smallest required change.
- Confirm whether the change affects domain behavior, financial behavior, legal exposure, security, or schema.
## 31.2 Implementation loop

```text
Inspect → Plan → Implement → Migrate → Test → Security Check → Run Tests → Review Diff → Update Docs → Checkpoint
```

Do not skip the diff review or documentation update after meaningful changes.

## 31.3 Mandatory coding rules

- No feature bypasses domain modules.
- No direct financial-table writes from unrelated modules/controllers.
- No direct DB access from the frontend.
- No financial logic in UI.
- No schema change without a migration.
- No migration without testing and recovery consideration.
- No integration without normalized event contract, idempotency, retry strategy, and reconciliation.
- No financial feature without ledger integration, reversal behavior, and tests.
- No protected endpoint without authorization tests.
- No dependency upgrade without compatibility verification.
- No secrets in source control.
- No speculative feature added merely because it is technically interesting.
- No invented product rule. Mark DECISION NEEDED.
- Use feature flags for risky, incomplete, or operationally sensitive features when appropriate.
## 31.4 Financial coding rules

- Use integer minor-unit money values.
- Never use floating-point money arithmetic.
- Calculate commission on the server/domain layer.
- Store the rule/snapshot used to calculate a commission.
- Use reversal/adjustment entries instead of rewriting financial history.
- Guard against duplicate processing with idempotency and DB constraints.
- Run financial calculations inside appropriate database transactions.
- Every ledger entry must balance.
## 31.5 Integration coding rules

- Provider-specific code belongs in adapters/integration modules.
- Core domain consumes normalized CODEK events.
- Verify webhook signature and replay protections before processing.
- Persist raw events for traceability.
- Support retries and DLQs.
- Expect out-of-order events.
- Reconciliation is not optional for financial integrations.
## 31.6 Security coding rules

- Auth and authorization are enforced server-side.
- Object-level authorization is checked using the current user and tenant context.
- Never rely on hidden frontend buttons to secure data.
- Sanitize/validate untrusted inputs.
- Restrict outbound HTTP to approved destinations when server-side fetching occurs.
- Prevent SSRF and open redirect risks.
- Never log secrets or unnecessary PII.
- Add tests for cross-tenant access.
## 31.7 UX coding rules

- Do not make users understand internal architecture.
- Use clear labels and sensible defaults.
- Hide advanced configuration behind progressive disclosure.
- Show status and next actions clearly.
- Every asynchronous action needs loading/success/failure behavior.
- Empty states should explain what to do next.
- Forms should validate before submission and return actionable errors.
- Desktop and mobile must remain usable.
- Accessibility basics must be implemented from the beginning.
## 31.8 Documentation rules

- Maintain CHANGELOG.
- Maintain ADR/decision records for material architecture decisions.
- Maintain a decision-needed log for unresolved product/legal/financial questions.
- Document migrations and operational changes.
- Keep API/OpenAPI definitions synchronized with implementation.
- Keep environment variables documented without exposing secrets.
## 31.9 Phase completion report

After every implementation phase, Claude must report only: implemented items, tests run and results, known limitations, migrations/config changes, security considerations, documentation updated, and the next approved phase. A feature must not be called production-ready merely because it compiles.

## 31.10 When Claude may stop for a decision

Stop and request a decision only when the unknown genuinely changes architecture, legal/financial behavior, security boundaries, data ownership, or a core product rule. Otherwise follow the documented default and continue.

## 31.11 Budget discipline

The project has a limited Claude session budget. Do not repeatedly regenerate the entire specification or ask the same context questions. Read persistent project docs, operate on focused slices, reuse existing work, and checkpoint frequently. A concise implementation prompt should refer back to this specification instead of embedding the entire specification into every request.

# 32. RELEASE GATES

- All critical unit/integration/E2E tests pass.
- Webhook security/replay/idempotency tests pass.
- Financial commission/refund/clawback/payout tests pass.
- Ledger invariants pass.
- Tenant isolation and authorization tests pass.
- Security review completed.
- Backup/restore test completed.
- Staging UAT completed.
- Monitoring/alerts configured.
- Production smoke tests pass.
- Rollback plan tested/documented.
- Reconciliation is operational before financial launch.
- Legal/compliance requirements for the target market are reviewed.
# 33. LAUNCH AND POST-LAUNCH MONITORING

## 33.1 Launch sequence

```text
Development → Staging → QA → Security Review → UAT → Production
```

## 33.2 Production monitoring

- Authentication failures
- API errors/latency
- Webhook backlog/failures
- Conversion mismatches
- Ledger invariant failures
- Funding shortfalls
- Payout failures
- Fraud anomalies
- Critical infrastructure health
## 33.3 Incident principle

Critical data must remain recoverable and auditable. Never “fix” incidents by deleting or overwriting evidence. Use explicit corrections, replays, reversals, or migrations with auditability.

# 34. DECISION NEEDED POLICY

The system may encounter unresolved details during implementation. Claude must not invent them. Use a decision-needed record with: question, why it matters, possible options, impact, current safe default if one exists, and status.

Examples that may require explicit product/legal decisions: exact commission base defaults per campaign type; precise payout provider availability by target market; customer data retention duration; exact refund timing; legal wording; provider-specific marketplace settlement capability; jurisdiction-specific disclosure requirements; launch-market restrictions.

# 35. CURRENT TECHNICAL/LEGAL REFERENCE NOTES (VERIFIED 2026-09-30)

These are verification notes, not permanent guarantees. Re-check provider/framework/legal status before a production release.

| Topic | Current verification |
| --- | --- |
| Node.js | v24 is LTS; v26 is Current as of 2026-09-30. Production baseline should remain on pinned LTS unless deliberately changed. |
| Next.js | 16.3.3 was identified by the August 25, 2026 security release as Active LTS. |
| PostgreSQL | 18.6 released August 13, 2026 and is the current PostgreSQL 18 minor in this baseline. |
| Prisma | Prisma ORM 8 is a release candidate as of 2026-09-30; use stable production branch until GA and compatibility testing. |
| Better Auth | DB-backed sessions and MFA plugins are documented; NestJS integration is community maintained, so pin and E2E test. |
| BullMQ | 6.x is the current major branch in the 2026 changelog; pin an exact tested release. |
| Jordan PDPL | Jordan Personal Data Protection Law No. 24 of 2023 came into effect March 17, 2024. |
| PayPal Jordan | PayPal developer documentation lists Jordan as Send, receive, and withdraw for payouts; this is not a guarantee of all marketplace settlement features. |
| Stripe/Jordan | Do not assume direct Stripe account availability for Jordan. Verify current country support and required provider structure before choosing Stripe for production merchant settlement. |

## Reference URLs

- Node.js releases: https://nodejs.org/en/about/previous-releases
- Next.js August 2026 security release: https://nextjs.org/blog
- PostgreSQL 18.6 release notes: https://www.postgresql.org/docs/release/18.6/
- Prisma release status: https://www.prisma.io/docs/orm/release-status
- Better Auth NestJS integration: https://better-auth.com/docs/integrations/nestjs
- Better Auth database/session documentation: https://better-auth.com/docs/concepts/database
- BullMQ changelog: https://docs.bullmq.io/changelog
- OWASP API Security: https://api-security.owasp.org/
- Jordan Personal Data Protection Unit: https://www.modee.gov.jo/EN/Pages/Personal_Data_Protection_Unit
- PayPal supported countries/features: https://developer.paypal.com/payouts/supported-features/
# 36. FINAL SOURCE-OF-TRUTH CHECKLIST

- The product is CODEK: creator/business partnership marketplace + attribution + commission + payout infrastructure.
- Customer normally has no CODEK account.
- Business and Creator are the principal marketplace roles; Admin is operational; Customer is external.
- Core domain chain is Business → Catalog Item → Campaign → Partnership → Promotion Assets → Conversion → Attribution → Commission → Ledger → Payout.
- Partnership terms are snapshotted.
- Attribution uses touchpoints + deterministic versioned decisions.
- Conversions require source-of-truth verification whenever possible.
- Commission is deterministic and snapshot-based.
- Financial state uses double-entry ledger concepts and immutable-style history.
- Available earnings are derived payout obligations, not a promise of escrow/custody.
- Payment providers are abstracted.
- Webhook processing is verified, idempotent, retryable, traceable, and reconciled.
- Security includes authz, tenant isolation, webhook protection, SSRF defense, rate limits, secrets management, and audit.
- Privacy and Jordan PDPL considerations are first-class requirements.
- The UX must remain simple for non-technical users; internal complexity stays behind the interface.
- V1 is a modular monolith, not microservices.
- Phases 22–25 are the detailed implementation layer; the overall Build Specification is complete enough to start execution.
- Claude must not invent missing requirements; it must use DECISION NEEDED records.
- Every phase ends with tests, diff review, docs, and checkpoint.
- No feature is production-ready until its release gates pass.
# FINAL AUDIT CROSSWALK — PHASES 1–25

This crosswalk exists to make it unambiguous that the original phased specification has been consolidated into this single document.

| Original phase | Covered in this document |
|---|---|
| Phase 1 | Product definition, actors, roles, customer model, UX foundations |
| Phase 2 | Business/creator marketplace and commercial workflow |
| Phase 3 | Campaigns, catalog, applications, invitations, partnerships |
| Phase 4 | Creator/business dashboards and operational UX |
| Phase 5 | Promotion codes, referral links, QR assets |
| Phase 6 | Tracking, sessions, touchpoints, attribution decisions |
| Phase 7 | Conversion model and source-of-truth verification |
| Phase 8 | Commission engine |
| Phase 9 | Double-entry financial ledger |
| Phase 10 | Funding, payments, payouts, provider abstraction |
| Phase 11 | Integrations, webhooks, normalized events |
| Phase 12 | Reconciliation and event lineage |
| Phase 13 | Notifications, messaging, deliverables, content rights |
| Phase 14 | Fraud, disputes, moderation, audit |
| Phase 15 | Privacy, Jordan PDPL, legal document versioning |
| Phase 16 | Analytics and metric provenance |
| Phase 17 | Verification/trust |
| Phase 18 | Technical architecture and infrastructure |
| Phase 19 | Testing, security, observability, DevOps, recovery |
| Phase 20 | Commercial model and unit economics |
| Phase 21 | Technical Specification v1 |
| Phase 22 | Detailed Data Dictionary |
| Phase 23 | API Contracts |
| Phase 24 | Screen-by-screen specification and UX acceptance |
| Phase 25 | Claude autonomous build protocol |

# FINAL AUDIT RESULT

The specification is the project Source of Truth for implementation. Claude must follow it as a whole rather than treating only one section as authoritative. The autonomous protocol is intentionally non-stop between normal implementation phases. GitHub is persistent project memory when connected. External credentials, legally sensitive choices, unavailable provider capabilities, and irreversible production actions remain genuine blockers rather than reasons to fabricate a solution.

# APPENDIX A — MASTER STATUS

| Area | Status |
| --- | --- |
| Product/Business Blueprint | Complete |
| Market/Competitor research | Complete enough for architecture and positioning; no unsupported uniqueness claims |
| Domain model | Defined |
| Financial architecture | Defined |
| Attribution architecture | Defined |
| Security baseline | Defined |
| Privacy/legal requirements | Defined as technical/product requirements; legal review still required before launch |
| Technical architecture | Defined |
| Database entity inventory | Defined |
| API inventory/contracts | Defined |
| Screen inventory/UX principles | Defined |
| Testing/release strategy | Defined |
| Claude execution protocol | Defined |
| Implementation readiness | Ready to begin; execution-specific decisions may still arise |

# APPENDIX B — GOLDEN RULE

> When an implementation choice is not explicitly specified, choose the safest documented default that preserves the domain model and future extensibility. Never invent a product, financial, legal, attribution, or security rule simply to make code compile.

# END OF CODEK MASTER BUILD SPECIFICATION

Version 1.2 | Final audited and consolidated on 2026-09-30


---

# IMPLEMENTATION ADDENDUM — FIELD-LEVEL DATA + API + SCREEN ACCEPTANCE

## Universal database conventions
- Primary IDs: UUID/opaque IDs.
- Created/updated timestamps: timestamptz stored in UTC.
- Money: integer minor units + ISO currency.
- Percentages/rates: Decimal, never Float.
- Use JSONB only for intentionally extensible configuration; queryable core fields are real columns.
- Foreign keys, scoped uniqueness, indexes, optimistic locking where needed, and idempotency are mandatory.

## Field-level dictionary

### users

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| email | citext/string | No; normalized |
| email_verified_at | timestamptz | Yes |
| display_name | text | Yes |
| status | enum(active,suspended,deleted) | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |
| last_login_at | timestamptz | Yes |

### sessions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| user_id | UUID FK users | No |
| token_hash | text | No |
| expires_at | timestamptz | No |
| created_at | timestamptz | No |
| last_seen_at | timestamptz | Yes |
| revoked_at | timestamptz | Yes |
| ip_hash | text | Yes |
| user_agent | text | Yes |

### accounts/credentials

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| user_id | UUID FK | No |
| provider | text | No |
| provider_account_id | text | Yes |
| password_hash | text | Yes; only for password auth |
| access_token_ref | text | Yes |
| refresh_token_ref | text | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### verification_tokens

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| user_id | UUID FK | Yes |
| purpose | enum(email_verification,password_reset,mfa_other) | No |
| token_hash | text | No |
| expires_at | timestamptz | No |
| used_at | timestamptz | Yes |
| created_at | timestamptz | No |

### roles

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| name | text | No |
| scope | enum(platform,business,creator) | No |
| description | text | Yes |

### permissions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| key | text | No; unique |
| description | text | Yes |

### role_permissions

| Field | Type | Required/Notes |
|---|---|---|
| role_id | UUID FK | No |
| permission_id | UUID FK | No |
| created_at | timestamptz | No |

### businesses

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| owner_user_id | UUID FK users | No |
| legal_name | text | No |
| display_name | text | No |
| slug | text | No; unique |
| category | text | No |
| description | text | Yes |
| country | char(2) | No |
| city | text | Yes |
| timezone | text/IANA | No |
| website_url | text | Yes |
| verification_status | enum(unverified,pending,verified,suspended,expired) | No |
| billing_ready | boolean | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### business_members

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| user_id | UUID FK | No |
| role_id | UUID FK | No |
| status | enum(invited,active,revoked) | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### creators

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| user_id | UUID FK users | No; unique |
| display_name | text | No |
| bio | text | Yes |
| avatar_file_id | UUID FK files | Yes |
| country | char(2) | Yes |
| city | text | Yes |
| languages | jsonb/text[] | Yes |
| categories | jsonb/text[] | Yes |
| verification_status | enum(unverified,pending,verified,suspended,expired) | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### social_accounts

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| creator_id | UUID FK | No |
| platform | text | No |
| platform_account_id | text | Yes |
| handle | text | Yes |
| profile_url | text | Yes |
| connection_status | enum(not_connected,connected,error,disconnected) | No |
| verification_state | enum(verified,self_reported) | No |
| follower_count | bigint | Yes |
| average_views | bigint | Yes |
| engagement_rate | decimal | Yes |
| likes_avg | bigint | Yes |
| comments_avg | bigint | Yes |
| audience_data | jsonb | Yes |
| source_platform_version | text | Yes |
| fetched_at | timestamptz | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### catalog_items

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| name | text | No |
| slug | text | No |
| type | enum(product,service,subscription,other) | No |
| description | text | Yes |
| price_minor | bigint | Yes |
| currency | char(3) | Yes |
| external_ref | text | Yes |
| active | boolean | No |
| media_ids | jsonb/relations | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### campaigns

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| catalog_item_id | UUID FK | No |
| name | text | No |
| slug | text | No |
| description | text | Yes |
| status | enum(draft,pending_review,published,active,paused,ended,archived) | No |
| start_at | timestamptz | Yes |
| end_at | timestamptz | Yes |
| timezone | text/IANA | No |
| creator_capacity | integer | Yes |
| participant_cap | integer | Yes; explicit maximum accepted/active creators, may mirror creator_capacity |
| application_deadline_at | timestamptz | Yes |
| waitlist_enabled | boolean | No |
| compensation_type | enum(commission_only,gift_commission,fixed_fee_commission,paid_content) | No |
| product_service_provided | boolean | No |
| destination_url | text | Yes; business-controlled purchase/booking/conversion destination |
| conversion_source_type | enum(webhook_api,pos,booking_api,redemption_interface,manual_evidence,other) | No |
| integration_id | UUID FK integrations | Yes |
| customer_discount_config | jsonb | No |
| commission_rule_id | UUID FK | Yes |
| attribution_policy_id/version | text/UUID | No |
| deliverable_config | jsonb | Yes |
| content_rights_config | jsonb | Yes |
| promotion_rules | jsonb | Yes |
| cancellation_refund_config | jsonb | Yes |
| legal_document_version | text | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### campaign_eligibility_rules

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| campaign_id | UUID FK | No |
| rule_type | text | No |
| operator | text | No |
| value | jsonb | No |
| enabled | boolean | No |

### campaign_applications

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| campaign_id | UUID FK | No |
| creator_id | UUID FK | No |
| status | enum(pending,waitlisted,accepted,rejected,withdrawn,expired) | No |
| message | text | Yes |
| submitted_at | timestamptz | No |
| reviewed_at | timestamptz | Yes |
| reviewed_by | UUID FK users | Yes |
| rejection_reason | text | Yes |
| waitlist_position | integer | Yes |

### partnerships

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| creator_id | UUID FK | No |
| campaign_id | UUID FK | No |
| status | enum(pending,active,paused,completed,cancelled,disputed,terminated) | No |
| accepted_at | timestamptz | Yes |
| ended_at | timestamptz | Yes |
| terms_snapshot_id | UUID FK | Yes |
| attribution_policy_version | text | No |
| commission_rule_version | text | No |
| legal_document_version | text | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### partnership_terms_snapshots

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| partnership_id | UUID FK | No |
| version | integer | No |
| terms_json | jsonb | No |
| commission_config | jsonb | No |
| discount_config | jsonb | No |
| deliverables_json | jsonb | Yes |
| content_rights_json | jsonb | Yes |
| promotion_rules_json | jsonb | Yes |
| payout_schedule_json | jsonb | Yes |
| hold_period_days | integer | Yes |
| refund_policy_json | jsonb | Yes |
| accepted_by | UUID FK users | No |
| accepted_at | timestamptz | No |
| hash | text | Yes |

### promotion_codes

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| campaign_id | UUID FK | No |
| partnership_id | UUID FK | No |
| creator_id | UUID FK | No |
| code | citext/text | No; scoped unique |
| normalized_code | text | No; indexed |
| status | enum(pending,active,paused,expired,revoked) | No |
| starts_at | timestamptz | Yes |
| expires_at | timestamptz | Yes |
| usage_limit | integer | Yes |
| per_customer_limit | integer | Yes |
| usage_count | integer | No |
| rules_json | jsonb | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### referral_links

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| partnership_id | UUID FK | No |
| slug/token | text | No; unique |
| destination_url | text | No |
| allowed_host | text | No |
| status | enum(pending,active,paused,expired,revoked) | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### qr_assets

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| partnership_id | UUID FK | No |
| referral_link_id | UUID FK | Yes |
| asset_file_id | UUID FK files | No |
| status | enum(active,expired,revoked) | No |
| created_at | timestamptz | No |

### tracking_clicks

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| campaign_id | UUID FK | Yes |
| partnership_id | UUID FK | Yes |
| creator_id | UUID FK | Yes |
| referral_link_id | UUID FK | Yes |
| occurred_at | timestamptz | No |
| session_key_hash | text | Yes |
| source | text | Yes |
| landing_url | text | Yes |
| user_agent_hash | text | Yes |
| ip_hash | text | Yes |

### tracking_sessions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| campaign_id | UUID FK | Yes |
| partnership_id | UUID FK | Yes |
| creator_id | UUID FK | Yes |
| session_key_hash | text | No |
| first_touch_at | timestamptz | Yes |
| last_touch_at | timestamptz | Yes |
| expires_at | timestamptz | Yes |
| consent_state | text | Yes |

### attribution_touchpoints

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| conversion_id | UUID FK | Yes |
| campaign_id | UUID FK | Yes |
| partnership_id | UUID FK | Yes |
| creator_id | UUID FK | Yes |
| method | enum(code,link,qr,other) | No |
| event_type | text | No |
| external_event_id | text | Yes |
| occurred_at | timestamptz | No |
| metadata | jsonb | Yes |
| dedupe_key | text | Yes |

### attribution_decisions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| conversion_id | UUID FK | No |
| selected_partnership_id | UUID FK | Yes |
| selected_creator_id | UUID FK | Yes |
| method | text | No |
| policy_version | text | No |
| window_seconds | bigint | Yes |
| competing_touchpoints | jsonb | Yes |
| conflict_state | enum(none,conflict,unresolved) | No |
| dedupe_state | enum(unique,duplicate,suspect) | No |
| decision_state | enum(attributed,unattributed,conflicted,invalid,duplicate) | No |
| decided_at | timestamptz | No |

### conversions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| campaign_id | UUID FK | Yes |
| partnership_id | UUID FK | Yes |
| creator_id | UUID FK | Yes |
| type | enum(sale,booking,redemption,lead,registration,other) | No |
| status | enum(received,validated,attributed,approved,rejected,cancelled,refunded,partially_refunded,reversed) | No |
| external_ref | text | Yes |
| gross_minor | bigint | Yes |
| discount_minor | bigint | Yes |
| tax_minor | bigint | Yes |
| shipping_fee_minor | bigint | Yes |
| other_fee_minor | bigint | Yes |
| net_minor | bigint | Yes |
| commissionable_minor | bigint | Yes |
| refunded_minor | bigint | Yes |
| currency | char(3) | Yes |
| verified_state | enum(verified,self_reported,unknown) | No |
| source_system | text | Yes |
| occurred_at | timestamptz | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### conversion_events

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| conversion_id | UUID FK | Yes |
| webhook_event_id | UUID FK | Yes |
| event_type | text | No |
| schema_version | text | No |
| source | text | No |
| external_event_id | text | Yes |
| occurred_at | timestamptz | No |
| received_at | timestamptz | No |
| payload_json | jsonb | No |
| processing_state | enum(received,processed,failed,ignored) | No |
| retry_count | integer | No |

### commission_rules

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| version | integer | No |
| type | enum(percentage,fixed,hybrid) | No |
| rate | decimal | Yes |
| fixed_minor | bigint | Yes |
| base_type | enum(gross,discounted,net,custom) | No |
| include_tax | boolean | No |
| include_shipping | boolean | No |
| excluded_items | jsonb | Yes |
| min_minor | bigint | Yes |
| max_minor | bigint | Yes |
| currency | char(3) | Yes |
| rounding_mode | enum(half_up,half_even,floor,ceil) | No |
| refund_behavior | enum(clawback,reverse,none) | No |
| active_from | timestamptz | No |
| active_to | timestamptz | Yes |
| created_at | timestamptz | No |

### commission_calculations

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| conversion_id | UUID FK | No |
| commission_rule_id | UUID FK | No |
| commission_rule_version | integer | No |
| base_minor | bigint | No |
| rate | decimal | Yes |
| fixed_minor | bigint | Yes |
| commission_minor | bigint | No |
| currency | char(3) | No |
| status | enum(pending,approved,funded,available,payout_requested,processing,paid,reversed,clawback) | No |
| calculated_at | timestamptz | No |
| approved_at | timestamptz | Yes |

### ledger_accounts

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | Yes |
| owner_type | enum(platform,business,creator,provider) | No |
| owner_id | UUID | Yes |
| account_type | text | No |
| currency | char(3) | No |
| status | enum(active,closed) | No |
| created_at | timestamptz | No |

### ledger_entries

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | Yes |
| entry_type | text | No |
| reference_type | text | Yes |
| reference_id | UUID | Yes |
| idempotency_key | text | Yes |
| effective_at | timestamptz | No |
| created_at | timestamptz | No |
| description | text | Yes |
| metadata | jsonb | Yes |

### ledger_entry_lines

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| ledger_entry_id | UUID FK | No |
| ledger_account_id | UUID FK | No |
| direction | enum(debit,credit) | No |
| amount_minor | bigint | No |
| currency | char(3) | No |
| line_order | integer | No |
| metadata | jsonb | Yes |

### merchant_fundings

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| amount_minor | bigint | No |
| currency | char(3) | No |
| funding_method | text | No |
| provider_transaction_id | UUID FK | Yes |
| status | enum(pending,confirmed,failed,reversed) | No |
| received_at | timestamptz | Yes |
| created_at | timestamptz | No |

### payouts

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| creator_id | UUID FK | No |
| business_id | UUID FK | Yes |
| amount_minor | bigint | No |
| currency | char(3) | No |
| status | enum(available,requested,processing,paid,failed,reversed,cancelled) | No |
| requested_at | timestamptz | No |
| processed_at | timestamptz | Yes |
| provider_transaction_id | UUID FK | Yes |
| failure_reason_code | text | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### payout_attempts

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| payout_id | UUID FK | No |
| attempt_number | integer | No |
| provider | text | No |
| provider_reference | text | Yes |
| status | enum(pending,processing,success,failed) | No |
| error_code | text | Yes |
| error_message_safe | text | Yes |
| started_at | timestamptz | No |
| finished_at | timestamptz | Yes |

### payment_provider_transactions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| provider | text | No |
| environment | enum(test,live) | No |
| provider_transaction_id | text | No |
| transaction_type | text | No |
| status | text | No |
| amount_minor | bigint | Yes |
| currency | char(3) | Yes |
| related_entity_type | text | Yes |
| related_entity_id | UUID | Yes |
| raw_reference | text | Yes |
| occurred_at | timestamptz | Yes |
| created_at | timestamptz | No |

### reconciliations

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| integration_id | UUID FK | No |
| scope_start | timestamptz | No |
| scope_end | timestamptz | No |
| status | enum(running,completed,failed,needs_review) | No |
| started_at | timestamptz | No |
| completed_at | timestamptz | Yes |
| summary_json | jsonb | Yes |

### reconciliation_items

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| reconciliation_id | UUID FK | No |
| entity_type | text | No |
| entity_id | UUID | Yes |
| external_ref | text | Yes |
| local_amount_minor | bigint | Yes |
| external_amount_minor | bigint | Yes |
| currency | char(3) | Yes |
| status | enum(matched,missing_local,missing_external,mismatch,duplicate,late) | No |
| difference_minor | bigint | Yes |
| notes | text | Yes |

### integrations

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | No |
| provider | text | No |
| category | enum(ecommerce,pos,booking,payment,crm,custom,other) | No |
| environment | enum(test,live) | No |
| status | enum(not_connected,connecting,connected,testing,live,paused,error,disconnected) | No |
| credential_ref_id | UUID FK | Yes |
| health_status | text | Yes |
| last_success_at | timestamptz | Yes |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### integration_credentials_refs

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| integration_id | UUID FK | No |
| secret_manager_key | text | No |
| credential_type | text | No |
| created_at | timestamptz | No |
| rotated_at | timestamptz | Yes |

### webhook_events

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| integration_id | UUID FK | Yes |
| provider | text | No |
| event_type | text | No |
| schema_version | text | No |
| provider_event_id | text | Yes |
| signature_valid | boolean | No |
| replay_check_passed | boolean | No |
| idempotency_key | text | Yes |
| occurred_at | timestamptz | Yes |
| received_at | timestamptz | No |
| raw_payload | jsonb | No |
| processing_state | enum(received,queued,processing,processed,failed,ignored,dead_letter) | No |
| retry_count | integer | No |
| last_error_code | text | Yes |

### outbox_events

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| event_type | text | No |
| schema_version | text | No |
| aggregate_type | text | No |
| aggregate_id | UUID | No |
| payload_json | jsonb | No |
| status | enum(pending,processing,published,failed) | No |
| attempt_count | integer | No |
| next_attempt_at | timestamptz | Yes |
| created_at | timestamptz | No |

### notifications

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| user_id | UUID FK | No |
| type | text | No |
| channel | enum(in_app,email,push,sms,whatsapp) | No |
| title | text | No |
| body | text | No |
| data_json | jsonb | Yes |
| read_at | timestamptz | Yes |
| sent_at | timestamptz | Yes |
| created_at | timestamptz | No |

### notification_preferences

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| user_id | UUID FK | No |
| notification_type | text | No |
| in_app_enabled | boolean | No |
| email_enabled | boolean | No |
| push_enabled | boolean | No |
| sms_enabled | boolean | No |
| whatsapp_enabled | boolean | No |

### conversations

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| partnership_id | UUID FK | No |
| business_id | UUID FK | No |
| creator_id | UUID FK | No |
| status | enum(active,closed) | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### messages

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| conversation_id | UUID FK | No |
| sender_user_id | UUID FK | No |
| message_type | enum(text,image,file,system) | No |
| body | text | Yes |
| file_id | UUID FK files | Yes |
| created_at | timestamptz | No |
| edited_at | timestamptz | Yes |
| deleted_at | timestamptz | Yes |

### deliverables

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| partnership_id | UUID FK | No |
| type | text | No |
| description | text | Yes |
| due_at | timestamptz | Yes |
| status | enum(not_started,submitted,changes_requested,resubmitted,approved) | No |
| required | boolean | No |
| created_at | timestamptz | No |
| updated_at | timestamptz | No |

### content_submissions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| deliverable_id | UUID FK | No |
| creator_id | UUID FK | No |
| file_id | UUID FK files | Yes |
| url | text | Yes |
| caption | text | Yes |
| status | enum(submitted,approved,changes_requested,resubmitted,rejected) | No |
| submitted_at | timestamptz | No |
| reviewed_at | timestamptz | Yes |
| reviewed_by | UUID FK users | Yes |
| review_note | text | Yes |

### content_rights

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| partnership_id | UUID FK | No |
| ownership | text | No |
| organic_allowed | boolean | No |
| paid_ads_allowed | boolean | No |
| whitelisting_allowed | boolean | No |
| duration_days | integer | Yes |
| territory | text | Yes |
| exclusivity_json | jsonb | Yes |
| created_at | timestamptz | No |

### verification_cases

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| subject_type | enum(business,creator,user) | No |
| subject_id | UUID | No |
| status | enum(unverified,pending,verified,suspended,expired,rejected) | No |
| reviewer_user_id | UUID FK users | Yes |
| evidence_json | jsonb | Yes |
| reason_code | text | Yes |
| created_at | timestamptz | No |
| resolved_at | timestamptz | Yes |

### fraud_flags

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | Yes |
| subject_type | text | No |
| subject_id | UUID | No |
| signal_type | text | No |
| severity | enum(low,medium,high,critical) | No |
| score | decimal | Yes |
| evidence_json | jsonb | Yes |
| status | enum(open,reviewing,resolved,dismissed) | No |
| created_at | timestamptz | No |
| resolved_at | timestamptz | Yes |

### fraud_cases

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | Yes |
| subject_type | text | No |
| subject_id | UUID | No |
| status | enum(open,evidence,review,decision,closed) | No |
| risk_level | enum(low,medium,high,critical) | No |
| summary | text | No |
| resolution_code | text | Yes |
| reviewer_user_id | UUID FK users | Yes |
| created_at | timestamptz | No |
| closed_at | timestamptz | Yes |

### disputes

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | Yes |
| creator_id | UUID FK | Yes |
| partnership_id | UUID FK | Yes |
| conversion_id | UUID FK | Yes |
| type | text | No |
| status | enum(open,evidence,hold,review,decision,adjustment,closed) | No |
| opened_by_user_id | UUID FK users | No |
| summary | text | No |
| decision_code | text | Yes |
| created_at | timestamptz | No |
| closed_at | timestamptz | Yes |

### dispute_evidence

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| dispute_id | UUID FK | No |
| submitted_by | UUID FK users | No |
| file_id | UUID FK files | Yes |
| external_url | text | Yes |
| description | text | Yes |
| created_at | timestamptz | No |

### admin_actions

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| admin_user_id | UUID FK users | No |
| action_type | text | No |
| target_type | text | No |
| target_id | UUID | No |
| reason | text | No |
| approval_state | enum(not_required,pending,approved,rejected) | No |
| approved_by | UUID FK users | Yes |
| created_at | timestamptz | No |

### audit_logs

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| actor_user_id | UUID FK users | Yes |
| tenant_business_id | UUID FK businesses | Yes |
| action | text | No |
| object_type | text | No |
| object_id | UUID | Yes |
| before_json | jsonb | Yes |
| after_json | jsonb | Yes |
| reason | text | Yes |
| ip_hash | text | Yes |
| created_at | timestamptz | No |

### files/media

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| owner_type | text | No |
| owner_id | UUID | No |
| storage_key | text | No |
| mime_type | text | No |
| size_bytes | bigint | No |
| checksum | text | Yes |
| purpose | text | No |
| visibility | enum(private,restricted,public) | No |
| created_at | timestamptz | No |
| deleted_at | timestamptz | Yes |

### billing_customers/subscriptions/invoices

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| business_id | UUID FK | Yes |
| provider | text | No |
| provider_customer_id | text | Yes |
| provider_subscription_id | text | Yes |
| provider_invoice_id | text | Yes |
| status | text | No |
| plan_key | text | Yes |
| amount_minor | bigint | Yes |
| currency | char(3) | Yes |
| period_start | timestamptz | Yes |
| period_end | timestamptz | Yes |
| created_at | timestamptz | No |

### legal_documents

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| document_type | text | No |
| version | text | No |
| jurisdiction | char(2) | Yes |
| content_hash | text | No |
| status | enum(draft,published,retired) | No |
| published_at | timestamptz | Yes |
| created_at | timestamptz | No |

### legal_acceptances

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| user_id | UUID FK | No |
| business_id | UUID FK | Yes |
| creator_id | UUID FK | Yes |
| legal_document_id | UUID FK | No |
| accepted_at | timestamptz | No |
| ip_hash | text | Yes |
| user_agent_hash | text | Yes |

### feature_flags/system_settings

| Field | Type | Required/Notes |
|---|---|---|
| id | UUID PK | No |
| key | text | No; unique |
| value_json | jsonb | No |
| environment | enum(dev,staging,production) | No |
| enabled | boolean | No |
| description | text | Yes |
| updated_by | UUID FK users | Yes |
| updated_at | timestamptz | No |

## API contract baseline

### Standard success envelope
```json
{"data": <resource or result>, "meta": {"requestId": "..."}}
```

### Standard error envelope
```json
{"error": {"code": "MACHINE_READABLE_CODE", "message": "Human-readable safe message", "details": {}, "requestId": "..."}}
```

### Key request contracts

| Route | Method | Request baseline | Server responsibility |
|---|---|---|---|
| /auth/sign-up | POST | role, email, password, displayName, acceptedLegalDocumentIds[] | Create user and role-specific onboarding state |
| /auth/sign-in | POST | email, password | Start authenticated session |
| /businesses/:id/catalog | POST | name, type, description, priceMinor, currency, mediaIds[], externalRef | Create catalog item |
| /businesses/:id/campaigns | POST | catalogItemId, name, description, startAt, endAt, timezone, compensationType, discountConfig, commissionConfig, attributionPolicy, deliverables, contentRights, promotionRules | Create campaign; server snapshots/version-controls rules |
| /campaigns/:id/publish | POST | none or publish metadata | Publish only when validation gates pass |
| /campaigns/:id/apply | POST | message | Submit creator application |
| /applications/:id/accept | POST | termsAcceptance/legal version if required | Accept application; create partnership and snapshots |
| /businesses/:id/invitations | POST | creatorId, campaignId, message, proposedTerms | Invite creator |
| /track/click | POST | referralToken, timestamp, consentState where needed | Record referral touchpoint; no commission |
| /redemptions | POST | promotionCode, externalRef, conversionContext | Controlled redemption; server validates campaign/code/rules |
| /businesses/:id/funding | POST | amountMinor, currency, fundingMethod, providerReference if applicable | Record/fund merchant obligation through provider workflow |
| /creator/payouts/request | POST | amountMinor or eligibleBalanceSelection | Request payout from eligible server-derived amount |
| /integrations/:provider/connect | POST | provider-specific non-secret config/authorization result | Create connection state; secrets go to secret manager |
| /integrations/:id/test | POST | none | Run connection test and record result |
| /integrations/:id/reconcile | POST | scopeStart, scopeEnd | Run/queue reconciliation job |
| /integrations/:id/disconnect | POST | none | Disable connection while preserving history |

## Screen acceptance

Every screen must have purpose, role-aware actions, API data source, validation, loading/empty/error/success states, audit requirements, responsive behavior, and accessibility behavior.

## Definition of done

- **Auth/RBAC:** Signup/login/session/recovery tested; tenant and role checks tested; MFA-ready; no protected endpoint without authz tests.
- **Catalog/Campaigns:** CRUD + lifecycle + validation + scoped ownership + campaign rule versioning + audit for important changes.
- **Applications/Partnerships:** Application/invite/accept/reject states, terms snapshot, legal acceptance, immutable historical terms.
- **Promotion:** Unique code/link/QR, normalization, expiry/revoke, allowlisted destination, concurrency tests.
- **Tracking/Attribution:** Touchpoints, policy version, deterministic decision, conflicts, dedupe, attribution limitations documented.
- **Conversions:** Raw/normalized event lineage, source-of-truth status, verified/self-reported labeling, refund handling.
- **Commission/Ledger:** Server calculation, snapshot, balanced ledger, reversals, holds, idempotency, financial test suite.
- **Funding/Payout:** Eligibility derived from ledger, provider abstraction, attempts/retries, failures retained, reconciliation.
- **Integrations:** Adapter, auth, test mode, webhooks, signature/replay/idempotency, queue, DLQ, reconciliation, disconnect history retention.
- **Messaging/Deliverables:** Partnership-scoped access, moderation/limits, submission lifecycle, rights recorded.
- **Fraud/Disputes:** Signal → case → review, evidence, hold, decision, reversal/adjustment, audit.
- **Analytics:** Provenance/status, reconciliation with ledger where applicable, no customer PII, exports.
- **Admin:** Strong authorization, audit, safe financial operations, no silent destructive changes.
- **Deployment:** Staging/prod separation, monitoring, backups, restore test, rollback, smoke tests.

## Claude.MD execution checklist

```text
1. Read CODEK_MASTER_BUILD_SPECIFICATION and all docs before editing.
2. Inspect repository and current implementation.
3. Identify the smallest approved slice.
4. State the plan briefly.
5. Implement without inventing business rules.
6. Add/update migration if schema changes.
7. Add relevant tests.
8. Run lint/typecheck/tests.
9. Run relevant security checks.
10. Review git diff.
11. Update docs/API/ADR/CHANGELOG.
12. Create a checkpoint.
13. Report implemented/tested/limitations/next step.
14. Continue automatically for routine implementation; stop only for genuine architecture/legal/financial/security/product decisions.
```

## Do not do this
- Do not build the entire platform blindly in one pass.
- Do not replace the Modular Monolith with microservices without a decision.
- Do not use Float for money.
- Do not mutate historical ledger entries to fix errors.
- Do not award commission from clicks/unverified claims alone.
- Do not silently rewrite historical attribution or partnership terms.
- Do not accept duplicate webhooks as new financial events.
- Do not store provider secrets in plaintext.
- Do not trust the frontend as the security boundary.
- Do not allow arbitrary referral redirects.
- Do not expose customer PII in normal analytics.
- Do not imply payout balance equals custody/escrow.
- Do not make unsupported uniqueness claims.
- Do not claim 100% attribution.
- Do not call features production-ready without release gates.

## Project owner / execution context

The project owner is not a programmer and relies heavily on Claude. Use persistent documentation, clear checkpoints, focused implementation slices, and avoid unnecessary questions. The project has an approximately $100 Claude session budget, so maximize context reuse and avoid repeated full-context generation.


## Autonomous Build Session — NON-STOP EXECUTION MODE

CODEK is intended to be built in an autonomous Claude session. The owner does **not** want to manually approve or trigger every phase.

### Core rule
Claude must continue through the entire approved build plan automatically. A completed phase is a checkpoint, **not** a request for owner approval.

Claude should only stop for a genuine blocker that cannot safely be resolved from this specification, such as:
- a required external credential/account that the owner must supply
- a genuinely undefined legal/regulatory decision
- a payment-provider capability/contract selection that must be made
- an irreversible production action requiring explicit authorization
- a contradictory or missing core product rule
- a material architecture/security decision where proceeding would create significant risk

Routine implementation uncertainty is not a reason to stop. Use documented defaults, conservative implementation, feature flags, adapters, or a documented decision/TODO, then continue.

### GitHub persistence
The connected Git repository is persistent project memory.

Claude must:
- commit coherent checkpoints frequently
- push to the configured remote when the environment permits
- preserve meaningful history
- never commit secrets
- maintain `docs/IMPLEMENTATION_STATUS.md`
- maintain `docs/DECISIONS.md`
- maintain `docs/KNOWN_LIMITATIONS.md`
- maintain `.env.example`
- leave an exact resume point if the session ends or is interrupted

The project must be resumable by a new Claude session without requiring the owner to explain CODEK again.

### Autonomous build order
1. Inspect repository and environment.
2. Repo/tooling/monorepo/configuration.
3. PostgreSQL/Prisma schema, migrations, seed strategy, database tests.
4. Authentication, sessions, users, roles, permissions, tenant authorization.
5. Business and Creator profiles/onboarding.
6. Catalog Items and Campaigns.
7. Applications, Invitations, Partnerships, immutable term snapshots.
8. Promotion Codes, Referral Links, QR assets.
9. Tracking, Sessions, Touchpoints, Attribution Decisions.
10. Conversions and normalized event lineage.
11. Commission Rules, Calculations, Double-Entry Ledger, reversals, holds, financial invariants.
12. Funding and Payout abstraction.
13. Integrations, provider adapters, webhooks, idempotency, queues, retries, DLQ, reconciliation.
14. Notifications, messaging, deliverables, content submissions, content rights.
15. Verification, Fraud, Disputes, Moderation, Audit.
16. Analytics/reporting.
17. Billing/Pricing.
18. Public website, Creator UI, Business UI, Admin UI.
19. Security hardening, accessibility basics, performance, observability, backups, restore testing.
20. Staging/production deployment configuration, smoke tests, rollback, monitoring, recovery.
21. Complete final test/review matrix and update implementation status.

### Continuous execution loop
`Inspect → Plan → Implement → Migrate → Test → Security Check → Run Tests → Review Diff → Update Docs → Commit → Push when available → Checkpoint → Continue`

Do not pause for owner confirmation between these steps.

If a test fails, diagnose and fix it before advancing unless the failure is caused by a genuine external blocker. Record external blockers and continue with unrelated safe work where possible.

Do not mark a phase complete while its defined tests or acceptance criteria are failing.

---

## MASTER AUTONOMOUS SESSION PROMPT

```text
You are the primary autonomous engineering agent for CODEK.

The attached CODEK_MASTER_BUILD_SPECIFICATION is the authoritative Source of Truth. Read it completely before making architectural or product decisions.

Your job is to BUILD THE ENTIRE CODEK PROJECT inside the connected development environment and repository, not to merely explain how to build it.

AUTONOMOUS EXECUTION IS REQUIRED:
- Do not ask me to approve each phase.
- Do not stop after each phase.
- Do not wait for me between normal implementation steps.
- Continue through the complete documented build order automatically.
- Use GitHub as persistent project storage and commit/push coherent checkpoints when available.
- If the session is interrupted, leave exact persistent status so another session can resume without re-explaining the project.

FIRST:
1. Inspect the repository and Git state.
2. Inspect the current files and determine whether the repository is empty, partially built, or already contains CODEK work.
3. Inspect available runtime/tooling, package manager, Node version, environment configuration, database availability, and connected services.
4. Read the entire CODEK Master Specification and relevant existing project docs.
5. Create/update docs/IMPLEMENTATION_STATUS.md, docs/DECISIONS.md, docs/KNOWN_LIMITATIONS.md, and any required project instructions.
6. Create a safe .env.example. Never commit secrets.
7. Begin the documented autonomous build order.

BUILD REQUIREMENTS:
- Build the complete production-oriented CODEK system: frontend, backend, API, database, migrations, seed strategy, authentication, authorization, marketplace, campaigns, partnerships, codes, links, QR, tracking, attribution, conversions, commission engine, double-entry ledger, funding, payout abstraction, integrations, webhooks, queues, reconciliation, notifications, messaging, deliverables, content rights, verification, fraud, disputes, admin, analytics, billing, security, testing, observability, deployment and recovery setup.
- Follow the exact architecture and constraints in the Master Specification.
- Use Modular Monolith V1; do not introduce microservices without a documented architecture decision.
- Use the specified TypeScript/Next.js/NestJS/PostgreSQL/Prisma/Redis/BullMQ stack and verify exact current compatible versions before installing dependencies.
- Never put authoritative financial calculations in the frontend.
- Never let the frontend bypass backend authorization.
- Never directly mutate ledger history to fix errors; use reversals/adjustments.
- Never award commission from an unverified client-side claim alone.
- Never silently rewrite historical attribution, partnership terms, commission calculations, or financial records.
- Every integration must have normalized events, signature verification where applicable, replay protection, idempotency, retries, DLQ, and reconciliation.
- Every protected endpoint needs authorization tests.
- Every schema change needs a migration and relevant tests.
- Every financial feature needs ledger/reversal/concurrency/rounding tests.
- Preserve auditability.

DECISION RULE:
If the specification already defines the behavior, follow it.
If a routine implementation detail is unspecified, choose the smallest conservative production-safe implementation and document it.
Ask me ONLY if the missing decision genuinely changes core product behavior, architecture, security boundaries, legal/regulatory behavior, money movement, required external account ownership, or an irreversible production action.
Do not ask routine questions.

EXTERNAL SERVICES:
If a production external service requires credentials that are not available, implement the adapter, interfaces, configuration, test mode, mocks/sandbox support, validation, and documentation so the system is ready for the credential. Continue building all other safe parts instead of stopping the whole project.

QUALITY LOOP:
For every major slice:
inspect → plan → implement → migrate → test → security check → lint/typecheck → integration/E2E where applicable → review diff → update docs → commit → push when possible → continue.

FINAL OBJECTIVE:
Do not stop at a prototype.
Continue until the repository contains the fullest verified CODEK implementation that can be built within the available environment and session.

At the end, leave:
- working code
- migrations
- tests
- docs
- implementation status
- decisions
- known limitations
- deployment configuration
- recovery/resume information
- meaningful Git checkpoints

Do not tell me how I could build it. Build it.

Start now.
```


## External references verified 2026-09-30

- Node.js: https://nodejs.org/en/about/previous-releases
- Next.js: https://nextjs.org/blog
- PostgreSQL 18.6: https://www.postgresql.org/docs/release/18.6/
- Prisma: https://www.prisma.io/docs/orm/release-status
- Better Auth NestJS: https://better-auth.com/docs/integrations/nestjs
- Better Auth database: https://better-auth.com/docs/concepts/database
- BullMQ: https://docs.bullmq.io/changelog
- OWASP API Security: https://api-security.owasp.org/
- Jordan PDPL: https://www.modee.gov.jo/EN/Pages/Personal_Data_Protection_Unit
- PayPal payouts: https://developer.paypal.com/payouts/supported-features/
