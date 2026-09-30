import '../env-bootstrap';
import 'reflect-metadata';
import type { PrismaClient } from '@codek/database';
import { createApp } from '../app.factory';
import { AuditService } from '../audit/audit.service';
import { PRISMA } from '../prisma/prisma.service';

/**
 * Break-glass bootstrap of a platform administrator (there is deliberately no self-service path).
 * The person first signs up normally and verifies their email; an operator with database access then runs:
 *
 *   ADMIN_EMAIL=ops@example.com ADMIN_ROLE=platform_admin ADMIN_REASON="initial operator (ticket OPS-1)" \
 *     node dist/scripts/create-admin.js
 *
 * After the first administrator exists, further grants go through Admin → Users (dual approval). The account must
 * enable two-factor authentication before it can use the admin console in staging/production.
 */
export async function grantPlatformRole(prisma: PrismaClient, audit: AuditService, email: string, roleName: string, reason: string) {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role || role.scope !== 'platform') throw new Error(`Unknown platform role "${roleName}"`);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error('No account with that email. Sign up first, then run this script.');
  if (!user.emailVerified) throw new Error('The account email is not verified yet.');
  if (user.status !== 'active') throw new Error(`The account is ${user.status}.`);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { accountType: 'admin' } });
    await tx.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
    await audit.record({ actorType: 'system', action: 'admin.bootstrap_role_granted', objectType: 'user', objectId: user.id, after: { role: role.name }, reason }, tx);
  });
  return { userId: user.id, role: role.name };
}

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const roleName = process.env.ADMIN_ROLE ?? 'platform_admin';
  const reason = process.env.ADMIN_REASON;
  if (!email || !reason || reason.trim().length < 5) throw new Error('ADMIN_EMAIL and ADMIN_REASON (≥5 chars) are required');
  const app = await createApp();
  try {
    const r = await grantPlatformRole(app.get<PrismaClient>(PRISMA), app.get(AuditService), email, roleName, reason.trim());
    console.warn(`granted ${r.role} to user ${r.userId}`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
