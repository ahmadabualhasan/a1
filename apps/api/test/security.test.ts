import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OpenAPIObject } from '@nestjs/swagger';
import { buildOpenApi } from '../src/app.factory';
import type { Redis } from 'ioredis';
import { REDIS } from '../src/redis/redis.module';
import { Client, PASSWORD, registerUser, setupBusiness, startApp, type TestContext } from './harness';

let ctx: TestContext;
let doc: OpenAPIObject;
beforeAll(async () => {
  ctx = await startApp();
  doc = buildOpenApi(ctx.app);
});
afterAll(async () => ctx.app.close());

// ── RFC 6238 TOTP (SHA-1, 6 digits, 30 s), independent of the server implementation ──
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretBase32: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const code = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(code % 1_000_000).padStart(6, '0');
}

/** Operations that are intentionally reachable without a session (documented public surface). */
const PUBLIC = new Set([
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'GET /api/v1/auth/legal-requirements',
  'GET /api/v1/legal/documents',
  'GET /api/v1/legal/documents/{id}',
  'GET /api/v1/marketplace/campaigns',
  'GET /api/v1/campaigns/{id}',
  'GET /api/v1/pricing',
  'GET /r/{token}',
  'POST /api/v1/auth/sign-up',
  'POST /api/v1/auth/sign-in',
  'POST /api/v1/auth/sign-out',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/auth/resend-verification',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/auth/mfa/verify',
  'POST /api/v1/auth/mfa/verify-backup-code',
  'POST /api/v1/track/click',
  'POST /api/v1/webhooks/{provider}',
]);

const PARAM_VALUES: Record<string, string> = { provider: 'custom', token: 'unknown-token', type: 'application.submitted', key: 'payouts.enabled', planKey: 'default' };

function operations(): Array<{ method: string; path: string }> {
  const ops: Array<{ method: string; path: string }> = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) if ((item as Record<string, unknown>)[method]) ops.push({ method: method.toUpperCase(), path });
  }
  return ops;
}

function concrete(path: string, overrides: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => overrides[name] ?? PARAM_VALUES[name] ?? randomUUID());
}

async function call(c: Client, method: string, url: string) {
  switch (method) {
    case 'GET':
      return c.get(url);
    case 'POST':
      return c.post(url, {});
    case 'PUT':
      return c.put(url, {});
    case 'PATCH':
      return c.patch(url, {});
    default:
      return c.delete(url);
  }
}

