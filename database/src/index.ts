import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export { PrismaPg };

export interface CreatePrismaOptions {
  connectionString: string;
  /** Pool size for the pg adapter. */
  max?: number;
  log?: Array<'query' | 'info' | 'warn' | 'error'>;
}

/** Create a Prisma client backed by the node-postgres driver adapter (Prisma 7 architecture). */
export function createPrismaClient(opts: CreatePrismaOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString: opts.connectionString, max: opts.max ?? 10 });
  return new PrismaClient({ adapter, log: opts.log ?? ['warn', 'error'] });
}

export type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Postgres error helpers used by services to map DB invariant violations. */
export function isUniqueViolation(err: unknown, target?: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown; constraint?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } };
  if (e?.code !== 'P2002') return false;
  if (!target) return true;
  const serialized = JSON.stringify(e.meta ?? {});
  return serialized.includes(target);
}

export function isCheckViolation(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? '');
  return msg.includes('check constraint') || msg.includes('violates check') || msg.includes('CODEK_');
}

export { LEGAL_DOCUMENT_TYPES, seedReferenceData } from './seed/reference-data';
export { useTestDatabase, migrateTestDatabase, resetDatabase } from './test-support';
