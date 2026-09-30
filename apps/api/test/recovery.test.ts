import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { normalizedOrderSchema } from '@codek/domain';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { CustomWebhookAdapter } from '../src/modules/integrations/adapters/custom.adapter';
import { WebhooksService } from '../src/modules/integrations/webhooks.service';
import { ConversionsService } from '../src/modules/conversions/conversions.service';
import { PayoutsService } from '../src/modules/payouts/payouts.service';
import { QueueService } from '../src/queue/queue.service';
import { setupPartnership, startApp, type TestContext } from './harness';

/** Crash/outage simulations at every durable hand-off; recovery must converge without duplicates or ledger drift. */
let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

async function liveCustomIntegration(s: Awaited<ReturnType<typeof setupPartnership>>) {
  const conn = await s.live.client.post('/api/v1/integrations/custom/connect', { businessId: s.live.businessId, config: { systemType: 'website' } });
  const integrationId = conn.body.data.integration.id as string;
  await ctx.prisma.integration.update({ where: { id: integrationId }, data: { status: 'live', environment: 'live', healthStatus: 'ok' } });
  return { integrationId, secret: conn.body.data.revealOnce.signingSecret as string };
}

async function deliver(integrationId: string, secret: string, body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  return ctx
    .http()
    .post('/api/v1/webhooks/custom')
    .set('Content-Type', 'application/json')
    .set('X-Codek-Integration-Id', integrationId)
    .set('X-Codek-Event-Id', randomUUID())
    .set('X-Codek-Timestamp', String(ts))
    .set('X-Codek-Signature', CustomWebhookAdapter.sign(secret, ts, raw))
    .send(raw);
}

const order = (code: string, ref: string, type: string) => ({ eventType: type, externalEventId: `${type}-${ref}`, externalRef: ref, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [code] });

