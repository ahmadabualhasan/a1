import { createServer, type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '@codek/config';
import { ENV } from '../src/config/config.module';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher';
import { SettingsService } from '../src/settings/settings.service';
import { registerAdmin, setupCreator, setupPartnership, startApp, type TestContext } from './harness';

let ctx: TestContext;
let outbox: OutboxDispatcher;
beforeAll(async () => {
  ctx = await startApp();
  outbox = ctx.app.get(OutboxDispatcher);
});
afterAll(async () => ctx.app.close());

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

async function upload(client: { cookies: string[] }, purpose: string, buf: Buffer, mime: string, name = 'f.png') {
  return ctx.http().post('/api/v1/files').set('Origin', 'http://localhost:3000').set('Cookie', client.cookies.join('; ')).field('purpose', purpose).attach('file', buf, { filename: name, contentType: mime });
}

describe('notifications (outbox-driven)', () => {
  it('application and acceptance create in-app notifications exactly once, respecting preferences', async () => {
    const s = await setupPartnership(ctx);
    await outbox.dispatchBatch(500);
    await outbox.dispatchBatch(500); // redelivery is harmless
    const creatorN = await s.creator.client.get('/api/v1/notifications');
    expect(creatorN.body.data.map((n: { type: string }) => n.type)).toContain('application.decided');
    expect(creatorN.body.meta.pagination.total).toBe(creatorN.body.data.length);
    const bizN = await s.live.client.get('/api/v1/notifications');
    expect(bizN.body.data.map((n: { type: string }) => n.type)).toEqual(expect.arrayContaining(['application.submitted', 'partnership.created']));
    const dupCount = await ctx.prisma.notification.count({ where: { type: 'application.decided', channel: 'in_app', dataJson: { path: ['link'], string_contains: s.partnershipId } } });
    expect(dupCount).toBe(1);
    const id = creatorN.body.data[0].id;
    expect((await s.creator.client.post(`/api/v1/notifications/${id}/read`)).status).toBe(200);
    expect((await s.live.client.post(`/api/v1/notifications/${id}/read`)).status).toBe(404);
    const prefs = await s.creator.client.put(`/api/v1/notification-preferences/message.received`, { inApp: false, email: false });
    expect(prefs.body.data.find((x: { type: string }) => x.type === 'message.received').inApp).toBe(false);
    await s.live.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { body: 'hello' });
    await outbox.dispatchBatch(500);
    const after = await s.creator.client.get('/api/v1/notifications?limit=100');
    expect(after.body.data.map((n: { type: string }) => n.type)).not.toContain('message.received');
  });
});

describe('messaging', () => {
  it('only partnership parties can read/write; reports and moderation hide without deleting', async () => {
    const s = await setupPartnership(ctx);
    const outsider = await setupCreator(ctx);
    expect((await s.creator.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { body: 'Hi! Loving the product' })).status).toBe(201);
    const m = await s.live.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { body: 'Great, welcome aboard' });
    expect((await outsider.client.get(`/api/v1/partnerships/${s.partnershipId}/messages`)).status).toBe(404);
    expect((await outsider.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { body: 'spam' })).status).toBe(404);
    const list = await s.creator.client.get(`/api/v1/partnerships/${s.partnershipId}/messages`);
    expect(list.body.data.items).toHaveLength(2);
    expect(list.body.data.items[0].mine).toBe(true);
    const rep = await s.creator.client.post(`/api/v1/messages/${m.body.data.id}/report`, { reason: 'inappropriate' });
    expect(rep.status).toBe(201);
    const admin = await registerAdmin(ctx, 'support_agent');
    expect((await admin.get('/api/v1/admin/moderation/message-reports')).body.data.length).toBeGreaterThan(0);
    await admin.post(`/api/v1/admin/moderation/messages/${m.body.data.id}`, { action: 'hide', note: 'violates policy' });
    const after = await s.creator.client.get(`/api/v1/partnerships/${s.partnershipId}/messages`);
    expect(after.body.data.items[1].body).toMatch(/removed by CODEK moderation/);
    expect((await ctx.prisma.message.findUniqueOrThrow({ where: { id: m.body.data.id } })).body).toBe('Great, welcome aboard');
  });

  it('rate limits message bursts and blocks messaging after the partnership ends', async () => {
    const s = await setupPartnership(ctx);
    await ctx.prisma.systemSetting.update({ where: { key: 'messaging.rate_limit_per_minute' }, data: { valueJson: { max: 3 } } });
    ctx.app.get(SettingsService).invalidate();
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await s.creator.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { body: `m${i}` })).status);
    expect(codes).toContain(429);
    await ctx.prisma.systemSetting.update({ where: { key: 'messaging.rate_limit_per_minute' }, data: { valueJson: { max: 20 } } });
    ctx.app.get(SettingsService).invalidate();
    await s.live.client.post(`/api/v1/partnerships/${s.partnershipId}/complete`, {});
    expect((await s.live.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { body: 'late' })).status).toBe(422);
  });
});

