import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';
import type { PrismaClient } from './generated/prisma/client';

const ROOT = path.resolve(__dirname, '../..');

/** Load the repo .env and point DATABASE_URL at the dedicated test database. Refuses non-test databases. */
export function useTestDatabase(): string {
  config({ path: path.join(ROOT, '.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests');
  const dbName = new URL(url).pathname.replace('/', '');
  if (!/test|e2e|ci/i.test(dbName)) {
    throw new Error(`Refusing to run destructive tests against database "${dbName}" (name must contain test/e2e/ci)`);
  }
  process.env.DATABASE_URL = url;
  process.env.APP_ENV = process.env.APP_ENV === 'production' ? 'test' : (process.env.APP_ENV ?? 'test');
  return url;
}

/** Apply all migrations to the test database (idempotent). */
export function migrateTestDatabase(url: string): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.join(ROOT, 'database'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

/** Truncate every application table (explicit opt-in bypasses the production TRUNCATE guard). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL codek.allow_truncate = 'on'`),
    prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`),
  ]);
}
