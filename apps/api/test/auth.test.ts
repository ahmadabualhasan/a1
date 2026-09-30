import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetricsService } from '../src/observability/metrics.service';
import { Client, legalIds, PASSWORD, registerUser, startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

describe('auth', () => {
  it('health endpoints', async () => {
    expect((await ctx.http().get('/api/v1/health/live')).body).toEqual({ status: 'ok' });
    const ready = await ctx.http().get('/api/v1/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('requires legal acceptance at sign-up', async () => {
    const c = new Client(ctx);
    const r = await c.post('/api/v1/auth/sign-up', { role: 'creator', email: 'x1@example.com', password: PASSWORD, displayName: 'X', acceptedLegalDocumentIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(r.body.error.requestId).toBeTruthy();
  });

  it('validates input with machine-readable errors', async () => {
    const r = await new Client(ctx).post('/api/v1/auth/sign-up', { role: 'hacker', email: 'nope', password: 'short' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(r.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('sign-up → unverified sign-in blocked → verify → sign-in → session → sign-out', async () => {
    const email = 'flow@example.com';
    const c = new Client(ctx);
    const su = await c.post('/api/v1/auth/sign-up', { role: 'creator', email, password: PASSWORD, displayName: 'Flow', acceptedLegalDocumentIds: await legalIds(ctx, 'creator') });
    expect(su.status).toBe(201);
    expect(su.body.data.status).toBe('verification_required');
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email }, include: { legalAcceptances: true } });
    expect(user.accountType).toBe('creator');
    expect(user.legalAcceptances.length).toBeGreaterThanOrEqual(4);

    const blocked = await c.post('/api/v1/auth/sign-in', { email, password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const token = new URL(ctx.email.lastTo(email, 'auth.verify_email')!.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
    expect((await c.post('/api/v1/auth/verify-email', { token })).status).toBe(200);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();

    const wrong = await c.post('/api/v1/auth/sign-in', { email, password: 'wrong-password-123' });
    expect(wrong.status).toBe(401);
    const si = await c.post('/api/v1/auth/sign-in', { email, password: PASSWORD });
    expect(si.status).toBe(200);
    const cookie = (si.headers['set-cookie'] as unknown as string[]).find((x) => x.includes('session_token'))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const s = await c.get('/api/v1/auth/session');
    expect(s.status).toBe(200);
    expect(s.body.data.user.email).toBe(email);
    expect(s.body.data.creatorPermissions).toContain('creator.marketplace.use');

    const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.ipAddress).toBeFalsy();
    expect(session.ipHash).toMatch(/^[a-f0-9]{64}$/);

    expect((await c.post('/api/v1/auth/sign-out')).status).toBe(200);
    expect((await c.get('/api/v1/auth/session')).status).toBe(401);
  });

  it('does not reveal whether an email is registered', async () => {
    const c = await registerUser(ctx, 'business', 'dupe@example.com');
    expect(c).toBeTruthy();
    const again = await new Client(ctx).post('/api/v1/auth/sign-up', { role: 'business', email: 'dupe@example.com', password: PASSWORD, displayName: 'Dupe', acceptedLegalDocumentIds: await legalIds(ctx, 'business') });
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.data.status).toBe('verification_required');
    expect(ctx.email.lastTo('dupe@example.com', 'auth.sign_up_existing')).toBeTruthy();
  });

  it('password reset flow revokes old password', async () => {
    const email = 'reset@example.com';
    await registerUser(ctx, 'creator', email);
    expect((await new Client(ctx).post('/api/v1/auth/forgot-password', { email })).status).toBe(200);
    expect((await new Client(ctx).post('/api/v1/auth/forgot-password', { email: 'nobody@example.com' })).status).toBe(200);
    const token = new URL(ctx.email.lastTo(email, 'auth.reset_password')!.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
    const newPassword = 'another-strong-pass-7';
    expect((await new Client(ctx).post('/api/v1/auth/reset-password', { token, newPassword })).status).toBe(200);
    expect((await new Client(ctx).post('/api/v1/auth/reset-password', { token, newPassword })).status).toBe(400);
    expect((await new Client(ctx).post('/api/v1/auth/sign-in', { email, password: PASSWORD })).status).toBe(401);
    expect((await new Client(ctx).post('/api/v1/auth/sign-in', { email, password: newPassword })).status).toBe(200);
  });

  it('rejects cross-origin state-changing requests carrying a session cookie (CSRF)', async () => {
    const c = await registerUser(ctx, 'creator');
    const r = await ctx.http().post('/api/v1/auth/sessions/revoke-others').set('Cookie', c.cookies.join('; ')).set('Origin', 'https://evil.example');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF_REJECTED');
    const noOrigin = await ctx.http().post('/api/v1/auth/sessions/revoke-others').set('Cookie', c.cookies.join('; '));
    expect(noOrigin.status).toBe(403);
  });

  it('sign-up fails closed while a required legal document is unpublished', async () => {
    const tos = await ctx.prisma.legalDocument.findFirstOrThrow({ where: { documentType: 'terms_of_service', status: 'published' } });
    await ctx.prisma.legalDocument.update({ where: { id: tos.id }, data: { status: 'draft' } });
    try {
      const c = new Client(ctx);
      const r = await c.post('/api/v1/auth/sign-up', { role: 'creator', email: `closed-${Date.now()}@example.com`, password: PASSWORD, displayName: 'Closed', acceptedLegalDocumentIds: await legalIds(ctx, 'creator') });
      expect(r.body.error.code).toBe('FEATURE_DISABLED');
      expect(r.body.error.details.reason).toBe('LEGAL_DOCUMENTS_NOT_PUBLISHED');
    } finally {
      await ctx.prisma.legalDocument.update({ where: { id: tos.id }, data: { status: 'published' } });
    }
  });

  it('failed sign-ins are counted for alerting', async () => {
    const counter = ctx.app.get(MetricsService).authFailures;
    const before = (await counter.get()).values[0]?.value ?? 0;
    await new Client(ctx).post('/api/v1/auth/sign-in', { email: 'nobody@example.com', password: 'wrong-password-123' });
    expect((await counter.get()).values[0]?.value).toBe(before + 1);
  });

  it('rate limits sign-in attempts', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const r = await ctx.http().post('/api/v1/auth/sign-in').set('X-Forwarded-For', '203.0.113.9').send({ email: 'rl@example.com', password: 'whatever-123' });
      last = r.status;
      if (r.status === 429) {
        expect(r.body.error.code).toBe('RATE_LIMITED');
        expect(r.headers['retry-after']).toBeTruthy();
        break;
      }
    }
    expect(last).toBe(429);
  });

  it('unknown routes and unauthenticated access use the error envelope', async () => {
    const r = await ctx.http().get('/api/v1/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    const s = await ctx.http().get('/api/v1/auth/session');
    expect(s.status).toBe(401);
    expect(s.body.error.code).toBe('UNAUTHENTICATED');
  });
});
