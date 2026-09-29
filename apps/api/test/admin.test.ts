import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizedOrderSchema } from '@codek/domain';
import { ConversionsService } from '../src/modules/conversions/conversions.service';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher';
import { Client, registerAdmin, registerUser, setupCreator, setupPartnership, startApp, type TestContext } from './harness';

let ctx: TestContext;
let pipeline: ConversionsService;
let outbox: OutboxDispatcher;
beforeAll(async () => {
  ctx = await startApp();
  pipeline = ctx.app.get(ConversionsService);
  outbox = ctx.app.get(OutboxDispatcher);
});
afterAll(async () => ctx.app.close());

const order = (code: string, extra: Record<string, unknown> = {}) =>
  normalizedOrderSchema.parse({ eventType: 'ORDER_CREATED', externalEventId: `e-${randomUUID()}`, externalRef: `o-${randomUUID()}`, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [code], ...extra });

describe('admin function-level authorization', () => {
  it('non-admins and under-privileged admins are rejected on every admin route family', async () => {
    const creator = await setupCreator(ctx);
    const support = await registerAdmin(ctx, 'support_agent');
    for (const url of ['/api/v1/admin/overview', '/api/v1/admin/users', '/api/v1/admin/audit-logs', '/api/v1/admin/ledger/entries', '/api/v1/admin/fraud/flags', '/api/v1/admin/settings']) {
      expect((await creator.client.get(url)).status, url).toBe(403);
    }
    expect((await support.get('/api/v1/admin/overview')).status).toBe(200);
    expect((await support.get('/api/v1/admin/ledger/entries')).status).toBe(403);
    expect((await support.post('/api/v1/admin/ledger/adjustments', { accountType: 'creator_available', ownerId: randomUUID(), currency: 'JOD', direction: 'credit', amountMinor: 100, reason: 'test' })).status).toBe(403);
    expect((await new Client(ctx).get('/api/v1/admin/overview')).status).toBe(401);
  });
});

describe('dual approval for financial adjustments', () => {
  it('requires a different finance admin; executes a balanced ledger entry once', async () => {
    const s = await setupPartnership(ctx);
    const a = await registerAdmin(ctx, 'finance_admin');
    const b = await registerAdmin(ctx, 'finance_admin');
    const req = await a.post('/api/v1/admin/ledger/adjustments', { accountType: 'creator_available', ownerId: s.creator.creatorId, currency: 'JOD', direction: 'credit', amountMinor: 250, reason: 'Goodwill correction ticket #42' });
    expect(req.status, JSON.stringify(req.body)).toBe(201);
    expect(req.body.data.executed).toBe(false);
    const id = req.body.data.action.id;
    expect((await a.post(`/api/v1/admin/actions/${id}/approve`)).body.error.message).toMatch(/different administrator/);
    const ok = await b.post(`/api/v1/admin/actions/${id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.executed).toBe(true);
    expect((await b.post(`/api/v1/admin/actions/${id}/approve`)).status).toBe(409);
    const bal = await ctx.app.get(LedgerService).balance(ctx.prisma, { accountType: 'creator_available', ownerId: s.creator.creatorId, currency: 'JOD' });
    expect(bal).toBe(250n);
    expect((await ctx.app.get(LedgerService).verifyInvariants()).ok).toBe(true);
    const audit = await a.get(`/api/v1/admin/audit-logs?action=admin_action`);
    expect(audit.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('commission reversal by admin needs approval and goes through the ledger', async () => {
    const s = await setupPartnership(ctx);
    const r = await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: order(s.code) });
    const calc = await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: r.conversionId! } });
    const a = await registerAdmin(ctx, 'finance_admin');
    const b = await registerAdmin(ctx, 'finance_admin');
    const req = await a.post(`/api/v1/admin/commissions/${calc.id}/reverse`, { reason: 'Confirmed test order' });
    const rej = await b.post(`/api/v1/admin/actions/${req.body.data.action.id}/reject`, { reason: 'Need more evidence' });
    expect(rej.body.data.approvalState).toBe('rejected');
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { id: calc.id } })).status).toBe('pending');
    const req2 = await a.post(`/api/v1/admin/commissions/${calc.id}/reverse`, { reason: 'Confirmed test order (evidence attached)' });
    await b.post(`/api/v1/admin/actions/${req2.body.data.action.id}/approve`);
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { id: calc.id } })).status).toBe('reversed');
  });
});

describe('verification', () => {
  it('business verification request → admin decision → status + notification', async () => {
    const s = await setupPartnership(ctx);
    await ctx.prisma.business.update({ where: { id: s.live.businessId }, data: { verificationStatus: 'unverified' } });
    const vr = await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/verification`, { registrationNumber: 'JO-123', notes: 'CR attached' });
    expect(vr.status).toBe(201);
    const admin = await registerAdmin(ctx, 'support_agent');
    const d = await admin.post(`/api/v1/admin/verification-cases/${vr.body.data.id}/decide`, { decision: 'verified', reason: 'Commercial registration checked' });
    expect(d.body.data.status).toBe('verified');
    expect((await ctx.prisma.business.findUniqueOrThrow({ where: { id: s.live.businessId } })).verificationStatus).toBe('verified');
    expect((await admin.post(`/api/v1/admin/verification-cases/${vr.body.data.id}/decide`, { decision: 'verified', reason: 'again' })).status).toBe(409);
    const social = await s.creator.client.post('/api/v1/creator/social-accounts', { platform: 'youtube', handle: 'c', followerCount: 100 });
    const v = await admin.post(`/api/v1/admin/social-accounts/${social.body.data.id}/verify`, { followerCount: 1500, evidence: 'Screen share of analytics' });
    expect(v.body.data).toMatchObject({ verificationState: 'verified', followerCount: 1500, metricDefinitionVersion: 'admin-verified-v1' });
  });
});

