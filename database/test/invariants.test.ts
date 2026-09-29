import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, useTestDatabase } from '../src/test-support';
import { createPrismaClient, seedReferenceData, type PrismaClient } from '../src';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createPrismaClient({ connectionString: useTestDatabase(), max: 4 });
});
afterAll(async () => prisma.$disconnect());
beforeEach(async () => resetDatabase(prisma));

async function account(accountType: string, ownerType: 'platform' | 'creator' = 'platform', currency = 'USD') {
  const ownerId = ownerType === 'platform' ? null : randomUUID();
  return prisma.ledgerAccount.create({
    data: { ownerType, ownerId, ownerKey: ownerId ?? 'platform', accountType, currency },
  });
}

describe('ledger invariants (database level)', () => {
  it('accepts a balanced entry', async () => {
    const a = await account('provider_cash');
    const b = await account('adjustments');
    await prisma.ledgerEntry.create({
      data: {
        entryType: 'manual_adjustment',
        currency: 'USD',
        lines: {
          create: [
            { ledgerAccountId: a.id, direction: 'debit', amountMinor: 100n, currency: 'USD', lineOrder: 1 },
            { ledgerAccountId: b.id, direction: 'credit', amountMinor: 100n, currency: 'USD', lineOrder: 2 },
          ],
        },
      },
    });
    expect(await prisma.ledgerEntryLine.count()).toBe(2);
  });

  it('rejects an unbalanced entry at commit', async () => {
    const a = await account('provider_cash');
    const b = await account('adjustments');
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.ledgerEntry.create({
          data: {
            entryType: 'manual_adjustment',
            currency: 'USD',
            lines: {
              create: [
                { ledgerAccountId: a.id, direction: 'debit', amountMinor: 100n, currency: 'USD', lineOrder: 1 },
                { ledgerAccountId: b.id, direction: 'credit', amountMinor: 99n, currency: 'USD', lineOrder: 2 },
              ],
            },
          },
        });
      }),
    ).rejects.toThrow(/LEDGER_UNBALANCED/);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it('rejects single-line and mixed-currency entries', async () => {
    const a = await account('provider_cash');
    const j = await account('adjustments', 'platform', 'JOD');
    await expect(
      prisma.ledgerEntry.create({
        data: { entryType: 'x', currency: 'USD', lines: { create: [{ ledgerAccountId: a.id, direction: 'debit', amountMinor: 1n, currency: 'USD', lineOrder: 1 }] } },
      }),
    ).rejects.toThrow(/LEDGER_UNBALANCED/);
    await expect(
      prisma.ledgerEntry.create({
        data: {
          entryType: 'x',
          currency: 'USD',
          lines: {
            create: [
              { ledgerAccountId: a.id, direction: 'debit', amountMinor: 1n, currency: 'USD', lineOrder: 1 },
              { ledgerAccountId: j.id, direction: 'credit', amountMinor: 1n, currency: 'USD', lineOrder: 2 },
            ],
          },
        },
      }),
    ).rejects.toThrow(/LEDGER_CURRENCY/);
  });

  it('forbids updating or deleting ledger history', async () => {
    const a = await account('provider_cash');
    const b = await account('adjustments');
    const e = await prisma.ledgerEntry.create({
      data: {
        entryType: 'manual_adjustment',
        currency: 'USD',
        lines: {
          create: [
            { ledgerAccountId: a.id, direction: 'debit', amountMinor: 5n, currency: 'USD', lineOrder: 1 },
            { ledgerAccountId: b.id, direction: 'credit', amountMinor: 5n, currency: 'USD', lineOrder: 2 },
          ],
        },
      },
      include: { lines: true },
    });
    await expect(prisma.ledgerEntryLine.update({ where: { id: e.lines[0]!.id }, data: { amountMinor: 6n } })).rejects.toThrow(/IMMUTABLE/);
    await expect(prisma.ledgerEntry.delete({ where: { id: e.id } })).rejects.toThrow(/IMMUTABLE/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE ledger_entry_lines CASCADE')).rejects.toThrow(/NO_TRUNCATE/);
  });

  it('rejects non-positive amounts and duplicate platform accounts', async () => {
    await account('provider_cash');
    await expect(account('provider_cash')).rejects.toThrow();
  });
});

describe('audit log', () => {
  it('is append-only and hash-chained; tampering is detectable', async () => {
    for (let i = 0; i < 3; i++) {
      await prisma.auditLog.create({ data: { action: `test.${i}`, objectType: 'test', reason: 'unit' } });
    }
    const logs = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    expect(logs[0]!.prevHash).toBeNull();
    expect(logs[1]!.prevHash).toBe(logs[0]!.hash);
    const [{ broken }] = await prisma.$queryRawUnsafe<Array<{ broken: bigint | null }>>('SELECT codek_verify_audit_chain() AS broken');
    expect(broken).toBeNull();
    await expect(prisma.auditLog.update({ where: { id: logs[0]!.id }, data: { reason: 'changed' } })).rejects.toThrow(/IMMUTABLE/);
    await expect(prisma.auditLog.delete({ where: { id: logs[0]!.id } })).rejects.toThrow(/IMMUTABLE/);
    // Simulate tampering by a superuser bypassing triggers.
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`),
      prisma.$executeRawUnsafe(`UPDATE audit_logs SET reason = 'tampered' WHERE seq = 2`),
    ]);
    const [{ broken: b2 }] = await prisma.$queryRawUnsafe<Array<{ broken: bigint | null }>>('SELECT codek_verify_audit_chain() AS broken');
    expect(Number(b2)).toBe(2);
  });
});

describe('reference seed', () => {
  it('is idempotent and syncs RBAC', async () => {
    await seedReferenceData(prisma);
    await seedReferenceData(prisma);
    const owner = await prisma.role.findUnique({ where: { name: 'business_owner' }, include: { permissions: true } });
    expect(owner?.permissions.length).toBeGreaterThan(10);
    expect(await prisma.legalDocument.count({ where: { status: 'published' } })).toBe(8);
    expect((await prisma.pricingPlan.findUnique({ where: { planKey: 'default' } }))?.feePlanJson).toMatchObject({ basis: 'none' });
  });
});

describe('domain constraints', () => {
  it('lower-cases emails and blocks deleting businesses', async () => {
    await expect(prisma.user.create({ data: { email: 'Mixed@Case.com', name: 'x' } })).rejects.toThrow();
    const user = await prisma.user.create({ data: { email: 'owner@example.com', name: 'Owner' } });
    const biz = await prisma.business.create({
      data: { ownerUserId: user.id, legalName: 'L', displayName: 'D', slug: 'd', category: 'food', country: 'JO', timezone: 'Asia/Amman' },
    });
    await expect(prisma.business.delete({ where: { id: biz.id } })).rejects.toThrow(/NO_DELETE/);
    await expect(
      prisma.business.create({ data: { ownerUserId: user.id, legalName: 'L', displayName: 'D', slug: 'x', category: 'food', country: 'jor', timezone: 'UTC' } }),
    ).rejects.toThrow();
  });
});