describe('uploads', () => {
  it('scans uploads with ClamAV when enabled: clean accepted, infected rejected and audited, scanner down fails closed', async () => {
    // Minimal clamd INSTREAM server: reads length-prefixed chunks until a zero-length chunk, flags the EICAR marker.
    const server = createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (c) => {
        buf = Buffer.concat([buf, c]);
        const cmd = buf.indexOf(0);
        if (cmd < 0) return;
        let off = cmd + 1;
        const body: Buffer[] = [];
        while (off + 4 <= buf.length) {
          const len = buf.readUInt32BE(off);
          if (len === 0) {
            const content = Buffer.concat(body).toString('latin1');
            sock.end(content.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
            return;
          }
          if (off + 4 + len > buf.length) return;
          body.push(buf.subarray(off + 4, off + 4 + len));
          off += 4 + len;
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const env = ctx.app.get<Env>(ENV);
    const saved = { MALWARE_SCANNER: env.MALWARE_SCANNER, CLAMAV_HOST: env.CLAMAV_HOST, CLAMAV_PORT: env.CLAMAV_PORT };
    Object.assign(env, { MALWARE_SCANNER: 'clamav', CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: (server.address() as AddressInfo).port });
    try {
      const s = await setupPartnership(ctx);
      expect((await upload(s.creator.client, 'message_attachment', PNG, 'image/png')).status).toBe(201);
      const infected = Buffer.concat([PNG, Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')]);
      const bad = await upload(s.creator.client, 'message_attachment', infected, 'image/png');
      expect(bad.status).toBe(400);
      expect(bad.body.error.message).toMatch(/security scan/);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'file.rejected_malware', reason: 'Eicar-Test-Signature' } })).toBeGreaterThan(0);
      await new Promise<void>((r) => server.close(() => r()));
      expect((await upload(s.creator.client, 'message_attachment', PNG, 'image/png')).status).toBe(503);
    } finally {
      Object.assign(env, saved);
      server.close();
    }
  });

  it('accepts sniffed images, rejects spoofed types and SVG, and enforces ownership on attach/download', async () => {
    const s = await setupPartnership(ctx);
    const ok = await upload(s.creator.client, 'message_attachment', PNG, 'image/png');
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const spoof = await upload(s.creator.client, 'message_attachment', Buffer.from('<script>alert(1)</script>'.padEnd(64, ' ')), 'image/png');
    expect(spoof.body.error.message).toMatch(/does not match/);
    const svg = await upload(s.creator.client, 'message_attachment', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(64, ' ')), 'image/svg+xml', 'x.svg');
    expect(svg.status).toBe(400);
    // Another user cannot attach my upload
    expect((await s.live.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { fileId: ok.body.data.id })).status).toBe(400);
    const msg = await s.creator.client.post(`/api/v1/partnerships/${s.partnershipId}/messages`, { fileId: ok.body.data.id });
    expect(msg.body.data.messageType).toBe('image');
    expect((await s.live.client.get(`/api/v1/files/${ok.body.data.id}/download`)).status).toBe(200);
    const outsider = await setupCreator(ctx);
    expect((await outsider.client.get(`/api/v1/files/${ok.body.data.id}/download`)).status).toBe(404);
  });
});

describe('deliverables & content rights', () => {
  it('submit → changes requested → resubmit → approved with timeline and notifications', async () => {
    const s = await setupPartnership(ctx);
    const list = await s.creator.client.get(`/api/v1/partnerships/${s.partnershipId}/deliverables`);
    expect(list.body.data.contentRights[0]).toMatchObject({ ownership: 'creator', organicAllowed: true, paidAdsAllowed: false, durationDays: 90 });
    const d = list.body.data.deliverables[0];
    expect(d.status).toBe('not_started');
    const outsider = await setupCreator(ctx);
    expect((await outsider.client.post(`/api/v1/deliverables/${d.id}/submissions`, { url: 'https://instagram.com/p/abc' })).status).toBe(404);
    const sub = await s.creator.client.post(`/api/v1/deliverables/${d.id}/submissions`, { url: 'https://instagram.com/p/abc', caption: '#ad' });
    expect(sub.status).toBe(201);
    expect((await s.creator.client.post(`/api/v1/submissions/${sub.body.data.id}/review`, { decision: 'approved' })).status).toBe(404);
    expect((await s.live.client.post(`/api/v1/submissions/${sub.body.data.id}/review`, { decision: 'changes_requested' })).status).toBe(400);
    const cr = await s.live.client.post(`/api/v1/submissions/${sub.body.data.id}/review`, { decision: 'changes_requested', note: 'Please add the disclosure in the first line' });
    expect(cr.body.data.status).toBe('changes_requested');
    const sub2 = await s.creator.client.post(`/api/v1/deliverables/${d.id}/submissions`, { url: 'https://instagram.com/p/def' });
    expect(sub2.body.data.status).toBe('resubmitted');
    const ok = await s.live.client.post(`/api/v1/submissions/${sub2.body.data.id}/review`, { decision: 'approved' });
    expect(ok.body.data.status).toBe('approved');
    expect((await s.live.client.post(`/api/v1/submissions/${sub2.body.data.id}/review`, { decision: 'approved' })).status).toBe(409);
    const events = await ctx.prisma.partnershipEvent.findMany({ where: { partnershipId: s.partnershipId } });
    expect(events.map((e) => e.eventType)).toEqual(expect.arrayContaining(['content_submitted', 'content_changes_requested', 'content_approved']));
    await outbox.dispatchBatch(500);
    const n = await s.creator.client.get('/api/v1/notifications?limit=100');
    expect(n.body.data.map((x: { type: string }) => x.type)).toContain('deliverable.reviewed');
  });
});
