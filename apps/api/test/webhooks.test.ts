import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hmacSha256 } from '@codek/domain';
import { CustomWebhookAdapter } from '../src/modules/integrations/adapters/custom.adapter';
import { WebhooksService } from '../src/modules/integrations/webhooks.service';
import { registerAdmin, setupPartnership, startApp, type TestContext } from './harness';

let ctx: TestContext;
let webhooks: WebhooksService;
beforeAll(async () => {
  ctx = await startApp();
  webhooks = ctx.app.get(WebhooksService);
});
afterAll(async () => ctx.app.close());

type S = Awaited<ReturnType<typeof setupPartnership>>;

async function connectCustom(s: S) {
  const r = await s.live.client.post('/api/v1/integrations/custom/connect', { businessId: s.live.businessId, displayName: 'Web shop', config: { systemType: 'website' } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { integrationId: r.body.data.integration.id as string, secret: r.body.data.revealOnce.signingSecret as string };
}

async function send(integrationId: string, secret: string, body: Record<string, unknown>, opts: { eventId?: string; ts?: number; test?: boolean; badSig?: boolean; raw?: string } = {}) {
  const eventId = opts.eventId ?? randomUUID();
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const sig = opts.badSig ? 'v1=deadbeef' : CustomWebhookAdapter.sign(secret, ts, raw);
  const req = ctx.http().post('/api/v1/webhooks/custom').set('Content-Type', 'application/json').set('X-Codek-Integration-Id', integrationId).set('X-Codek-Event-Id', eventId).set('X-Codek-Timestamp', String(ts)).set('X-Codek-Signature', sig);
  if (opts.test) req.set('X-Codek-Test', 'true');
  const res = await req.send(raw);
  return Object.assign(res, { eventId });
}

const orderBody = (code: string, ref: string, type = 'ORDER_CREATED', extra: Record<string, unknown> = {}) => ({
  eventType: type,
  externalEventId: `${type}-${ref}`,
  externalRef: ref,
  occurredAt: new Date().toISOString(),
  currency: 'JOD',
  grossMinor: 10000,
  discountCodes: [code],
  ...extra,
});

async function liveIntegration(s: S) {
  const c = await connectCustom(s);
  expect((await s.live.client.post(`/api/v1/integrations/${c.integrationId}/test`)).body.data.status).toBe('testing');
  const early = await s.live.client.post(`/api/v1/integrations/${c.integrationId}/go-live`);
  expect(early.status).toBe(422);
  const t = await send(c.integrationId, c.secret, orderBody(s.code, 'test-order-1'), { test: true });
  expect(t.status).toBe(200);
  expect(t.body).toMatchObject({ testMode: true, valid: true });
  expect(await ctx.prisma.conversion.count({ where: { externalRef: 'test-order-1' } })).toBe(0);
  expect((await s.live.client.post(`/api/v1/integrations/${c.integrationId}/go-live`)).body.data.status).toBe('live');
  return c;
}

describe('integration lifecycle & secrets', () => {
  it('connect reveals the signing secret once; secret stored encrypted, never returned again', async () => {
    const s = await setupPartnership(ctx);
    const c = await connectCustom(s);
    const list = await s.live.client.get(`/api/v1/integrations?businessId=${s.live.businessId}`);
    expect(JSON.stringify(list.body)).not.toContain(c.secret);
    const stored = await ctx.prisma.encryptedSecret.findMany();
    expect(stored.every((row) => !row.ciphertext.includes(c.secret) && row.authTag.length > 0)).toBe(true);
    const other = await setupPartnership(ctx);
    expect((await other.live.client.get(`/api/v1/integrations?businessId=${s.live.businessId}`)).status).toBe(404);
    expect((await other.live.client.post(`/api/v1/integrations/${c.integrationId}/disconnect`)).status).toBe(404);
  });
});

describe('webhook pipeline', () => {
  it('valid → stored raw → queued → processed into an attributed conversion; duplicates acknowledged without effect', async () => {
    const s = await setupPartnership(ctx);
    const c = await liveIntegration(s);
    const eventId = randomUUID();
    const body = orderBody(s.code, `ord-${randomUUID()}`);
    const r = await send(c.integrationId, c.secret, body, { eventId });
    expect(r.status).toBe(202);
    const ev = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: eventId } });
    expect(ev).toMatchObject({ signatureValid: true, replayCheckPassed: true, processingState: 'queued' });
    expect(await webhooks.process(ev.id)).toBe('processed');
    expect(await webhooks.process(ev.id)).toBe('processed'); // idempotent re-run
    const conv = await ctx.prisma.conversion.findFirstOrThrow({ where: { externalRef: body.externalRef as string }, include: { events: true } });
    expect(conv).toMatchObject({ status: 'attributed', verifiedState: 'verified', sourceSystem: 'custom' });
    expect(conv.events[0]!.webhookEventId).toBe(ev.id); // lineage raw → normalized → conversion
    const dup = await send(c.integrationId, c.secret, body, { eventId });
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);
    expect(await ctx.prisma.webhookEvent.count({ where: { providerEventId: eventId } })).toBe(1);
    // Same order event re-sent with a new delivery id: stored, but the conversion pipeline dedupes it.
    const redelivery = await send(c.integrationId, c.secret, body);
    const ev2 = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: redelivery.eventId } });
    await webhooks.process(ev2.id);
    expect(await ctx.prisma.conversion.count({ where: { externalRef: body.externalRef as string } })).toBe(1);
    expect(await ctx.prisma.commissionCalculation.count({ where: { conversionId: conv.id } })).toBe(1);
  });

  it('invalid signature is rejected (401) and stored as evidence, never processed', async () => {
    const s = await setupPartnership(ctx);
    const c = await liveIntegration(s);
    const r = await send(c.integrationId, c.secret, orderBody(s.code, 'x1'), { badSig: true });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    const ev = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { integrationId: c.integrationId, signatureValid: false } });
    expect(ev.processingState).toBe('ignored');
    const wrongSecret = await send(c.integrationId, 'whsec_wrong', orderBody(s.code, 'x2'));
    expect(wrongSecret.status).toBe(401);
    const unknownIntegration = await send(randomUUID(), c.secret, orderBody(s.code, 'x3'));
    expect(unknownIntegration.status).toBe(401);
    await expect(ctx.prisma.webhookEvent.update({ where: { id: ev.id }, data: { signatureValid: true } })).rejects.toThrow(/IMMUTABLE/);
  });

  it('replayed (stale timestamp) delivery is rejected and flagged', async () => {
    const s = await setupPartnership(ctx);
    const c = await liveIntegration(s);
    const r = await send(c.integrationId, c.secret, orderBody(s.code, 'old'), { ts: Math.floor(Date.now() / 1000) - 3600 });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('WEBHOOK_REPLAY_REJECTED');
    expect(await ctx.prisma.fraudFlag.count({ where: { subjectId: c.integrationId, signalType: 'webhook_replay' } })).toBe(1);
  });

  it('malformed JSON goes to dead-letter; unknown event types are ignored; schema errors dead-letter', async () => {
    const s = await setupPartnership(ctx);
    const c = await liveIntegration(s);
    const bad = await send(c.integrationId, c.secret, {}, { raw: '{"eventType": "ORDER_CREATED", broken' });
    expect(bad.status).toBe(400);
    expect((await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { integrationId: c.integrationId, lastErrorCode: 'MALFORMED_JSON' } })).processingState).toBe('dead_letter');
    const unknown = await send(c.integrationId, c.secret, { eventType: 'CUSTOMER_UPDATED', foo: 1 });
    const ue = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: unknown.eventId } });
    expect(await webhooks.process(ue.id)).toBe('ignored');
    const invalid = await send(c.integrationId, c.secret, { eventType: 'ORDER_CREATED', externalRef: 'x' });
    const ie = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: invalid.eventId } });
    expect(await webhooks.process(ie.id)).toBe('dead_letter');
  });

  it('out-of-order events through webhooks (refund before order) reconcile to the right final state', async () => {
    const s = await setupPartnership(ctx);
    const c = await liveIntegration(s);
    const ref = `ord-${randomUUID()}`;
    const refund = await send(c.integrationId, c.secret, orderBody(s.code, ref, 'ORDER_REFUNDED', { refundedTotalMinor: 10000 }));
    const create = await send(c.integrationId, c.secret, orderBody(s.code, ref, 'ORDER_CREATED'));
    for (const r of [refund, create]) {
      const ev = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: r.eventId } });
      await webhooks.process(ev.id);
    }
    const conv = await ctx.prisma.conversion.findFirstOrThrow({ where: { externalRef: ref }, include: { commission: true } });
    expect(conv.status).toBe('refunded');
    expect(conv.commission!.status).toBe('reversed');
  });

  it('paused integrations hold events; disconnect preserves history and revokes credentials', async () => {
    const s = await setupPartnership(ctx);
    const c = await liveIntegration(s);
    await s.live.client.post(`/api/v1/integrations/${c.integrationId}/pause`);
    const held = await send(c.integrationId, c.secret, orderBody(s.code, `p-${randomUUID()}`));
    expect(held.status).toBe(202);
    expect(held.body.queued).toBe(false);
    const d = await s.live.client.post(`/api/v1/integrations/${c.integrationId}/disconnect`);
    expect(d.body.data.status).toBe('disconnected');
    expect(await ctx.prisma.encryptedSecret.count({ where: { key: { startsWith: `integration/${c.integrationId}/` } } })).toBe(0);
    expect(await ctx.prisma.webhookEvent.count({ where: { integrationId: c.integrationId } })).toBeGreaterThan(0);
    const after = await send(c.integrationId, c.secret, orderBody(s.code, 'after'));
    expect(after.status).toBe(401);
  });
});

