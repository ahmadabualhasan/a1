import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FEE_PLAN, DEFAULT_PAYOUT_MINIMUM_MINOR } from '@codek/database';
import { normalizedOrderSchema } from '@codek/domain';
import { ConversionsService } from '../src/modules/conversions/conversions.service';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { SettingsService } from '../src/settings/settings.service';
import { setupPartnership, startApp, type TestContext } from './harness';

/**
 * End-to-end check of the seeded commercial defaults (D-003: CODEK fee = 10% of the creator commission, charged to
 * the business on top of the commission; D-017: minimum payout of 10 major units). The rest of the suite runs on a
 * zero-fee / zero-minimum baseline (global-setup.ts); this file switches the defaults on and restores the baseline.
 */
let ctx: TestContext;
let ledger: LedgerService;
const key = () => `k-${randomUUID()}`;

async function setPricing(feePlan: object, minimum: object) {
  await ctx.prisma.pricingPlan.update({ where: { planKey: 'default' }, data: { feePlanJson: feePlan } });
  await ctx.prisma.systemSetting.update({ where: { key: 'payouts.minimum_minor' }, data: { valueJson: minimum } });
  ctx.app.get(SettingsService).invalidate();
}

beforeAll(async () => {
  ctx = await startApp();
  ledger = ctx.app.get(LedgerService);
  await setPricing({ ...DEFAULT_FEE_PLAN }, { ...DEFAULT_PAYOUT_MINIMUM_MINOR });
});
afterAll(async () => {
  await setPricing({ planKey: 'default', basis: 'none', rate: null, roundingMode: 'half_up' }, { default: 0 });
  await ctx.app.close();
});

/** Partnership (15% commission, no hold) with one verified in-store redemption of `gross`. */
async function sale(gross: number) {
  const s = await setupPartnership(ctx, { holdPeriodDays: 0, conversionSourceType: 'redemption_interface' });
  const r = await s.live.client.post('/api/v1/redemptions', { businessId: s.live.businessId, promotionCode: s.code, externalRef: `rcpt-${randomUUID()}`, currency: 'JOD', grossMinor: gross });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: 'creator@paypal.example' });
  const calc = () => ctx.prisma.commissionCalculation.findFirstOrThrow({ where: { conversionId: r.body.data.id as string } });
  const fund = async (amountMinor: number) => {
    const f = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': key() });
    expect(f.status, JSON.stringify(f.body)).toBe(201);
  };
  const overview = async () => (await s.live.client.get(`/api/v1/businesses/${s.live.businessId}/funding`)).body.data.balances[0];
  const requestPayout = () => s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': key() });
  return { ...s, calc, fund, overview, requestPayout };
}

describe('seeded commercial defaults (D-003 fee, D-017 minimum payout)', () => {
  it('public pricing states the fee before commitment', async () => {
    const r = await ctx.http().get('/api/v1/pricing');
    expect(r.body.data.find((p: { isDefault: boolean }) => p.isDefault).fee).toBe('10% of each creator commission');
  });

  it('freezes the 10% fee plan and the payout minimum into new partnership terms', async () => {
    const s = await setupPartnership(ctx);
    const snap = await ctx.prisma.partnershipTermsSnapshot.findFirstOrThrow({ where: { partnershipId: s.partnershipId } });
    expect(snap.feePlanJson).toMatchObject({ basis: 'percentage_of_commission', rate: '0.10' });
  });

  it('charges the fee to the business on top of the commission; the creator keeps the full commission', async () => {
    const s = await sale(20000); // 20.000 JOD → commission 3.000, fee 0.300
    expect(await s.calc()).toMatchObject({ commissionMinor: 3000n, feeMinor: 300n, status: 'approved' });
    expect(await s.overview()).toMatchObject({ currency: 'JOD', shortfallMinor: 3300 });
    await s.fund(3000); // the commission alone does not cover the obligation
    expect((await s.calc()).status).toBe('approved');
    await s.fund(300);
    expect((await s.calc()).status).toBe('available');
    expect(await s.overview()).toMatchObject({ fundingBalanceMinor: 0, shortfallMinor: 0 });
    expect(await ledger.balance(ctx.prisma, { accountType: 'creator_available', ownerId: s.creator.creatorId, currency: 'JOD' })).toBe(3000n);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('rounds commission and fee half-up in integer minor units', async () => {
    const s = await sale(2030); // 15% = 304.5 → 305; 10% of 305 = 30.5 → 31
    expect(await s.calc()).toMatchObject({ commissionMinor: 305n, feeMinor: 31n });
    expect(await s.overview()).toMatchObject({ shortfallMinor: 336 });
  });

  it('blocks payouts below 10 JOD and pays out at or above it', async () => {
    const small = await sale(20000); // 3.000 JOD available
    await small.fund(3300);
    const low = await small.requestPayout();
    expect(low.status).toBe(422);
    expect(low.body.error.details.minimumMinor).toBe(10000);
    expect((await small.creator.client.get('/api/v1/creator/earnings')).body.data.currencies[0]).toMatchObject({ availableMinor: 3000, minimumPayoutMinor: 10000 });
    expect(await ledger.balance(ctx.prisma, { accountType: 'creator_available', ownerId: small.creator.creatorId, currency: 'JOD' })).toBe(3000n);

    const big = await sale(70000); // commission 10.500 JOD, fee 1.050
    expect(await big.calc()).toMatchObject({ commissionMinor: 10500n, feeMinor: 1050n });
    await big.fund(11550);
    const ok = await big.requestPayout();
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.data.amountMinor).toBe(10500);
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });

  it('reverses the fee proportionally with the commission on a partial refund (D-007)', async () => {
    const s = await setupPartnership(ctx, { holdPeriodDays: 0 });
    const pipeline = ctx.app.get(ConversionsService);
    const externalRef = `ord-${randomUUID()}`;
    const ev = (eventType: string, extra: object) =>
      pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: normalizedOrderSchema.parse({ eventType, externalEventId: randomUUID(), externalRef, occurredAt: new Date().toISOString(), currency: 'JOD', discountCodes: [s.code], ...extra }) });
    const paid = await ev('ORDER_PAID', { grossMinor: 20000 });
    const calc = () => ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: paid.conversionId! } });
    expect(await calc()).toMatchObject({ commissionMinor: 3000n, feeMinor: 300n });
    await ev('ORDER_REFUNDED', { grossMinor: 20000, refundedTotalMinor: 5000 }); // 25% refunded
    expect(await calc()).toMatchObject({ reversedMinor: 750n, feeReversedMinor: 75n });
    expect((await ledger.verifyInvariants()).ok).toBe(true);
  });
});