describe('security', () => {
  it('the OpenAPI document covers a substantial API surface (sanity check for the sweeps below)', () => {
    expect(operations().length).toBeGreaterThan(150);
  });

  it('every non-public operation rejects anonymous requests with 401', async () => {
    const anon = new Client(ctx);
    const failures: string[] = [];
    let checked = 0;
    for (const op of operations()) {
      if (PUBLIC.has(`${op.method} ${op.path}`)) continue;
      checked++;
      const res = await call(anon, op.method, concrete(op.path));
      if (res.status !== 401) failures.push(`${op.method} ${op.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(150);
  });

  it("business-scoped operations never succeed against another tenant's business", async () => {
    const a = await setupBusiness(ctx);
    const b = await setupBusiness(ctx);
    const failures: string[] = [];
    let checked = 0;
    for (const op of operations()) {
      if (!op.path.includes('{businessId}') && !/^\/api\/v1\/businesses\/\{id\}/.test(op.path)) continue;
      checked++;
      const url = concrete(op.path, { businessId: b.businessId, id: b.businessId });
      const res = await call(a.client, op.method, url);
      if (res.status < 400 || ![400, 403, 404].includes(res.status)) failures.push(`${op.method} ${op.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(25);
    expect((await a.client.get(`/api/v1/integrations?businessId=${b.businessId}`)).status).toBe(404);
    // Sanity: the same routes work for the owner.
    expect((await b.client.get(`/api/v1/businesses/${b.businessId}/campaigns`)).status).toBe(200);
  });

  it('admin operations are forbidden to non-admin accounts', async () => {
    const creator = await registerUser(ctx, 'creator');
    const business = await setupBusiness(ctx);
    const failures: string[] = [];
    let checked = 0;
    for (const op of operations()) {
      if (!op.path.startsWith('/api/v1/admin/')) continue;
      checked++;
      for (const [who, c] of [['creator', creator], ['business', business.client]] as const) {
        const res = await call(c, op.method, concrete(op.path));
        if (res.status !== 403) failures.push(`${who}: ${op.method} ${op.path} → ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  });

  it('MFA: setup is confirmed with a TOTP, sign-in then requires a valid second factor, backup codes are single-use', async () => {
    const email = `mfa-${randomUUID().slice(0, 8)}@example.com`;
    const c = await registerUser(ctx, 'creator', email);
    expect((await c.post('/api/v1/auth/mfa/enable', { password: 'wrong-password-123' })).status).toBe(400);
    const en = await c.post('/api/v1/auth/mfa/enable', { password: PASSWORD });
    expect(en.status).toBe(200);
    const secret = new URL(en.body.data.totpURI as string).searchParams.get('secret')!;
    const backupCodes = en.body.data.backupCodes as string[];
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(backupCodes.length).toBeGreaterThan(0);
    expect((await c.post('/api/v1/auth/mfa/verify', { code: totp(secret) })).status).toBe(200);
    expect((await c.get('/api/v1/auth/session')).body.data.user.twoFactorEnabled).toBe(true);

    // Password alone no longer yields a session.
    const fresh = new Client(ctx);
    const si = await fresh.post('/api/v1/auth/sign-in', { email, password: PASSWORD });
    expect(si.body.data.status).toBe('mfa_required');
    expect((await fresh.get('/api/v1/auth/session')).status).toBe(401);
    const wrong = totp(secret) === '000000' ? '111111' : '000000';
    expect((await fresh.post('/api/v1/auth/mfa/verify', { code: wrong })).status).toBe(400);
    expect((await fresh.get('/api/v1/auth/session')).status).toBe(401);
    expect((await fresh.post('/api/v1/auth/mfa/verify', { code: totp(secret) })).status).toBe(200);
    expect((await fresh.get('/api/v1/auth/session')).status).toBe(200);

    // Backup code works once.
    const b1 = new Client(ctx);
    expect((await b1.post('/api/v1/auth/sign-in', { email, password: PASSWORD })).body.data.status).toBe('mfa_required');
    expect((await b1.post('/api/v1/auth/mfa/verify-backup-code', { code: backupCodes[0] })).status).toBe(200);
    expect((await b1.get('/api/v1/auth/session')).status).toBe(200);
    const b2 = new Client(ctx);
    await b2.post('/api/v1/auth/sign-in', { email, password: PASSWORD });
    expect((await b2.post('/api/v1/auth/mfa/verify-backup-code', { code: backupCodes[0] })).status).toBe(400);
    expect((await b2.get('/api/v1/auth/session')).status).toBe(401);
  });

  it('during a Redis outage credential endpoints fail closed while ordinary traffic stays available', async () => {
    const redis = ctx.app.get<Redis>(REDIS);
    const spy = vi.spyOn(redis, 'multi').mockImplementation(() => {
      throw new Error('ECONNREFUSED');
    });
    try {
      const signIn = await new Client(ctx).post('/api/v1/auth/sign-in', { email: 'x@example.com', password: 'whatever-password-1' });
      expect(signIn.status).toBe(503);
      expect(signIn.headers['retry-after']).toBe('30');
      expect((await new Client(ctx).post('/api/v1/auth/mfa/verify-backup-code', { code: 'abcd-efgh' })).status).toBe(503);
      expect((await new Client(ctx).get('/api/v1/pricing')).status).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });

  it('responses carry security headers and never leak stack traces', async () => {
    const res = await ctx.http().get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const bad = await new Client(ctx).post('/api/v1/auth/sign-in', { email: 'not-an-email', password: 1 });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
    expect(bad.body.error.requestId).toBeTruthy();
  });
});
