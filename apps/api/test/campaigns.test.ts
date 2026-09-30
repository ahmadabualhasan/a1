import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CampaignsService } from '../src/modules/campaigns/campaigns.service';
import { campaignPayload, registerAdmin, setupBusiness, setupCreator, setupLiveCampaign, startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

async function draft(overrides: Record<string, unknown> = {}) {
  const biz = await setupBusiness(ctx);
  const item = await biz.client.post(`/api/v1/businesses/${biz.businessId}/catalog`, { name: 'Serum', type: 'product', priceMinor: 25000, currency: 'JOD' });
  const camp = await biz.client.post(`/api/v1/businesses/${biz.businessId}/campaigns`, campaignPayload(item.body.data.id, overrides));
  return { ...biz, itemId: item.body.data.id as string, camp };
}

describe('catalog', () => {
  it('requires currency with price and isolates tenants', async () => {
    const a = await setupBusiness(ctx);
    const b = await setupBusiness(ctx);
    expect((await a.client.post(`/api/v1/businesses/${a.businessId}/catalog`, { name: 'X item', type: 'product', priceMinor: 100 })).status).toBe(400);
    const ok = await a.client.post(`/api/v1/businesses/${a.businessId}/catalog`, { name: 'X item', type: 'service', priceMinor: 100, currency: 'JOD' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.priceMinor).toBe(100);
    expect((await b.client.get(`/api/v1/businesses/${a.businessId}/catalog/${ok.body.data.id}`)).status).toBe(404);
    expect((await b.client.post(`/api/v1/businesses/${a.businessId}/catalog`, { name: 'Injected', type: 'product' })).status).toBe(404);
  });
});

describe('campaigns', () => {
  it('creates a draft with a versioned commission rule', async () => {
    const { camp } = await draft();
    expect(camp.status).toBe(201);
    expect(camp.body.data.status).toBe('draft');
    const rule = await ctx.prisma.commissionRule.findUniqueOrThrow({ where: { id: camp.body.data.commissionRuleId } });
    expect(rule).toMatchObject({ version: 1, type: 'percentage', currency: 'JOD', baseType: 'discounted', refundBehavior: 'clawback' });
    expect(rule.rate?.toString()).toBe('0.15');
  });

  it('rejects destinations outside the business allowlist (open-redirect defence)', async () => {
    const { camp } = await draft({ destinationUrl: 'https://evil.example/phish' });
    expect(camp.status).toBe(400);
    expect(camp.body.error.code).toBe('UNSAFE_URL');
  });

  it('rejects unsupported compensation models and invalid commission configs', async () => {
    expect((await draft({ compensationType: 'paid_content' })).camp.body.error.code).toBe('UNSUPPORTED_CONFIGURATION');
    expect((await draft({ commission: { type: 'percentage', baseType: 'gross' } })).camp.status).toBe(400);
    expect((await draft({ commission: { type: 'percentage', rate: '1.5', baseType: 'gross' } })).camp.status).toBe(400);
    expect((await draft({ holdPeriodDays: undefined })).camp.status).toBe(400);
  });

  it('unverified businesses go through admin review; verified auto-publish and start', async () => {
    const d = await draft();
    const pub = await d.client.post(`/api/v1/campaigns/${d.camp.body.data.id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.status).toBe('pending_review');
    const creator = await setupCreator(ctx);
    expect((await creator.client.post(`/api/v1/admin/campaigns/${d.camp.body.data.id}/approve`)).status).toBe(403);
    const admin = await registerAdmin(ctx, 'support_agent');
    // Pending campaigns are hidden from creators but readable (without member-only fields) by reviewers.
    expect((await creator.client.get(`/api/v1/campaigns/${d.camp.body.data.id}`)).status).toBe(404);
    const preview = await admin.get(`/api/v1/campaigns/${d.camp.body.data.id}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.destinationUrl).toBeUndefined();
    const ap = await admin.post(`/api/v1/admin/campaigns/${d.camp.body.data.id}/approve`);
    expect(ap.status).toBe(200);
    expect(ap.body.data.status).toBe('active');
    const live = await setupLiveCampaign(ctx);
    expect(live.campaign.status).toBe('active');
  });

  it('publish gates explain what is missing', async () => {
    const d = await draft({ description: 'short' });
    const pub = await d.client.post(`/api/v1/campaigns/${d.camp.body.data.id}/publish`);
    expect(pub.status).toBe(422);
    expect(pub.body.error.details.problems.join(' ')).toMatch(/Describe the campaign/);
  });

  it('future start stays published until the scheduler starts it; end date ends it', async () => {
    const start = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 7 * 86400_000).toISOString();
    const live = await setupLiveCampaign(ctx, { startAt: start, endAt: end });
    expect(live.campaign.status).toBe('published');
    const svc = ctx.app.get(CampaignsService);
    await svc.runScheduledTransitions(new Date(Date.now() + 2 * 3600_000));
    expect((await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: live.campaignId } })).status).toBe('active');
    await svc.runScheduledTransitions(new Date(Date.now() + 8 * 86400_000));
    expect((await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: live.campaignId } })).status).toBe('ended');
  });

  it('pause/resume/end lifecycle with invalid transitions rejected', async () => {
    const live = await setupLiveCampaign(ctx);
    const id = live.campaignId;
    expect((await live.client.post(`/api/v1/campaigns/${id}/resume`)).status).toBe(409);
    expect((await live.client.post(`/api/v1/campaigns/${id}/pause`)).body.data.status).toBe('paused');
    expect((await live.client.post(`/api/v1/campaigns/${id}/resume`)).body.data.status).toBe('active');
    expect((await live.client.post(`/api/v1/campaigns/${id}/end`)).body.data.status).toBe('ended');
    const again = await live.client.post(`/api/v1/campaigns/${id}/pause`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect((await live.client.patch(`/api/v1/campaigns/${id}`, { version: 99, name: 'New name here' })).status).toBe(409);
    expect((await live.client.post(`/api/v1/campaigns/${id}/archive`)).body.data.status).toBe('archived');
  });

  it('editing commission creates a new immutable rule version', async () => {
    const live = await setupLiveCampaign(ctx);
    const c1 = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: live.campaignId } });
    const r = await live.client.patch(`/api/v1/campaigns/${live.campaignId}`, {
      version: c1.version,
      commission: { type: 'fixed', fixedMinor: 2000, baseType: 'gross', roundingMode: 'half_up', refundBehavior: 'reverse' },
      attributionPolicy: { model: 'last_touch', windowDays: 7 },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.configVersion).toBe(2);
    expect(r.body.data.attributionPolicyVersion).toBe('2');
    const rules = await ctx.prisma.commissionRule.findMany({ where: { ruleKey: `campaign:${live.campaignId}` }, orderBy: { version: 'asc' } });
    expect(rules.map((x) => x.version)).toEqual([1, 2]);
    expect(rules[0]!.activeTo).not.toBeNull();
    expect(rules[0]!.rate?.toString()).toBe('0.15');
    expect(await ctx.prisma.auditLog.count({ where: { objectId: live.campaignId, action: 'campaign.terms_changed' } })).toBe(1);
  });

  it('other businesses cannot manage the campaign; drafts are hidden from the public', async () => {
    const d = await draft();
    const other = await setupBusiness(ctx);
    const id = d.camp.body.data.id;
    expect((await other.client.post(`/api/v1/campaigns/${id}/publish`)).status).toBe(404);
    expect((await other.client.patch(`/api/v1/campaigns/${id}`, { version: 1, name: 'Hijack attempt' })).status).toBe(404);
    expect((await ctx.http().get(`/api/v1/campaigns/${id}`)).status).toBe(404);
    expect((await d.client.get(`/api/v1/campaigns/${id}`)).body.data.status).toBe('draft');
  });

  it('marketplace lists open campaigns with cards and filters; public detail hides internal config', async () => {
    const live = await setupLiveCampaign(ctx, { name: 'Marketplace Visible Campaign', platforms: ['youtube'] });
    const r = await ctx.http().get('/api/v1/marketplace/campaigns?platform=youtube&limit=50');
    expect(r.status).toBe(200);
    const card = r.body.data.find((c: { id: string }) => c.id === live.campaignId);
    expect(card).toMatchObject({ productName: 'Vitamin C Serum', spotsLeft: 5, applicationsOpen: true, status: 'open', creatorCommission: { type: 'percentage', rate: '0.15' } });
    expect((await ctx.http().get('/api/v1/marketplace/campaigns?platform=snapchat')).body.data.find((c: { id: string }) => c.id === live.campaignId)).toBeUndefined();
    expect((await ctx.http().get('/api/v1/marketplace/campaigns?minCommissionRate=0.2')).body.data.find((c: { id: string }) => c.id === live.campaignId)).toBeUndefined();
    const pub = await ctx.http().get(`/api/v1/campaigns/${live.campaignId}`);
    expect(pub.body.data.commissionTerms.baseType).toBe('discounted');
    expect(pub.body.data.destinationUrl).toBeUndefined();
    expect(pub.body.data.attribution.note).toMatch(/cannot capture every purchase/);
  });
});