describe('fraud workflow', () => {
  it('self-referral signal flags (no auto-punishment), blocks payouts, case decision holds commissions, close releases', async () => {
    const s = await setupPartnership(ctx);
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { creator: { id: s.creator.creatorId } } });
    const selfRef = createHash('sha256').update(user.email).digest('hex');
    const r = await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: order(s.code, { customerRef: selfRef }) });
    await outbox.dispatchBatch(500);
    const flag = await ctx.prisma.fraudFlag.findFirstOrThrow({ where: { subjectId: s.creator.creatorId, signalType: 'self_referral' } });
    expect(flag.severity).toBe('high');
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: r.conversionId! } })).onHold).toBe(false);
    await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: 'x@paypal.example' });
    const blocked = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': `k-${randomUUID()}` });
    expect(blocked.body.error.details.reason).toBe('RISK_REVIEW');
    const admin = await registerAdmin(ctx, 'support_agent');
    const c = await admin.post('/api/v1/admin/fraud/cases', { subjectType: 'creator', subjectId: s.creator.creatorId, riskLevel: 'high', summary: 'Customer reference matches creator identity', flagIds: [flag.id] });
    expect(c.status).toBe(201);
    expect((await admin.post(`/api/v1/admin/fraud/cases/${c.body.data.id}/transition`, { to: 'decision', reason: 'skip' })).status).toBe(409);
    await admin.post(`/api/v1/admin/fraud/cases/${c.body.data.id}/transition`, { to: 'review', reason: 'Reviewing orders' });
    const dec = await admin.post(`/api/v1/admin/fraud/cases/${c.body.data.id}/transition`, { to: 'decision', reason: 'Self-purchase confirmed', resolutionCode: 'confirmed_fraud', holdCommissions: true });
    expect(dec.body.data.resolutionCode).toBe('confirmed_fraud');
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: r.conversionId! } })).onHold).toBe(true);
    await admin.post(`/api/v1/admin/fraud/cases/${c.body.data.id}/transition`, { to: 'closed', reason: 'Commission reversal requested separately' });
    expect((await ctx.prisma.fraudFlag.findUniqueOrThrow({ where: { id: flag.id } })).status).toBe('resolved');
    const detail = await admin.get(`/api/v1/admin/fraud/cases/${c.body.data.id}`);
    expect(detail.body.data.history.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['fraud.case_opened', 'fraud.case_decision', 'fraud.case_closed']));
  });

  it('attribution conflicts raise low-severity review flags', async () => {
    const s = await setupPartnership(ctx);
    const other = await setupPartnership(ctx);
    void other;
    const click = await ctx.http().get(`/r/${s.referralToken}`);
    const ref = new URL(click.headers.location).searchParams.get('codek_ref');
    const creator2 = await setupCreator(ctx);
    const app = await creator2.client.post(`/api/v1/campaigns/${s.live.campaignId}/apply`, {});
    const acc = await s.live.client.post(`/api/v1/applications/${app.body.data.id}/accept`);
    const r = await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: order(acc.body.data.assets.code, { referralClickId: ref }) });
    await outbox.dispatchBatch(500);
    expect(await ctx.prisma.fraudFlag.count({ where: { subjectId: r.conversionId!, signalType: 'attribution_conflict', severity: 'low' } })).toBe(1);
  });
});