describe('recovery', () => {
  it('a webhook left in `processing` by a crashed worker is swept and processed exactly once', async () => {
    const s = await setupPartnership(ctx);
    const i = await liveCustomIntegration(s);
    const ref = `crash-${randomUUID()}`;
    expect((await deliver(i.integrationId, i.secret, order(s.code, ref, 'ORDER_CREATED'))).status).toBe(202);
    const ev = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { integrationId: i.integrationId } });
    // Simulate a worker that set `processing` and died. (received_at is immutable, so the staleness threshold is
    // exercised through the sweeper's parameters instead of back-dating the row.)
    await ctx.prisma.webhookEvent.update({ where: { id: ev.id }, data: { processingState: 'processing' } });
    const webhooks = ctx.app.get(WebhooksService);
    const sweptIds = async (processingMs: number) => {
      const spy = vi.spyOn(ctx.app.get(QueueService), 'add');
      await webhooks.sweep(120_000, processingMs);
      const ids = spy.mock.calls.map((c) => (c[2] as { webhookEventId: string }).webhookEventId);
      spy.mockRestore();
      return ids;
    };
    // A run that started recently is left alone; one older than the threshold is re-queued.
    expect(await sweptIds(15 * 60_000)).not.toContain(ev.id);
    expect(await sweptIds(0)).toContain(ev.id);
    // The re-queued job and a late duplicate run race; the outcome is still one conversion.
    const [a, b] = await Promise.all([webhooks.process(ev.id), webhooks.process(ev.id)]);
    expect([a, b]).toContain('processed');
    expect(await ctx.prisma.conversion.count({ where: { businessId: s.live.businessId, externalRef: ref } })).toBe(1);
  });

  it('events received while Redis is unavailable are stored durably and recovered by the sweeper', async () => {
    const s = await setupPartnership(ctx);
    const i = await liveCustomIntegration(s);
    const queues = ctx.app.get(QueueService);
    const spy = vi.spyOn(queues, 'add').mockResolvedValueOnce(false);
    const ref = `redis-down-${randomUUID()}`;
    const res = await deliver(i.integrationId, i.secret, order(s.code, ref, 'ORDER_CREATED'));
    spy.mockRestore();
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(false);
    const ev = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { integrationId: i.integrationId } });
    expect(ev.processingState).toBe('received');
    const webhooks = ctx.app.get(WebhooksService);
    expect(await webhooks.sweep(0)).toBeGreaterThanOrEqual(1);
    expect(await webhooks.process(ev.id)).toBe('processed');
    expect(await ctx.prisma.conversion.count({ where: { externalRef: ref } })).toBe(1);
  });

  it('outbox rows claimed by a dispatcher that died are re-dispatched after the lease, without duplicate effects', async () => {
    const s = await setupPartnership(ctx);
    const dispatcher = ctx.app.get(OutboxDispatcher);
    await dispatcher.dispatchBatch(500);
    const row = await ctx.prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: s.partnershipId }, orderBy: { createdAt: 'asc' } });
    const notificationsBefore = await ctx.prisma.notification.count();
    // Simulate: claimed (processing) by a dispatcher that crashed; the lease has expired.
    await ctx.prisma.outboxEvent.update({ where: { id: row.id }, data: { status: 'processing', nextAttemptAt: new Date(Date.now() - 1000) } });
    // A live claim (lease in the future) must not be stolen.
    const other = await ctx.prisma.outboxEvent.findFirst({ where: { id: { not: row.id }, status: 'published' } });
    if (other) await ctx.prisma.outboxEvent.update({ where: { id: other.id }, data: { status: 'processing', nextAttemptAt: new Date(Date.now() + 60_000) } });
    expect(await dispatcher.recoverStuck()).toBe(1);
    await dispatcher.dispatchBatch(500);
    expect((await ctx.prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('published');
    // Notification handlers are idempotent (dedupe keys): re-dispatch creates nothing new.
    expect(await ctx.prisma.notification.count()).toBe(notificationsBefore);
    if (other) expect((await ctx.prisma.outboxEvent.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('processing');
  });

  it('a payout whose worker died while the provider was still processing is swept and completes once', async () => {
    const s = await setupPartnership(ctx, { holdPeriodDays: 0 });
    await s.creator.client.patch('/api/v1/creator/payout-method', { type: 'paypal', email: 'async@paypal.example' });
    const pipeline = ctx.app.get(ConversionsService);
    const ref = `po-${randomUUID()}`;
    const ev = (type: string) => normalizedOrderSchema.parse({ eventType: type, externalEventId: `${type}-${ref}`, externalRef: ref, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 20000, discountCodes: [s.code] });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_CREATED') });
    await pipeline.ingest({ businessId: s.live.businessId, sourceSystem: 'custom', verifiedState: 'verified', event: ev('ORDER_PAID') });
    await s.live.client.post(`/api/v1/businesses/${s.live.businessId}/funding`, { amountMinor: 20000, currency: 'JOD', fundingMethod: 'sandbox' }, { 'Idempotency-Key': randomUUID() });
    const req = await s.creator.client.post('/api/v1/creator/payouts/request', { currency: 'JOD' }, { 'Idempotency-Key': randomUUID() });
    expect(req.status).toBe(201);
    const payouts = ctx.app.get(PayoutsService);
    // First attempt: provider accepted asynchronously; then the worker "dies" (no follow-up job).
    expect((await payouts.process(req.body.data.id)).status).toBe('processing');
    expect(await payouts.sweep()).toBeGreaterThanOrEqual(1);
    const [x, y] = await Promise.all([payouts.process(req.body.data.id), payouts.process(req.body.data.id)]);
    expect([x.status, y.status]).toContain('paid');
    const paid = await ctx.prisma.payout.findUniqueOrThrow({ where: { id: req.body.data.id } });
    expect(paid.status).toBe('paid');
    expect(await ctx.prisma.ledgerEntry.count({ where: { referenceType: 'payout', referenceId: paid.id, entryType: 'payout_paid' } })).toBe(1);
    expect((await ctx.app.get(LedgerService).verifyInvariants()).ok).toBe(true);
  });
});