describe('shopify adapter', () => {
  it('verifies Shopify HMAC and normalizes orders/create with the CODEK code', async () => {
    const s = await setupPartnership(ctx);
    const shop = `store-${randomUUID().slice(0, 8)}.myshopify.com`;
    const secret = 'shpss_test_secret_value_1234567890';
    const conn = await s.live.client.post('/api/v1/integrations/shopify/connect', { businessId: s.live.businessId, config: { shopDomain: shop }, credentials: { webhookSecret: secret } });
    expect(conn.status, JSON.stringify(conn.body)).toBe(201);
    const id = conn.body.data.integration.id;
    await s.live.client.post(`/api/v1/integrations/${id}/test`);
    await ctx.prisma.integration.update({ where: { id }, data: { status: 'live', environment: 'live', healthStatus: 'ok' } });
    const order = {
      id: 450789469,
      created_at: new Date().toISOString(),
      currency: 'JOD',
      total_line_items_price: '25.000',
      total_discounts: '2.500',
      total_tax: '3.600',
      total_price: '26.100',
      shipping_lines: [{ price: '0.000' }],
      discount_codes: [{ code: s.code.toLowerCase() }],
      note_attributes: [],
      customer: { id: 207119551 },
      line_items: [{ price: '25.000', quantity: 1, sku: 'SERUM-30', product_id: 632910392, total_discount: '2.500' }],
    };
    const raw = JSON.stringify(order);
    const r = await ctx.http().post('/api/v1/webhooks/shopify').set('Content-Type', 'application/json').set('X-Shopify-Topic', 'orders/create').set('X-Shopify-Shop-Domain', shop).set('X-Shopify-Webhook-Id', randomUUID()).set('X-Shopify-Hmac-Sha256', hmacSha256(secret, raw, 'base64')).send(raw);
    expect(r.status).toBe(202);
    const ev = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { integrationId: id } });
    expect(await webhooks.process(ev.id)).toBe('processed');
    const conv = await ctx.prisma.conversion.findFirstOrThrow({ where: { externalRef: '450789469', businessId: s.live.businessId }, include: { commission: true } });
    expect(conv).toMatchObject({ grossMinor: 25000n, discountMinor: 2500n, status: 'attributed' });
    expect(conv.commission!.commissionMinor).toBe(3375n); // 15% of (25.000 - 2.500) JOD
    const forged = await ctx.http().post('/api/v1/webhooks/shopify').set('X-Shopify-Topic', 'orders/create').set('X-Shopify-Shop-Domain', shop).set('X-Shopify-Webhook-Id', randomUUID()).set('X-Shopify-Hmac-Sha256', hmacSha256('wrong', raw, 'base64')).set('Content-Type', 'application/json').send(raw);
    expect(forged.status).toBe(401);
  });
});

