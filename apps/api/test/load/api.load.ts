import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerService } from '../../src/modules/finance/ledger.service';
import { CustomWebhookAdapter } from '../../src/modules/integrations/adapters/custom.adapter';
import { WebhooksService } from '../../src/modules/integrations/webhooks.service';
import { setupPartnership, startApp, type TestContext } from '../harness';

/**
 * Load scenarios against a real HTTP listener (PostgreSQL + Redis), with correctness checks after each burst:
 * idempotent webhook ingestion under duplicate delivery, tracking redirect throughput, public reads and
 * authenticated reads. Thresholds are deliberately generous for shared CI runners; the report lists the measured
 * numbers (see docs/TESTING.md for the latest results).
 */
let ctx: TestContext;
let base = '';
beforeAll(async () => {
  ctx = await startApp();
  await ctx.app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => ctx.app.close());

const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

interface Result { name: string; requests: number; concurrency: number; rps: number; p50: number; p95: number; p99: number; max: number; statuses: Record<number, number> }
const report: Result[] = [];

async function burst(name: string, total: number, concurrency: number, make: (i: number) => Promise<Response>): Promise<Result> {
  const latencies: number[] = [];
  const statuses: Record<number, number> = {};
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const i = next++;
        const t0 = performance.now();
        const res = await make(i);
        await res.arrayBuffer();
        latencies.push(performance.now() - t0);
        statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      }
    }),
  );
  const elapsed = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const pct = (p: number) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]!);
  const r = { name, requests: total, concurrency, rps: Math.round(total / elapsed), p50: pct(50), p95: pct(95), p99: pct(99), max: Math.round(latencies[latencies.length - 1]!), statuses };
  report.push(r);
  return r;
}

describe('load', () => {
  afterAll(() => {
    const lines = ['| Scenario | Requests | Concurrency | req/s | p50 ms | p95 ms | p99 ms | max ms | Statuses |', '|---|---|---|---|---|---|---|---|---|'];
    for (const r of report) lines.push(`| ${r.name} | ${r.requests} | ${r.concurrency} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${JSON.stringify(r.statuses)} |`);
    writeFileSync(process.env.LOAD_REPORT ?? 'load-report.md', `${lines.join('\n')}\n`);
  });

  it('webhook ingestion: signed events with duplicate delivery stay idempotent and the ledger balances', async () => {
    const s = await setupPartnership(ctx, { holdPeriodDays: 0, conversionApprovalMode: 'auto_verified' });
    const conn = await s.live.client.post('/api/v1/integrations/custom/connect', { businessId: s.live.businessId, config: { systemType: 'website' } });
    const integrationId = conn.body.data.integration.id as string;
    const secret = conn.body.data.revealOnce.signingSecret as string;
    await ctx.prisma.integration.update({ where: { id: integrationId }, data: { status: 'live', environment: 'live', healthStatus: 'ok' } });

    const orders = 300;
    // Per order: ORDER_CREATED, ORDER_PAID, and a duplicate delivery of ORDER_PAID with the same event id.
    const events = Array.from({ length: orders }, (_, i) => {
      const ref = `load-${randomUUID()}`;
      const body = (type: string) => JSON.stringify({ eventType: type, externalEventId: `${type}-${ref}`, externalRef: ref, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000 + i, discountCodes: [s.code] });
      const paidId = randomUUID();
      return [
        { id: randomUUID(), raw: body('ORDER_CREATED') },
        { id: paidId, raw: body('ORDER_PAID') },
        { id: paidId, raw: body('ORDER_PAID') },
      ];
    }).flat();
    const r = await burst('webhook ingest (custom, signed)', events.length, 50, (i) => {
      const e = events[i]!;
      const ts = Math.floor(Date.now() / 1000);
      return fetch(`${base}/api/v1/webhooks/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Codek-Integration-Id': integrationId, 'X-Codek-Event-Id': e.id, 'X-Codek-Timestamp': String(ts), 'X-Codek-Signature': CustomWebhookAdapter.sign(secret, ts, e.raw), 'X-Forwarded-For': ip() },
        body: e.raw,
      });
    });
    expect(Object.keys(r.statuses).every((k) => Number(k) < 300)).toBe(true);
    expect(r.p95).toBeLessThan(1500);
    expect(await ctx.prisma.webhookEvent.count({ where: { integrationId } })).toBe(orders * 2);

    // Drain: process every stored event (the worker does this in production), concurrently.
    const pending = await ctx.prisma.webhookEvent.findMany({ where: { integrationId }, select: { id: true }, orderBy: { receivedAt: 'asc' } });
    const webhooks = ctx.app.get(WebhooksService);
    const t0 = performance.now();
    let k = 0;
    await Promise.all(Array.from({ length: 10 }, async () => { while (k < pending.length) await webhooks.process(pending[k++]!.id); }));
    report.push({ name: 'webhook processing (drain, 10 workers)', requests: pending.length, concurrency: 10, rps: Math.round(pending.length / ((performance.now() - t0) / 1000)), p50: 0, p95: 0, p99: 0, max: 0, statuses: {} });

    expect(await ctx.prisma.conversion.count({ where: { businessId: s.live.businessId } })).toBe(orders);
    expect(await ctx.prisma.commissionCalculation.count({ where: { partnershipId: s.partnershipId } })).toBe(orders);
    expect((await ctx.app.get(LedgerService).verifyInvariants()).ok).toBe(true);
  });

  it('tracking redirects stay fast and every click is recorded once', async () => {
    const s = await setupPartnership(ctx);
    const before = await ctx.prisma.trackingClick.count({ where: { partnershipId: s.partnershipId } });
    const total = 2000;
    const r = await burst('tracking redirect /r/:token', total, 50, () =>
      fetch(`${base}/r/${s.referralToken}`, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537.36', 'X-Forwarded-For': ip() } }),
    );
    expect(r.statuses[302]).toBe(total);
    expect(r.p95).toBeLessThan(1000);
    expect((await ctx.prisma.trackingClick.count({ where: { partnershipId: s.partnershipId } })) - before).toBe(total);
  });

  it('public marketplace and authenticated reads', async () => {
    const s = await setupPartnership(ctx);
    const pub = await burst('public marketplace list', 1000, 50, () => fetch(`${base}/api/v1/marketplace/campaigns?limit=25`, { headers: { 'X-Forwarded-For': ip() } }));
    expect(pub.statuses[200]).toBe(1000);
    expect(pub.p95).toBeLessThan(1500);
    const cookie = s.creator.client.cookies.join('; ');
    const auth = await burst('creator earnings (authenticated)', 500, 25, () => fetch(`${base}/api/v1/creator/earnings`, { headers: { Cookie: cookie, 'X-Forwarded-For': ip() } }));
    expect(auth.statuses[200]).toBe(500);
    expect(auth.p95).toBeLessThan(1500);
  });
});
