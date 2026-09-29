import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, setupBusiness, setupCreator, startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

describe('business profiles & tenant isolation', () => {
  it('creates a business with owner membership and derived allowed hosts', async () => {
    const { client, businessId } = await setupBusiness(ctx);
    const r = await client.get(`/api/v1/businesses/${businessId}`);
    expect(r.status).toBe(200);
    expect(r.body.data.myRole).toBe('business_owner');
    expect(r.body.data.allowedDestinationHosts).toContain('shop.acme.example');
    expect(r.body.data.verificationStatus).toBe('unverified');
    const audit = await ctx.prisma.auditLog.findFirst({ where: { objectId: businessId, action: 'business.created' } });
    expect(audit).toBeTruthy();
  });

  it('one business cannot read or modify another business (object-level, 404 without disclosure)', async () => {
    const a = await setupBusiness(ctx);
    const b = await setupBusiness(ctx);
    expect((await b.client.get(`/api/v1/businesses/${a.businessId}`)).status).toBe(404);
    const patch = await b.client.patch(`/api/v1/businesses/${a.businessId}`, { version: 1, displayName: 'Hijacked' });
    expect(patch.status).toBe(404);
    const list = await b.client.get('/api/v1/businesses');
    expect(list.body.data.map((x: { id: string }) => x.id)).toEqual([b.businessId]);
  });

  it('property-level: clients cannot set verification or billing fields', async () => {
    const { client, businessId } = await setupBusiness(ctx);
    const r = await client.patch(`/api/v1/businesses/${businessId}`, { version: 1, verificationStatus: 'verified', billingReady: true });
    expect(r.status).toBe(400);
    const b = await ctx.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(b.verificationStatus).toBe('unverified');
  });

  it('optimistic locking rejects stale updates', async () => {
    const { client, businessId } = await setupBusiness(ctx);
    expect((await client.patch(`/api/v1/businesses/${businessId}`, { version: 1, description: 'first' })).status).toBe(200);
    const stale = await client.patch(`/api/v1/businesses/${businessId}`, { version: 1, description: 'second' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('role permissions: viewer cannot update the business', async () => {
    const { client: owner, businessId } = await setupBusiness(ctx);
    const viewer = await registerUser(ctx, 'business', 'viewer-member@example.com');
    const inv = await owner.post(`/api/v1/businesses/${businessId}/members`, { email: 'viewer-member@example.com', role: 'business_viewer' });
    expect(inv.status).toBe(201);
    expect((await viewer.get(`/api/v1/businesses/${businessId}`)).status).toBe(200);
    const upd = await viewer.patch(`/api/v1/businesses/${businessId}`, { version: 1, description: 'x' });
    expect(upd.status).toBe(403);
    expect(upd.body.error.code).toBe('FORBIDDEN');
  });

  it('creators cannot create businesses; business accounts cannot create creator profiles', async () => {
    const creator = await registerUser(ctx, 'creator');
    const r = await creator.post('/api/v1/businesses', { legalName: 'X LLC', displayName: 'Xylo', category: 'food', country: 'JO', timezone: 'Asia/Amman' });
    expect(r.status).toBe(403);
    const { client } = await setupBusiness(ctx);
    expect((await client.post('/api/v1/creator/profile', { handle: 'bizzy', displayName: 'Biz' })).status).toBe(403);
  });

  it('rejects unsafe website URLs and bad timezones', async () => {
    const c = await registerUser(ctx, 'business');
    const r = await c.post('/api/v1/businesses', { legalName: 'X LLC', displayName: 'X', category: 'food', country: 'JO', timezone: 'Mars/Base', websiteUrl: 'javascript:alert(1)' });
    expect(r.status).toBe(400);
    const paths = r.body.error.details.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['timezone', 'websiteUrl']));
  });
});

describe('creator profiles & social provenance', () => {
  it('creates profile; handle unique; social metrics self-reported with provenance', async () => {
    const { client, creatorId, handle } = await setupCreator(ctx);
    const other = await registerUser(ctx, 'creator');
    expect((await other.post('/api/v1/creator/profile', { handle, displayName: 'Copy' })).status).toBe(409);
    const s = await client.post('/api/v1/creator/social-accounts', { platform: 'instagram', handle: '@me', followerCount: 12000, engagementRate: '0.045' });
    expect(s.status).toBe(201);
    expect(s.body.data).toMatchObject({ verificationState: 'self_reported', metricDefinitionVersion: 'self-reported-v1', followerCount: 12000, engagementRate: '0.045' });
    expect(s.body.data.fetchedAt).toBeTruthy();
    const me = await client.get('/api/v1/creator/profile');
    expect(me.body.data.id).toBe(creatorId);
  });

  it('manually edited verified metrics are downgraded to self-reported', async () => {
    const { client } = await setupCreator(ctx);
    const s = await client.post('/api/v1/creator/social-accounts', { platform: 'tiktok', handle: 't' });
    await ctx.prisma.socialAccount.update({ where: { id: s.body.data.id }, data: { verificationState: 'verified', metricDefinitionVersion: 'tiktok-api-v2' } });
    const u = await client.patch(`/api/v1/creator/social-accounts/${s.body.data.id}`, { followerCount: 999999 });
    expect(u.body.data.verificationState).toBe('self_reported');
  });

  it('creators cannot see other creators private data or browse creators; businesses can browse without emails', async () => {
    const a = await setupCreator(ctx);
    const b = await setupCreator(ctx);
    expect((await b.client.get('/api/v1/creators')).status).toBe(403);
    expect((await b.client.get(`/api/v1/creators/${a.creatorId}`)).status).toBe(403);
    const other = await b.client.patch(`/api/v1/creator/social-accounts/00000000-0000-4000-8000-000000000000`, { handle: 'x' });
    expect(other.status).toBe(404);
    const { client: biz } = await setupBusiness(ctx);
    const list = await biz.get('/api/v1/creators?category=beauty&limit=100');
    expect(list.status).toBe(200);
    expect(list.body.meta.pagination.total).toBeGreaterThanOrEqual(2);
    const prof = await biz.get(`/api/v1/creators/${a.creatorId}`);
    expect(prof.status).toBe(200);
    expect(JSON.stringify(prof.body)).not.toContain('@example.com');
    expect(prof.body.data.performance.source).toBe('codek_verified_operations');
  });
});