describe('disputes', () => {
  it('party opens → evidence → admin hold → decision → adjustment reverses → closed; outsiders blocked', async () => {
    const s = await setupPartnership(ctx);
    const r = await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: order(s.code) });
    const outsider = await setupCreator(ctx);
    expect((await outsider.client.post('/api/v1/disputes', { type: 'attribution', summary: 'This sale is not mine at all', conversionId: r.conversionId })).status).toBe(404);
    const d = await s.live.client.post('/api/v1/disputes', { type: 'attribution', summary: 'The customer says they never saw this creator', conversionId: r.conversionId });
    expect(d.status).toBe(201);
    expect((await s.creator.client.post(`/api/v1/disputes/${d.body.data.id}/evidence`, { description: 'Screenshot of the customer DM', externalUrl: 'https://instagram.com/p/xyz' })).status).toBe(201);
    expect((await outsider.client.get(`/api/v1/disputes/${d.body.data.id}`)).status).toBe(404);
    expect((await s.live.client.post(`/api/v1/admin/disputes/${d.body.data.id}/transition`, { to: 'hold', reason: 'x' })).status).toBe(403);
    const admin = await registerAdmin(ctx, 'support_agent');
    const t = (to: string, extra: Record<string, unknown> = {}) => admin.post(`/api/v1/admin/disputes/${d.body.data.id}/transition`, { to, reason: `step ${to}`, ...extra });
    expect((await t('hold')).body.data.status).toBe('hold');
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: r.conversionId! } })).onHold).toBe(true);
    await t('review');
    expect((await t('decision')).status).toBe(400);
    await t('decision', { decisionCode: 'uphold_business' });
    await t('adjustment', { reverseCommission: true });
    expect((await ctx.prisma.commissionCalculation.findUniqueOrThrow({ where: { conversionId: r.conversionId! } })).status).toBe('reversed');
    expect((await t('closed')).body.data.status).toBe('closed');
    const view = await s.creator.client.get(`/api/v1/disputes/${d.body.data.id}`);
    expect(view.body.data.evidence).toHaveLength(1);
    expect(view.body.data.timeline.length).toBeGreaterThanOrEqual(6);
  });
});

describe('audit, legal, privacy, settings', () => {
  it('audit chain verifies intact; settings changes are audited', async () => {
    const admin = await registerAdmin(ctx, 'platform_admin');
    expect((await admin.get('/api/v1/admin/audit-logs/verify')).body.data.intact).toBe(true);
    const r = await admin.put('/api/v1/admin/settings/payouts.enabled', { value: true, enabled: true, reason: 'Confirm payouts on' });
    expect(r.status).toBe(200);
    expect((await admin.get('/api/v1/admin/audit-logs?action=settings.updated')).body.data.length).toBeGreaterThan(0);
  });

  it('new legal version requires re-acceptance with version + timestamp', async () => {
    const creator = await registerUser(ctx, 'creator');
    expect((await creator.get('/api/v1/legal/pending')).body.data).toHaveLength(0);
    const admin = await registerAdmin(ctx, 'platform_admin');
    const draft = await admin.post('/api/v1/admin/legal-documents', { documentType: 'creator_agreement', version: `0.2-${randomUUID().slice(0, 4)}`, title: 'Creator Agreement', content: 'Updated placeholder text for testing only.', requiredFor: ['creator'] });
    await admin.post(`/api/v1/admin/legal-documents/${draft.body.data.id}/publish`);
    const pending = await creator.get('/api/v1/legal/pending');
    expect(pending.body.data.map((d: { id: string }) => d.id)).toEqual([draft.body.data.id]);
    expect((await creator.post('/api/v1/legal/accept', { documentIds: [draft.body.data.id] })).body.data.accepted).toBe(1);
    expect((await creator.get('/api/v1/legal/pending')).body.data).toHaveLength(0);
  });

  it('privacy: export own data; deletion anonymizes identity but keeps financial history (dual approval)', async () => {
    const s = await setupPartnership(ctx);
    const exp = await s.creator.client.get('/api/v1/privacy/export');
    expect(exp.body.data.user.email).toMatch(/@example.com/);
    expect(exp.body.data.creator.partnerships).toHaveLength(1);
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: order(s.code) });
    const req = await s.creator.client.post('/api/v1/privacy/requests', { requestType: 'deletion', details: 'Please delete my account' });
    expect(req.status).toBe(201);
    const a = await registerAdmin(ctx, 'platform_admin');
    const b = await registerAdmin(ctx, 'platform_admin');
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { creator: { id: s.creator.creatorId } } });
    const act = await a.post(`/api/v1/admin/users/${user.id}/anonymize`, { reason: `Deletion request ${req.body.data.id}` });
    await b.post(`/api/v1/admin/actions/${act.body.data.action.id}/approve`);
    const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after).toMatchObject({ status: 'deleted', name: 'Deleted user' });
    expect(after.email).toMatch(/anonymized\.invalid$/);
    expect(await ctx.prisma.commissionCalculation.count({ where: { creatorId: s.creator.creatorId } })).toBe(1);
    expect((await s.creator.client.get('/api/v1/auth/session')).status).toBe(401);
    await a.post(`/api/v1/admin/privacy/requests/${req.body.data.id}/complete`, { note: 'Anonymized; financial records retained as legally required' });
  });

  it('suspending a user revokes sessions and blocks sign-in', async () => {
    const c = await registerUser(ctx, 'creator', `susp-${randomUUID().slice(0, 6)}@example.com`);
    const admin = await registerAdmin(ctx, 'platform_admin');
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { email: (c as Client & { email: string }).email } });
    await admin.post(`/api/v1/admin/users/${user.id}/suspend`, { reason: 'Abuse report confirmed' });
    expect((await c.get('/api/v1/auth/session')).status).toBe(401);
    const si = await new Client(ctx).post('/api/v1/auth/sign-in', { email: user.email, password: 'correct-horse-battery-9' });
    expect(si.status).toBe(403);
  });
});
