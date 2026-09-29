import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizedOrderSchema } from '@codek/domain';
import { BillingService } from '../src/billing/billing.service';
import { ConversionsService } from '../src/modules/conversions/conversions.service';
import { SettingsService } from '../src/settings/settings.service';
import { registerAdmin, setupCreator, setupPartnership, startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

describe('billing & pricing', () => {
  it('public pricing is transparent; default plan charges no fee', async () => {
    const r = await ctx.http().get('/api/v1/pricing');
    expect(r.status).toBe(200);
    expect(r.body.data.find((p: { isDefault: boolean }) => p.isDefault).fee).toBe('No CODEK fee on commissions');
  });

  it('subscriptions are gated by the pricing-decision flag; fee plan changes never rewrite existing snapshots', async () => {
    const s = await setupPartnership(ctx);
    const admin = await registerAdmin(ctx, 'platform_admin');
    const key = `pro-${randomUUID().slice(0, 6)}`;
    const plan = await admin.post('/api/v1/admin/pricing-plans', { planKey: key, name: 'Pro (test)', monthlyPriceMinor: 29000, currency: 'JOD', feePlan: { basis: 'percentage_of_commission', rate: '0.10' } });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    expect((await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/billing/subscribe`, { planKey: key })).body.error.code).toBe('FEATURE_DISABLED');
    await ctx.prisma.systemSetting.update({ where: { key: 'billing.subscriptions.enabled' }, data: { valueJson: true } });
    ctx.app.get(SettingsService).invalidate();
    expect((await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/billing/subscribe`, { planKey: key })).status).toBe(201);
    const ov = await s.live.client.get(`/api/v1/businesses/${s.live.businessId}/billing`);
    expect(ov.body.data.currentFeePlan.description).toBe('10% of each creator commission');
    // Existing partnership snapshot (no fee) still governs its commissions.
    const r = await ctx.app.get(ConversionsService).ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: normalizedOrderSchema.parse({ eventType: 'ORDER_CREATED', externalEventId: randomUUID(), externalRef: randomUUID(), occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [s.code] }) });
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: r.conversionId! } })).feeMinor).toBe(0n);
    // A new partnership freezes the new fee plan.
    const creator2 = await setupCreator(ctx);
    const app = await creator2.client.post(`/api/v1/campaigns/${s.live.campaignId}/apply`, {});
    const acc = await s.live.client.post(`/api/v1/applications/${app.body.data.id}/accept`);
    const r2 = await ctx.app.get(ConversionsService).ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: normalizedOrderSchema.parse({ eventType: 'ORDER_CREATED', externalEventId: randomUUID(), externalRef: randomUUID(), occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [acc.body.data.assets.code] }) });
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: r2.conversionId! } })).feeMinor).toBe(150n); // 10% of 1500
    await ctx.prisma.billingSubscription.updateMany({ where: { businessId: s.live.businessId }, data: { periodEnd: new Date(Date.now() - 1000) } });
    expect(await ctx.app.get(BillingService).generateInvoices()).toBe(1);
    expect(await ctx.app.get(BillingService).generateInvoices()).toBe(0);
    await ctx.prisma.systemSetting.update({ where: { key: 'billing.subscriptions.enabled' }, data: { valueJson: false } });
    ctx.app.get(SettingsService).invalidate();
    await ctx.prisma.billingSubscription.updateMany({ where: { businessId: s.live.businessId }, data: { status: 'cancelled' } });
  });
});
