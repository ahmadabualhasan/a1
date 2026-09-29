import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizedOrderSchema, Postings } from '@codek/domain';
import { ConversionsService } from '../src/modules/conversions/conversions.service';
import { CommissionService } from '../src/modules/finance/commission.service';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { setupPartnership, setupLiveCampaign, setupCreator, startApp, type TestContext } from './harness';

let ctx: TestContext;
let pipeline: ConversionsService;
let ledger: LedgerService;
let commissions: CommissionService;
beforeAll(async () => {
  ctx = await startApp();
  pipeline = ctx.app.get(ConversionsService);
  ledger = ctx.app.get(LedgerService);
  commissions = ctx.app.get(CommissionService);
});
afterAll(async () => ctx.app.close());

function order(type: string, ref: string, extra: Record<string, unknown> = {}) {
  return normalizedOrderSchema.parse({
    eventType: type,
    externalEventId: `${type}:${ref}:${randomUUID().slice(0, 6)}`,
    externalRef: ref,
    occurredAt: new Date().toISOString(),
    currency: 'JOD',
    grossMinor: 10000,
    discountMinor: 1000,
    taxMinor: 1600,
    shippingMinor: 500,
    ...extra,
  });
}

const ingest = (businessId: string, event: ReturnType<typeof order>, sourceSystem = 'custom') => pipeline.ingest({ businessId, sourceSystem, verifiedState: 'verified', event });

async function creatorBalances(creatorId: string) {
  const rows = await ledger.ownerBalances(ctx.prisma, 'creator', creatorId);
  const get = (t: string) => rows.find((r) => r.accountType === t)?.balanceMinor ?? 0n;
  return { pending: get('creator_pending'), payable: get('creator_payable'), available: get('creator_available'), clawback: get('creator_clawback_receivable') };
}

describe('tracking redirect', () => {
  it('redirects only to the allowlisted destination and records a click with codek_ref', async () => {
    const s = await setupPartnership(ctx);
    const r = await ctx.http().get(`/r/${s.referralToken}`).set('User-Agent', 'Mozilla/5.0');
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.location);
    expect(loc.hostname).toBe('shop.acme.example');
    const ref = loc.searchParams.get('codek_ref')!;
    expect(ref).toMatch(/^ck_/);
    const click = await ctx.prisma.trackingClick.findUniqueOrThrow({ where: { clickRef: ref } });
    expect(click.partnershipId).toBe(s.partnershipId);
    expect(click.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(r.headers['set-cookie']?.[0]).toMatch(/codek_ts=.*HttpOnly/);
    const qr = await ctx.http().get(`/r/${s.referralToken}?src=qr`);
    expect((await ctx.prisma.trackingClick.findUniqueOrThrow({ where: { clickRef: new URL(qr.headers.location).searchParams.get('codek_ref')! } })).method).toBe('qr');
    const unknown = await ctx.http().get('/r/doesnotexist1');
    expect(unknown.headers.location).toBe('http://localhost:3000/link-unavailable');
    const evil = await ctx.http().get('/r/..%2F..%2Fevil');
    expect(evil.status === 302 ? evil.headers.location : 'http://localhost:3000/link-unavailable').toBe('http://localhost:3000/link-unavailable');
  });

  it('track/click API records a touchpoint but creates no conversion', async () => {
    const s = await setupPartnership(ctx);
    const r = await ctx.http().post('/api/v1/track/click').send({ referralToken: s.referralToken, consentState: 'granted' });
    expect(r.status).toBe(202);
    expect(r.body.data.recorded).toBe(true);
    expect(await ctx.prisma.conversion.count({ where: { partnershipId: s.partnershipId } })).toBe(0);
  });
});

