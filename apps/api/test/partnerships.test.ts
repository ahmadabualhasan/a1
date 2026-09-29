import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupCreator, setupLiveCampaign, setupPartnership, startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

describe('applications → partnership → assets', () => {
  it('accepting an application freezes terms and generates code, link and QR', async () => {
    const s = await setupPartnership(ctx);
    const ps = await ctx.prisma.partnership.findUniqueOrThrow({ where: { id: s.partnershipId }, include: { snapshots: true, promotionCodes: true, referralLinks: true, qrAssets: true, deliverables: true, contentRights: true, conversation: true } });
    expect(ps.status).toBe('active');
    expect(ps.snapshots).toHaveLength(1);
    const snap = ps.snapshots[0]!;
    expect(snap.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snap.commissionConfig).toMatchObject({ type: 'percentage', rate: '0.15', baseType: 'discounted', currency: 'JOD' });
    expect(snap.attributionPolicy).toMatchObject({ model: 'code_first', windowSeconds: 30 * 86400 });
    expect(snap.holdPeriodDays).toBe(14);
    expect(snap.feePlanJson).toMatchObject({ basis: 'none' });
    expect(ps.promotionCodes[0]!.status).toBe('active');
    expect(ps.promotionCodes[0]!.normalizedCode).toBe(s.code.toUpperCase());
    expect(ps.referralLinks[0]!.allowedHost).toBe('shop.acme.example');
    expect(ps.qrAssets).toHaveLength(1);
    expect(ps.deliverables).toHaveLength(1);
    expect(ps.contentRights).toHaveLength(1);
    expect(ps.conversation).toBeTruthy();

    const assets = await s.creator.client.get('/api/v1/creator/promotion-assets');
    expect(assets.body.data[0].codes[0].code).toBe(s.code);
    const qr = await s.creator.client.get(assets.body.data[0].qrCodes[0].downloadUrl);
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toBe('image/png');
    const outsider = await setupCreator(ctx);
    expect((await outsider.client.get(assets.body.data[0].qrCodes[0].downloadUrl)).status).toBe(404);
  });

  it('snapshots are immutable and later campaign edits do not rewrite them', async () => {
    const s = await setupPartnership(ctx);
    const snap = await ctx.prisma.partnershipTermsSnapshot.findFirstOrThrow({ where: { partnershipId: s.partnershipId } });
    await expect(ctx.prisma.partnershipTermsSnapshot.update({ where: { id: snap.id }, data: { holdPeriodDays: 0 } })).rejects.toThrow(/IMMUTABLE/);
    const c = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: s.live.campaignId } });
    await s.live.client.patch(`/api/v1/campaigns/${s.live.campaignId}`, { version: c.version, holdPeriodDays: 0, commission: { type: 'percentage', rate: '0.30', baseType: 'gross' } });
    const after = await ctx.prisma.partnershipTermsSnapshot.findFirstOrThrow({ where: { partnershipId: s.partnershipId } });
    expect(after.holdPeriodDays).toBe(14);
    expect(after.commissionConfig).toMatchObject({ rate: '0.15' });
  });

  it('terms changed after applying → partnership pending until creator confirms', async () => {
    const live = await setupLiveCampaign(ctx);
    const creator = await setupCreator(ctx);
    const app = await creator.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {});
    const c = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: live.campaignId } });
    await live.client.patch(`/api/v1/campaigns/${live.campaignId}`, { version: c.version, holdPeriodDays: 30 });
    const acc = await live.client.post(`/api/v1/applications/${app.body.data.id}/accept`);
    expect(acc.body.data.requiresCreatorConfirmation).toBe(true);
    expect(acc.body.data.partnership.status).toBe('pending');
    const code = await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: acc.body.data.partnership.id } });
    expect(code.status).toBe('pending');
    const conf = await creator.client.post(`/api/v1/partnerships/${acc.body.data.partnership.id}/confirm`);
    expect(conf.body.data.status).toBe('active');
    expect((await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: acc.body.data.partnership.id } })).status).toBe('active');
  });

  it('duplicate applications rejected; deadline and eligibility enforced', async () => {
    const live = await setupLiveCampaign(ctx, { eligibility: [{ ruleType: 'min_followers', operator: 'gte', value: { platform: 'instagram', count: 1000 } }] });
    const creator = await setupCreator(ctx);
    const r = await creator.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {});
    expect(r.status).toBe(422);
    expect(r.body.error.details.reason).toBe('NOT_ELIGIBLE');
    await creator.client.post('/api/v1/creator/social-accounts', { platform: 'instagram', handle: 'x', followerCount: 5000 });
    expect((await creator.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {})).status).toBe(201);
    expect((await creator.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {})).status).toBe(409);
    await ctx.prisma.campaign.update({ where: { id: live.campaignId }, data: { applicationDeadlineAt: new Date(Date.now() - 1000) } });
    const late = await setupCreator(ctx);
    expect((await late.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {})).body.error.details.reason).toBe('DEADLINE_PASSED');
  });

  it('participant cap + waitlist preserves order and never auto-accepts', async () => {
    const live = await setupLiveCampaign(ctx, { participantCap: 1, waitlistEnabled: true });
    const a = await setupCreator(ctx);
    const b = await setupCreator(ctx);
    const c = await setupCreator(ctx);
    const appA = await a.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {});
    expect((await live.client.post(`/api/v1/applications/${appA.body.data.id}/accept`)).status).toBe(200);
    const appB = await b.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {});
    const appC = await c.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {});
    expect(appB.body.data).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    expect(appC.body.data).toMatchObject({ status: 'waitlisted', waitlistPosition: 2 });
    const full = await live.client.post(`/api/v1/applications/${appB.body.data.id}/accept`);
    expect(full.status).toBe(422);
    expect(full.body.error.details.reason).toBe('CAPACITY_REACHED');
    const cap = await ctx.prisma.campaign.findUniqueOrThrow({ where: { id: live.campaignId } });
    await live.client.patch(`/api/v1/campaigns/${live.campaignId}`, { version: cap.version, participantCap: 2 });
    expect((await ctx.prisma.campaignApplication.findUniqueOrThrow({ where: { id: appB.body.data.id } })).status).toBe('waitlisted');
    expect((await live.client.post(`/api/v1/applications/${appB.body.data.id}/accept`)).status).toBe(200);
  });

  it('concurrent acceptances cannot exceed the cap (row lock)', async () => {
    const live = await setupLiveCampaign(ctx, { participantCap: 2 });
    const creators = await Promise.all([1, 2, 3, 4, 5].map(() => setupCreator(ctx)));
    const apps = [];
    for (const cr of creators) apps.push((await cr.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, {})).body.data.id);
    const results = await Promise.all(apps.map((id) => live.client.post(`/api/v1/applications/${id}/accept`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(await ctx.prisma.partnership.count({ where: { campaignId: live.campaignId } })).toBe(2);
    const codes = await ctx.prisma.promotionCode.findMany({ where: { campaignId: live.campaignId } });
    expect(new Set(codes.map((x) => x.normalizedCode)).size).toBe(2);
  });

  it('invitation flow; creator cannot accept others invitations; business-only status control', async () => {
    const live = await setupLiveCampaign(ctx);
    const creator = await setupCreator(ctx);
    const other = await setupCreator(ctx);
    const inv = await live.client.post(`/api/v1/businesses/${live.businessId}/invitations`, { creatorId: creator.creatorId, campaignId: live.campaignId, message: 'Join us' });
    expect(inv.status).toBe(201);
    expect((await live.client.post(`/api/v1/businesses/${live.businessId}/invitations`, { creatorId: creator.creatorId, campaignId: live.campaignId })).status).toBe(409);
    expect((await other.client.post(`/api/v1/invitations/${inv.body.data.id}/accept`)).status).toBe(404);
    const list = await creator.client.get('/api/v1/creator/invitations');
    expect(list.body.data[0].business.displayName).toBeTruthy();
    const acc = await creator.client.post(`/api/v1/invitations/${inv.body.data.id}/accept`);
    expect(acc.status).toBe(200);
    const pid = acc.body.data.partnership.id;
    expect((await creator.client.post(`/api/v1/partnerships/${pid}/pause`, {})).status).toBe(403);
    expect((await live.client.post(`/api/v1/partnerships/${pid}/pause`, { reason: 'content review' })).body.data.status).toBe('paused');
    expect((await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: pid } })).status).toBe('paused');
    const detail = await creator.client.get(`/api/v1/partnerships/${pid}`);
    expect(detail.body.data.viewerRole).toBe('creator');
    expect(detail.body.data.events.map((e: { eventType: string }) => e.eventType)).toEqual(expect.arrayContaining(['partnership_created', 'promotion_assets_generated', 'partnership_paused']));
    expect((await other.client.get(`/api/v1/partnerships/${pid}`)).status).toBe(404);
    expect((await live.client.post(`/api/v1/partnerships/${pid}/terminate`, { reason: 'policy' })).body.data.status).toBe('terminated');
    const code = await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: pid } });
    expect(code.status).toBe('revoked');
    await expect(ctx.prisma.promotionCode.update({ where: { id: code.id }, data: { status: 'active' } })).rejects.toThrow(/revoked codes cannot be reactivated/);
  });

  it('business code control: pause/revoke with audit; other business blocked', async () => {
    const s = await setupPartnership(ctx);
    const code = await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: s.partnershipId } });
    const other = await setupLiveCampaign(ctx);
    expect((await other.client.post(`/api/v1/promotion-codes/${code.id}/revoke`, { reason: 'leak' })).status).toBe(404);
    expect((await s.live.client.post(`/api/v1/promotion-codes/${code.id}/revoke`, { reason: 'leaked to coupon site' })).body.data.status).toBe('revoked');
    expect((await s.live.client.post(`/api/v1/promotion-codes/${code.id}/resume`, { reason: 'oops' })).status).toBe(409);
  });

  it('ending a campaign completes partnerships and expires assets', async () => {
    const s = await setupPartnership(ctx);
    await s.live.client.post(`/api/v1/campaigns/${s.live.campaignId}/end`);
    expect((await ctx.prisma.partnership.findUniqueOrThrow({ where: { id: s.partnershipId } })).status).toBe('completed');
    expect((await ctx.prisma.promotionCode.findFirstOrThrow({ where: { partnershipId: s.partnershipId } })).status).toBe('expired');
  });
});
