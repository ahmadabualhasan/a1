import path from 'node:path';
import { config } from 'dotenv';
import { createPrismaClient } from '../index';
import { seedReferenceData } from './reference-data';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const appEnv = process.env.APP_ENV ?? 'development';
  const environment = appEnv === 'production' ? 'production' : appEnv === 'staging' ? 'staging' : 'dev';
  const prisma = createPrismaClient({ connectionString: url, max: 2 });
  try {
    await seedReferenceData(prisma, { environment });
    console.warn(`[seed] reference data applied (environment=${environment})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