describe('reconciliation', () => {
  it('finds matched, missing_local, mismatch and missing_external without changing history', async () => {
    const s = await setupPartnership(ctx);
    const c = await liveIntegration(s);
    const refA = `ord-${randomUUID()}`;
    const refB = `ord-${randomUUID()}`;
    for (const ref of [refA, refB]) {
      const r = await send(c.integrationId, c.secret, orderBody(s.code, ref));
      const ev = await ctx.prisma.webhookEvent.findFirstOrThrow({ where: { providerEventId: r.eventId } });
      await webhooks.process(ev.id);
    }
    const start = new Date(Date.now() - 3600_000).toISOString();
    const end = new Date(Date.now() + 3600_000).toISOString();
    const statement = [
      { externalRef: refA, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 10000, discountCodes: [s.code] },
      { externalRef: refB, occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 12000, discountCodes: [s.code] },
      { externalRef: 'never-received', occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 5000, discountCodes: [s.code] },
      { externalRef: 'not-codek', occurredAt: new Date().toISOString(), currency: 'JOD', grossMinor: 5000, discountCodes: ['OTHER'] },
    ];
    const before = await ctx.prisma.conversion.findFirstOrThrow({ where: { externalRef: refB } });
    const r = await s.live.client.post(`/api/v1/integrations/${c.integrationId}/reconcile`, { scopeStart: start, scopeEnd: end, statement });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.status).toBe('needs_review');
    expect(r.body.data.summaryJson.counts).toMatchObject({ matched: 1, mismatch: 1, missing_local: 1 });
    expect((await ctx.prisma.conversion.findFirstOrThrow({ where: { externalRef: refB } })).grossMinor).toBe(before.grossMinor);
    const detail = await s.live.client.get(`/api/v1/reconciliations/${r.body.data.id}`);
    const mismatch = detail.body.data.items.find((i: { status: string }) => i.status === 'mismatch');
    expect(mismatch.differenceMinor).toBe(-2000);
    const admin = await registerAdmin(ctx, 'finance_admin');
    const res = await admin.post(`/api/v1/admin/reconciliation-items/${mismatch.id}/resolve`, { resolution: 'adjustment_requested', note: 'Merchant confirmed price change' });
    expect(res.body.data.resolvedAt).toBeTruthy();
    const ledgerRecon = await admin.post('/api/v1/admin/reconciliations/ledger');
    expect(ledgerRecon.status).toBe(200);
    expect(ledgerRecon.body.data.summaryJson.ledgerOk).toBe(true);
    expect(ledgerRecon.body.data.summaryJson.counts.mismatch ?? 0).toBe(0);
  });
});