describe('conversion → attribution → commission → ledger', () => {
  it('code order: attributed, commission from snapshot, balanced accrual; duplicate is a no-op', async () => {
    const s = await setupPartnership(ctx);
    const ev = order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code.toLowerCase()] });
    const r = await ingest(s.live.businessId, ev);
    expect(r.outcome).toBe('processed');
    expect(r.decisionState).toBe('attributed');
    const conv = await ctx.prisma.conversion.findUniqueOrThrow({ where: { id: r.conversionId! }, include: { commission: true } });
    expect(conv).toMatchObject({ status: 'attributed', partnershipId: s.partnershipId, verifiedState: 'verified' });
    // discounted base: 10000 - 1000 = 9000; 15% = 1350
    expect(conv.commission!.baseMinor).toBe(9000n);
    expect(conv.commission!.commissionMinor).toBe(1350n);
    expect(conv.commission!.status).toBe('pending');
    expect((await creatorBalances(s.creator.creatorId)).pending).toBe(1350n);
    const dup = await ingest(s.live.businessId, ev);
    expect(dup.outcome).toBe('duplicate');
    expect(await ctx.prisma.conversion.count({ where: { partnershipId: s.partnershipId } })).toBe(1);
    expect(await ctx.prisma.ledgerEntry.count({ where: { referenceId: conv.commission!.id } })).toBe(1);
    const code = await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: s.partnershipId } });
    expect(code.usageCount).toBe(1);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('full lifecycle: paid → approved → funded → released after hold → available', async () => {
    const s = await setupPartnership(ctx);
    const ref = `o-${randomUUID()}`;
    const created = await ingest(s.live.businessId, order('ORDER_CREATED', ref, { discountCodes: [s.code] }));
    await ingest(s.live.businessId, order('ORDER_PAID', ref));
    let calc = await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: created.conversionId! } });
    expect(calc.status).toBe('approved'); // no funding yet → stays approved
    expect((await ctx.prisma.conversion.findUniqueOrThrow({ where: { id: created.conversionId! } })).status).toBe('approved');
    expect((await creatorBalances(s.creator.creatorId)).payable).toBe(1350n);
    await ctx.prisma.$transaction(async (tx) => {
      await ledger.post(tx, Postings.fundingReceived(s.live.businessId, 'JOD', 5000n), { businessId: s.live.businessId, idempotencyKey: `test-funding:${randomUUID()}` });
      await commissions.allocateFunding(tx, s.live.businessId, 'JOD');
    });
    calc = await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { id: calc.id } });
    expect(calc.status).toBe('funded');
    await ctx.prisma.$transaction((tx) => commissions.releaseDue(tx, new Date()));
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { id: calc.id } })).status).toBe('funded'); // 14-day hold
    await ctx.prisma.$transaction((tx) => commissions.releaseDue(tx, new Date(Date.now() + 15 * 86400000)));
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { id: calc.id } })).status).toBe('available');
    const b = await creatorBalances(s.creator.creatorId);
    expect(b).toMatchObject({ pending: 0n, payable: 0n, available: 1350n });
    const merchant = await ledger.ownerBalances(ctx.prisma, 'business', s.live.businessId);
    expect(merchant.find((m) => m.accountType === 'merchant_funding')!.balanceMinor).toBe(5000n - 1350n);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('partial then full refund reverse proportionally, never beyond the original', async () => {
    const s = await setupPartnership(ctx);
    const ref = `o-${randomUUID()}`;
    const c = await ingest(s.live.businessId, order('ORDER_CREATED', ref, { discountCodes: [s.code] }));
    // customer total = 10000 - 1000 + 1600 + 500 = 11100 → half refund
    await ingest(s.live.businessId, order('ORDER_REFUNDED', ref, { refundedTotalMinor: 5550 }));
    let calc = await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: c.conversionId! } });
    expect(calc.reversedMinor).toBe(675n);
    expect((await ctx.prisma.conversion.findUniqueOrThrow({ where: { id: c.conversionId! } })).status).toBe('partially_refunded');
    // an older, smaller cumulative refund arriving late changes nothing
    await ingest(s.live.businessId, order('ORDER_REFUNDED', ref, { refundedTotalMinor: 1000 }));
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { id: calc.id } })).reversedMinor).toBe(675n);
    await ingest(s.live.businessId, order('ORDER_REFUNDED', ref, { refundedTotalMinor: 11100 }));
    calc = await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { id: calc.id } });
    expect(calc).toMatchObject({ reversedMinor: 1350n, status: 'reversed' });
    expect((await creatorBalances(s.creator.creatorId)).pending).toBe(0n);
    await expect(ctx.prisma.commissionCalculation.update({ where: { id: calc.id }, data: { commissionMinor: 1n } })).rejects.toThrow(/IMMUTABLE/);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('out-of-order: refund and paid before the order are parked/replayed correctly', async () => {
    const s = await setupPartnership(ctx);
    const ref = `o-${randomUUID()}`;
    const early = await ingest(s.live.businessId, order('ORDER_REFUNDED', ref, { refundedTotalMinor: 11100 }));
    expect(early.outcome).toBe('awaiting_conversion');
    const c = await ingest(s.live.businessId, order('ORDER_CREATED', ref, { discountCodes: [s.code] }));
    const conv = await ctx.prisma.conversion.findUniqueOrThrow({ where: { id: c.conversionId! }, include: { commission: true, events: true } });
    expect(conv.status).toBe('refunded');
    expect(conv.commission!.status).toBe('reversed');
    expect(conv.events.find((e) => e.eventType === 'ORDER_REFUNDED')!.processingNote).toBe('replayed_after_conversion');

    const ref2 = `o-${randomUUID()}`;
    const paidFirst = await ingest(s.live.businessId, order('ORDER_PAID', ref2, { discountCodes: [s.code] }));
    expect(paidFirst.outcome).toBe('processed');
    const created = await ingest(s.live.businessId, order('ORDER_CREATED', ref2, { discountCodes: [s.code] }));
    expect(created.conversionId).toBe(paidFirst.conversionId);
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: created.conversionId! } })).status).toBe('approved');
  });

  it('conflict: link from creator A, code from creator B → code_first credits B and records the conflict', async () => {
    const live = await setupLiveCampaign(ctx);
    const a = await setupCreator(ctx);
    const b = await setupCreator(ctx);
    const partner = async (cr: typeof a) => {
      const app = await cr.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {});
      return (await live.client.post(`/api/v1/applications/${app.body.data.id}/accept`)).body.data;
    };
    const pa = await partner(a);
    const pb = await partner(b);
    const click = await ctx.http().get(`/r/${pa.assets.token}`);
    const clickRef = new URL(click.headers.location).searchParams.get('codek_ref');
    const r = await ingest(live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [pb.assets.code], referralClickId: clickRef }));
    const d = await ctx.prisma.attributionDecision.findFirstOrThrow({ where: { conversionId: r.conversionId! } });
    expect(d).toMatchObject({ decisionState: 'attributed', conflictState: 'conflict', selectedPartnershipId: pb.partnership.id, reason: 'CODE_PRECEDENCE', policyVersion: '1', model: 'code_first' });
    expect((d.competingTouchpoints as unknown[]).length).toBe(2);
    expect(await ctx.prisma.attributionTouchpoint.count({ where: { conversionId: r.conversionId! } })).toBe(2);
    await expect(ctx.prisma.attributionDecision.update({ where: { id: d.id }, data: { reason: 'x' } })).rejects.toThrow(/IMMUTABLE/);
  });

  it('link-only attribution via click ref; unknown codes are ignored; other business codes do not match', async () => {
    const s = await setupPartnership(ctx);
    const click = await ctx.http().get(`/r/${s.referralToken}`);
    const clickRef = new URL(click.headers.location).searchParams.get('codek_ref');
    const r = await ingest(s.live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: ['WELCOME10'], referralClickId: clickRef }));
    expect(r.decisionState).toBe('attributed');
    const other = await setupLiveCampaign(ctx);
    const r2 = await ingest(other.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code], referralClickId: clickRef }));
    expect(r2.decisionState).toBe('unattributed');
    expect(await ctx.prisma.commissionCalculation.count({ where: { conversionId: r2.conversionId! } })).toBe(0);
  });

  it('per-customer limit makes a repeat use ineligible (invalid, no commission)', async () => {
    const s = await setupPartnership(ctx);
    const first = await ingest(s.live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code], customerRef: 'cust-123' }));
    expect(first.decisionState).toBe('attributed');
    const second = await ingest(s.live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code], customerRef: 'cust-123' }));
    expect(second.decisionState).toBe('invalid');
    const tp = await ctx.prisma.attributionTouchpoint.findFirstOrThrow({ where: { conversionId: second.conversionId! } });
    expect(tp.ineligibleReason).toBe('PER_CUSTOMER_LIMIT_REACHED');
    const conv = await ctx.prisma.conversion.findUniqueOrThrow({ where: { id: second.conversionId! } });
    expect(conv.customerRefHash).not.toContain('cust-123');
  });

  it('currency mismatch is held for review instead of guessing FX', async () => {
    const s = await setupPartnership(ctx);
    const r = await ingest(s.live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code], currency: 'USD' }));
    const conv = await ctx.prisma.conversion.findUniqueOrThrow({ where: { id: r.conversionId! } });
    expect(conv.reviewReason).toBe('CURRENCY_MISMATCH');
    expect(await ctx.prisma.commissionCalculation.count({ where: { conversionId: conv.id } })).toBe(0);
  });

  it('malformed amounts are rejected before any effect', async () => {
    const s = await setupPartnership(ctx);
    await expect(ingest(s.live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code], discountMinor: 999999 }))).rejects.toThrow(/Discount/);
  });

  it('concurrent duplicate deliveries create exactly one conversion and one ledger effect', async () => {
    const s = await setupPartnership(ctx);
    const ev = order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code] });
    const results = await Promise.all(Array.from({ length: 6 }, () => ingest(s.live.businessId, ev)));
    expect(results.filter((r) => r.outcome === 'processed')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'duplicate')).toHaveLength(5);
    expect(await ctx.prisma.conversion.count({ where: { partnershipId: s.partnershipId } })).toBe(1);
    expect(await ctx.prisma.commissionCalculation.count({ where: { partnershipId: s.partnershipId } })).toBe(1);
  });

  it('usage limit is enforced under concurrent redemptions', async () => {
    const s = await setupPartnership(ctx, { promotionRules: { stackable: false, codeUsageLimit: 2 } });
    const results = await Promise.all(Array.from({ length: 5 }, () => ingest(s.live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code] }))));
    expect(results.filter((r) => r.decisionState === 'attributed')).toHaveLength(2);
    expect((await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: s.partnershipId } })).usageCount).toBe(2);
  });
});

