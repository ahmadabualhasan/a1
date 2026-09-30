import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { grantPlatformRole } from '../src/scripts/create-admin';
import { registerUser, startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

describe('admin bootstrap script', () => {
  it('grants a platform role to a verified account, audits it, and refuses unknown or unverified accounts', async () => {
    const email = `ops-${Date.now()}@example.com`;
    const c = await registerUser(ctx, 'creator', email);
    const audit = ctx.app.get(AuditService);
    await expect(grantPlatformRole(ctx.prisma, audit, 'missing@example.com', 'platform_admin', 'bootstrap')).rejects.toThrow(/No account/);
    await expect(grantPlatformRole(ctx.prisma, audit, email, 'business_owner', 'bootstrap')).rejects.toThrow(/platform role/);
    const r = await grantPlatformRole(ctx.prisma, audit, email, 'platform_admin', 'initial operator');
    expect(r.role).toBe('platform_admin');
    expect((await c.get('/api/v1/admin/overview')).status).toBe(200);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'admin.bootstrap_role_granted', objectId: r.userId } })).toBe(1);
    await ctx.prisma.user.update({ where: { id: r.userId }, data: { emailVerified: false } });
    await expect(grantPlatformRole(ctx.prisma, audit, email, 'support_agent', 'x-reason')).rejects.toThrow(/not verified/);
  });
});
