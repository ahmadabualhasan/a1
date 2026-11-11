import path from 'node:path';
import { config } from 'dotenv';
import IORedis from 'ioredis';
import { createPrismaClient, migrateTestDatabase, resetDatabase, seedReferenceData, useTestDatabase } from '@codek/database';

export default async function setup(): Promise<void> {
  config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
  const url = useTestDatabase();
  migrateTestDatabase(url);
  const prisma = createPrismaClient({ connectionString: url, max: 2 });
  await resetDatabase(prisma);
  await seedReferenceData(prisma);
  // Test baseline: the suite's hand-computed ledger numbers assume no platform fee and no payout minimum. The seeded
  // production defaults (D-003 10% fee, D-017 minimum payout) are exercised end-to-end in defaults.test.ts.
  await prisma.pricingPlan.update({ where: { planKey: 'default' }, data: { feePlanJson: { planKey: 'default', basis: 'none', rate: null, roundingMode: 'half_up' } } });
  await prisma.systemSetting.update({ where: { key: 'payouts.minimum_minor' }, data: { valueJson: { default: 0 } } });
  await prisma.$disconnect();
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const keys = await redis.keys('codek-test:*');
  if (keys.length) await redis.del(...keys);
  await redis.quit();
}