describe('redemption interface & APIs', () => {
  it('business records an in-store redemption (verified, auto-approved); creators see limited data; other tenants cannot read', async () => {
    const s = await setupPartnership(ctx, { conversionSourceType: 'redemption_interface', fulfillmentMode: 'offline' });
    const r = await s.live.client.post('/api/v1/redemptions', { businessId: s.live.businessId, promotionCode: s.code, externalRef: 'receipt-001', currency: 'JOD', grossMinor: 20000 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'approved', verifiedState: 'verified', decisionState: 'attributed' });
    expect(r.body.data.commission.commissionMinor).toBe(3000);
    expect((await s.live.client.post('/api/v1/redemptions', { businessId: s.live.businessId, promotionCode: s.code, externalRef: 'receipt-001' })).status).toBe(409);
    const creatorView = await s.creator.client.get(`/api/v1/conversions/${r.body.data.id}`);
    expect(creatorView.status).toBe(200);
    expect(creatorView.body.data.externalRef).toBeUndefined();
    const sales = await s.creator.client.get('/api/v1/creator/sales');
    expect(sales.body.data).toHaveLength(1);
    const attr = await s.creator.client.get(`/api/v1/attributions/${r.body.data.id}`);
    expect(attr.body.data.current.decisionState).toBe('attributed');
    expect(attr.body.data.touchpoints).toBeUndefined();
    const other = await setupLiveCampaign(ctx);
    expect((await other.client.get(`/api/v1/conversions/${r.body.data.id}`)).status).toBe(404);
    expect((await other.client.post('/api/v1/redemptions', { businessId: s.live.businessId, promotionCode: s.code, externalRef: 'x' })).status).toBe(404);
    const stranger = await setupCreator(ctx);
    expect((await stranger.client.get(`/api/v1/attributions/${r.body.data.id}`)).status).toBe(404);
  });

  it('manual evidence is self-reported and never auto-approved; business cannot approve it', async () => {
    const s = await setupPartnership(ctx, { conversionApprovalMode: 'manual' });
    const r = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/conversions/manual`, { promotionCode: s.code, externalRef: 'paper-7', currency: 'JOD', grossMinor: 5000, evidenceNote: 'Handwritten receipt photo attached' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ verifiedState: 'self_reported', status: 'attributed' });
    expect((await s.live.client.post(`/api/v1/conversions/${r.body.data.id}/approve`)).status).toBe(422);
  });

  it('manual approval mode requires business approval for verified conversions; reject reverses commission', async () => {
    const s = await setupPartnership(ctx, { conversionApprovalMode: 'manual' });
    const ref = `o-${randomUUID()}`;
    const c = await ingest(s.live.businessId, order('ORDER_CREATED', ref, { discountCodes: [s.code] }));
    await ingest(s.live.businessId, order('ORDER_PAID', ref));
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: c.conversionId! } })).status).toBe('pending');
    const viewer = await s.creator.client.post(`/api/v1/conversions/${c.conversionId}/approve`);
    expect(viewer.status).toBe(404);
    const ok = await s.live.client.post(`/api/v1/conversions/${c.conversionId}/approve`);
    expect(ok.body.data.status).toBe('approved');
    expect((await s.live.client.post(`/api/v1/conversions/${c.conversionId}/reject`, { reason: 'changed my mind' })).status).toBe(422);
    const c2 = await ingest(s.live.businessId, order('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code] }));
    const rej = await s.live.client.post(`/api/v1/conversions/${c2.conversionId}/reject`, { reason: 'test order' });
    expect(rej.body.data.status).toBe('rejected');
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: c2.conversionId! } })).status).toBe('reversed');
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });
});
