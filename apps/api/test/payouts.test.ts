import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizedOrderSchema } from '@codek/domain';
import { ConversionsService } from '../src/modules/conversions/conversions.service';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { PayoutsService } from '../src/modules/payouts/payouts.service';
import { SettingsService } from '../src/settings/settings.service';
import { registerAdmin, setupPartnership, startApp, type TestContext } from './harness';

let ctx: TestContext;
let payouts: PayoutsService;
let ledger: LedgerService;
let pipeline: ConversionsService;
beforeAll(async () => {
  ctx = await startApp();
  payouts = ctx.app.get(PayoutsService);
  ledger = ctx.app.get(LedgerService);
  pipeline = ctx.app.get(ConversionsService);
});
afterAll(async () => ctx.app.close());

const key = () => `k-${randomUUID()}`;

/** Partnership with hold 0, one approved in-store redemption of `gross` (15% commission). */
async function earningCreator(gross = 20000, payoutEmail = 'creator@paypal.example') {
  const s = await setupPartnership(ctx, { holdPeriodDays: 0, conversionSourceType: 'redemption_interface' });
  const r = await s.live.client.post('/api/v1/redemptions', { businessId: s.live.businessId, promotionCode: s.code, externalRef: `rcpt-${randomUUID()}`, currency: 'JOD', grossMinor: gross });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: payoutEmail });
  return { ...s, conversionId: r.body.data.id as string };
}

async function fund(s: Awaited<ReturnType<typeof earningCreator>>, amountMinor: number) {
  const r = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': key() });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r;
}

describe('funding', () => {
  it('requires Idempotency-Key and replays the same response', async () => {
    const s = await earningCreator();
    const noKey = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 100, currency: 'JOD', fundingMethod: 'sandbox' });
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const k = key();
    const a = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 5000, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': k });
    const b = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 5000, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': k });
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(b.body.data.funding.id).toBe(a.body.data.funding.id);
    const c = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 9999, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': k });
    expect(c.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await ctx.prisma.merchantFunding.count({ where: { businessId: s.live.businessId } })).toBe(1);
  });

  it('funding allocates to approved commissions; shortfall reported; client cannot fund another tenant', async () => {
    const s = await earningCreator(20000); // commission 3000
    let ov = await s.live.client.get(`/api/v1/businesses/${s.live.businessId}/funding`);
    expect(ov.body.data.balances[0]).toMatchObject({ currency: 'JOD', shortfallMinor: 3000, approvedUnfundedCount: 1 });
    await fund(s, 2000);
    expect((await ctx.prisma.commissionCalculation.findFirstOrThrow({ where: { conversionId: s.conversionId } })).status).toBe('approved');
    await fund(s, 1500);
    expect((await ctx.prisma.commissionCalculation.findFirstOrThrow({ where: { conversionId: s.conversionId } })).status).toBe('available');
    ov = await s.live.client.get(`/api/v1/businesses/${s.live.businessId}/funding`);
    expect(ov.body.data.balances[0]).toMatchObject({ fundingBalanceMinor: 500, shortfallMinor: 0 });
    const other = await setupPartnership(ctx);
    expect((await other.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 1, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': key() })).status).toBe(404);
  });

  it('bank transfer stays pending until a finance admin confirms (audited)', async () => {
    const s = await earningCreator();
    const r = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 3000, currency: 'JOD', fundingMethod: 'bank_transfer' }, { 'Idempotency-Key': key() });
    expect(r.body.data.funding.status).toBe('pending');
    expect((await s.live.client.post(`/api/v1/admin/fundings/${r.body.data.funding.id}/confirm`, { providerReference: 'BANK-123' })).status).toBe(403);
    const admin = await registerAdmin(ctx, 'finance_admin');
    const c = await admin.post(`/api/v1/admin/fundings/${r.body.data.funding.id}/confirm`, { providerReference: `BANK-${randomUUID()}` });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(c.body.data.status).toBe('confirmed');
    expect(await ctx.prisma.auditLog.count({ where: { objectId: r.body.data.funding.id, action: 'funding.confirmed' } })).toBe(1);
    expect((await ctx.prisma.commissionCalculation.findFirstOrThrow({ where: { conversionId: s.conversionId } })).status).toBe('available');
  });
});

