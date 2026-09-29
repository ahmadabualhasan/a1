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
  await prisma.$disconnect();
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const keys = await redis.keys('codek-test:*');
  if (keys.length) await redis.del(...keys);
  await redis.quit();
}
