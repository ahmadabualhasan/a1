import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizedOrderSchema } from '@codek/domain';
import { AnalyticsService, toCsv } from '../src/modules/analytics/analytics.service';
import { ConversionsService } from '../src/modules/conversions/conversions.service';
import { registerAdmin, setupPartnership, startApp, type TestContext } from './harness';

let ctx: TestContext;
let pipeline: ConversionsService;
beforeAll(async () => {
  ctx = await startApp();
  pipeline = ctx.app.get(ConversionsService);
});
afterAll(async () => ctx.app.close());

const ev = (type: string, ref: string, extra: Record<string, unknown> = {}) =>
  normalizedOrderSchema.parse({ eventType: type, externalEventId: `${type}-${randomUUID()}`, externalRef: ref, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountMinor: 1000, ...extra });

describe('analytics', () => {
  it('overview separates verified/self-reported/unattributed, funnel and money agree with the ledger', async () => {
    const s = await setupPartnership(ctx);
    await ctx.http().get(`/r/${s.referralToken}`);
    await ctx.http().get(`/r/${s.referralToken}`);
    const b = s.live.businessId;
    const r1 = `o-${randomUUID()}`;
    await pipeline.ingest({ businessId: b, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', r1, { discountCodes: [s.code] }) });
    await pipeline.ingest({ businessId: b, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID', r1) });
    await pipeline.ingest({ businessId: b, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', `o-${randomUUID()}`) }); // unattributed
    await s.live.client.post(`/api/v1/businesses/${b}/conversions/manual`, { promotionCode: s.code, externalRef: `m-${randomUUID()}`, currency: 'JOD', grossMinor: 5000, evidenceNote: 'paper receipt number 55' });
    const o = await s.live.client.get(`/api/v1/businesses/${b}/analytics/overview`);
    expect(o.status, JSON.stringify(o.body)).toBe(200);
    const d = o.body.data;
    expect(d.kpis.conversions).toMatchObject({ total: 3, verified: 2, selfReported: 1 });
    expect(d.kpis.attribution).toMatchObject({ attributed: 2, unattributed: 1 });
    expect(d.kpis.clicks).toBe(2);
    expect(d.funnel.conversionRate).toBe('1.0000');
    const jod = d.money.find((m: { currency: string }) => m.currency === 'JOD');
    expect(jod).toMatchObject({ totalSalesMinor: 18000, creatorAttributedSalesMinor: 9000, creatorCommissionsMinor: 1350 + 750 });
    expect(d.ledgerCheck.consistent).toBe(true);
    expect(d.provenance.metricDefinitionVersion).toBe('analytics-v1');
    expect(JSON.stringify(d)).not.toMatch(/customerRef/i);

    const table = await s.live.client.get(`/api/v1/businesses/${b}/analytics/creators`);
    expect(table.body.data.items[0]).toMatchObject({ code: s.code, clicks: 2, conversions: 1, salesMinor: 9000, commissionMinor: 2100, conversionRate: '0.5000' });
    const other = await setupPartnership(ctx);
    expect((await other.live.client.get(`/api/v1/businesses/${b}/analytics/overview`)).status).toBe(404);
    const creatorView = await s.creator.client.get('/api/v1/creator/analytics');
    expect(creatorView.body.data.items[0]).toMatchObject({ clicks: 2, conversions: 1 });
  });

  it('CSV export is formula-injection safe and excludes customer data', async () => {
    const s = await setupPartnership(ctx);
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', '=HYPERLINK("http://evil")', { discountCodes: [s.code], customerRef: 'secret-customer' }) });
    const r = await s.live.client.get(`/api/v1/businesses/${s.live.businessId}/analytics/export.csv?kind=conversions`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(r.text).not.toContain('secret-customer');
    expect(toCsv(['a'], [['+cmd'], ['x,y']])).toBe("a\r\n'+cmd\r\n\"x,y\"\r\n");
  });

  it('daily aggregation writes business and partnership rows idempotently', async () => {
    const s = await setupPartnership(ctx);
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED', `o-${randomUUID()}`, { discountCodes: [s.code] }) });
    const svc = ctx.app.get(AnalyticsService);
    await svc.aggregateDay(new Date());
    await svc.aggregateDay(new Date());
    const rows = await ctx.prisma.analyticsDailyStat.findMany({ where: { businessId: s.live.businessId } });
    expect(rows.find((r) => r.scopeKey === '*:*:JOD')).toMatchObject({ conversions: 1, verifiedSalesMinor: 9000n, commissionMinor: 1350n });
    expect(rows.find((r) => r.partnershipId === s.partnershipId)).toBeTruthy();
    expect(rows.length).toBe(2);
    const ts = await s.live.client.get(`/api/v1/businesses/${s.live.businessId}/analytics/timeseries`);
    expect(ts.body.data.items, JSON.stringify(ts.body)).toHaveLength(1);
    const admin = await registerAdmin(ctx, 'finance_admin');
    expect((await admin.get('/api/v1/admin/analytics')).status).toBe(200);
  });
});