describe('payouts', () => {
  it('earnings → payout request → provider success → paid; ledger clean', async () => {
    const s = await earningCreator(20000);
    await fund(s, 3000);
    const e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0]).toMatchObject({ currency: 'JOD', availableMinor: 3000, pendingMinor: 0 });
    expect(e.body.data.explanation.available).toMatch(/does not hold your money/);
    const r = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data).toMatchObject({ status: 'requested', amountMinor: 3000 });
    const out = await payouts.process(r.body.data.id);
    expect(out.status).toBe('paid');
    const p = await ctx.prisma.payout.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { attempts: true } });
    expect(p.attempts).toHaveLength(1);
    expect(p.providerTransactionId).not.toBeNull();
    expect((await ctx.prisma.commissionCalculation.findFirstOrThrow({ where: { conversionId: s.conversionId } })).status).toBe('paid');
    expect(await payouts.process(r.body.data.id)).toEqual({ status: 'paid' }); // idempotent
    const after = await s.creator.client.get('/api/v1/creator/earnings');
    expect(after.body.data.currencies[0]).toMatchObject({ availableMinor: 0, paidMinor: 3000 });
    expect((await ledger.verifyInvariants()).ok).toBe(true);
    const again = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(again.status).toBe(422);
  });

  it('non-retryable provider failure keeps attempt history and returns funds to available', async () => {
    const s = await earningCreator(20000, 'will-fail@paypal.example');
    await fund(s, 3000);
    const r = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect((await payouts.process(r.body.data.id)).status).toBe('failed');
    const p = await ctx.prisma.payout.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { attempts: true } });
    expect(p.failureReasonCode).toBe('RECIPIENT_REJECTED');
    expect(p.attempts[0]!.status).toBe('failed');
    expect((await ctx.prisma.commissionCalculation.findFirstOrThrow({ where: { conversionId: s.conversionId } })).status).toBe('available');
    const e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0].availableMinor).toBe(3000);
    await expect(ctx.prisma.payoutAttempt.delete({ where: { id: p.attempts[0]!.id } })).rejects.toThrow(/NO_DELETE/);
  });

  it('retryable failure then success (retry with backoff hint)', async () => {
    const s = await earningCreator(20000, 'flaky@paypal.example');
    await fund(s, 3000);
    const r = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    const first = await payouts.process(r.body.data.id);
    expect(first.status).toBe('processing');
    expect(first.retryInMs).toBeGreaterThan(0);
    expect((await payouts.process(r.body.data.id)).status).toBe('paid');
    expect(await ctx.prisma.payoutAttempt.count({ where: { payoutId: r.body.data.id } })).toBe(2);
  });

  it('concurrent payout requests cannot double-spend the available balance', async () => {
    const s = await earningCreator(20000);
    await fund(s, 3000);
    const results = await Promise.all(Array.from({ length: 4 }, () => s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() })));
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(await ctx.prisma.payout.count({ where: { creatorId: s.creator.creatorId } })).toBe(1);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('refund after payout creates a clawback that is netted on the next payout', async () => {
    const s = await setupPartnership(ctx, { holdPeriodDays: 0 });
    await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: 'c@paypal.example' });
    const ev = (type: string, ref: string, extra: Record<string, unknown> = {}) =>
      normalizedOrderSchema.parse({ eventType: type, externalEventId: `${type}-${randomUUID()}`, externalRef: ref, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [s.code], ...extra });
    const ref1 = `o-${randomUUID()}`;
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', ref1) });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID', ref1) });
    await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 10000, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': key() });
    const p1 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(p1.body.data.amountMinor).toBe(1500);
    await payouts.process(p1.body.data.id);
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_REFUNDED', ref1, { refundedTotalMinor: 10000 }) });
    const c1 = await ctx.prisma.commissionCalculation.findFirstOrThrow({ where: { partnershipId: s.partnershipId } });
    expect(c1).toMatchObject({ status: 'clawback', clawbackMinor: 1500n });
    let e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0]).toMatchObject({ clawbackOutstandingMinor: 1500, availableMinor: 0 });
    // New sale of 20000 → 3000 commission; next payout nets the 1500 clawback.
    const ref2 = `o-${randomUUID()}`;
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', ref2, { grossMinor: 20000 }) });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID', ref2) });
    e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0]).toMatchObject({ availableMinor: 1500, clawbackOutstandingMinor: 1500 });
    const p2 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(p2.body.data.amountMinor).toBe(1500);
    e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0]).toMatchObject({ clawbackOutstandingMinor: 0 });
    expect((await ledger.verifyInvariants()).ok).toBe(true);
    // Cancelling a payout that netted a clawback restores the clawback; the next payout nets it again.
    const cancelled = await s.creator.client.post(`/api/v1/creator/payouts/${p2.body.data.id}/cancel`);
    expect(cancelled.body.data.status).toBe('cancelled');
    e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0]).toMatchObject({ availableMinor: 1500, clawbackOutstandingMinor: 1500 });
    const p3 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(p3.status).toBe(201);
    expect(p3.body.data.amountMinor).toBe(1500);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('a failed payout that netted a clawback returns both the payout and the netted clawback', async () => {
    const s = await setupPartnership(ctx, { holdPeriodDays: 0 });
    await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: 'c@paypal.example' });
    const ev = (type: string, ref: string, extra: Record<string, unknown> = {}) =>
      normalizedOrderSchema.parse({ eventType: type, externalEventId: `${type}-${randomUUID()}`, externalRef: ref, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [s.code], ...extra });
    const ref1 = `o-${randomUUID()}`;
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', ref1) });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID', ref1) });
    await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 10000, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': key() });
    const p1 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    await payouts.process(p1.body.data.id);
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_REFUNDED', ref1, { refundedTotalMinor: 10000 }) });
    const ref2 = `o-${randomUUID()}`;
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', ref2, { grossMinor: 20000 }) });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID', ref2) });
    // The sandbox provider fails permanently for this recipient.
    await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: 'fail@paypal.example' });
    const p2 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(p2.body.data.amountMinor).toBe(1500);
    expect((await payouts.process(p2.body.data.id)).status).toBe('failed');
    const e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0]).toMatchObject({ availableMinor: 1500, clawbackOutstandingMinor: 1500, payoutInProgressMinor: 0 });
    const available = await ctx.prisma.commissionCalculation.count({ where: { partnershipId: s.partnershipId, status: 'available' } });
    expect(available).toBe(1);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('a payout returned by the provider after settlement is reversed through dual approval and becomes payable again', async () => {
    const s = await setupPartnership(ctx, { holdPeriodDays: 0 });
    await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: 'c@paypal.example' });
    const ev = (type: string, ref: string, extra: Record<string, unknown> = {}) =>
      normalizedOrderSchema.parse({ eventType: type, externalEventId: `${type}-${randomUUID()}`, externalRef: ref, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [s.code], ...extra });
    // Commission 1500 paid, then refunded → 1500 clawback; second sale 3000 → payout nets the clawback (1500 paid out).
    const ref1 = `o-${randomUUID()}`;
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', ref1) });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID', ref1) });
    await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 20000, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': key() });
    const p1 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    await payouts.process(p1.body.data.id);
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_REFUNDED', ref1, { refundedTotalMinor: 10000 }) });
    const ref2 = `o-${randomUUID()}`;
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', ref2, { grossMinor: 20000 }) });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID', ref2, { grossMinor: 20000 }) });
    const p2 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(p2.body.data.amountMinor).toBe(1500);
    expect((await payouts.process(p2.body.data.id)).status).toBe('paid');

    const a = await registerAdmin(ctx, 'finance_admin');
    const b = await registerAdmin(ctx, 'finance_admin');
    expect((await s.creator.client.post(`/api/v1/admin/payouts/${p2.body.data.id}/returned`, { reason: 'Recipient account closed' })).status).toBe(403);
    const req = await a.post(`/api/v1/admin/payouts/${p2.body.data.id}/returned`, { reason: 'Recipient account closed', providerReference: 'PP-RET-1' });
    expect(req.body.data.executed).toBe(false);
    expect(req.body.data.action.approvalState).toBe('pending');
    const ok = await b.post(`/api/v1/admin/actions/${req.body.data.action.id}/approve`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const po = await ctx.prisma.payout.findUniqueOrThrow({ where: { id: p2.body.data.id } });
    expect(po.status).toBe('reversed');
    const e = await s.creator.client.get('/api/v1/creator/earnings');
    expect(e.body.data.currencies[0]).toMatchObject({ availableMinor: 1500, clawbackOutstandingMinor: 1500, paidMinor: 1500 });
    expect(await ctx.prisma.commissionCalculation.count({ where: { partnershipId: s.partnershipId, status: 'available' } })).toBe(1);
    // Replaying the approval is refused; the creator can be paid again (to a corrected account).
    expect((await b.post(`/api/v1/admin/actions/${req.body.data.action.id}/approve`)).status).not.toBe(200);
    const p3 = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(p3.body.data.amountMinor).toBe(1500);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('payout blocked without payout method, during risk review, below minimum; creators isolated', async () => {
    const s = await earningCreator(20000);
    await fund(s, 3000);
    await ctx.prisma.creator.update({ where: { id: s.creator.creatorId }, data: { payoutReadiness: 'not_ready' } });
    expect((await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() })).body.error.details.next).toBe('payout_method');
    await ctx.prisma.creator.update({ where: { id: s.creator.creatorId }, data: { payoutReadiness: 'ready' } });
    await ctx.prisma.fraudFlag.create({ data: { subjectType: 'creator', subjectId: s.creator.creatorId, signalType: 'self_referral', severity: 'high', status: 'open' } });
    expect((await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() })).body.error.details.reason).toBe('RISK_REVIEW');
    await ctx.prisma.fraudFlag.updateMany({ where: { subjectId: s.creator.creatorId }, data: { status: 'dismissed' } });
    await ctx.prisma.systemSetting.update({ where: { key: 'payouts.minimum_minor' }, data: { valueJson: { default: 0, JOD: 5000 } } });
    const settings = SettingsService;
    ctx.app.get(settings).invalidate();
    const low = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect(low.body.error.details.minimumMinor).toBe(5000);
    await ctx.prisma.systemSetting.update({ where: { key: 'payouts.minimum_minor' }, data: { valueJson: { default: 0 } } });
    ctx.app.get(settings).invalidate();
    const other = await setupPartnership(ctx);
    const mine = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
    expect((await other.creator.client.post(`/api/v1/creator/payouts/${mine.body.data.id}/cancel`)).status).toBe(404);
    const cancel = await s.creator.client.post(`/api/v1/creator/payouts/${mine.body.data.id}/cancel`);
    expect(cancel.body.data.status).toBe('cancelled');
    expect((await s.creator.client.get('/api/v1/creator/earnings')).body.data.currencies[0].availableMinor).toBe(3000);
  });
});
