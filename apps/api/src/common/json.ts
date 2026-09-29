import { Decimal } from 'decimal.js';

/**
 * Serialize API payloads: bigint minor units become JSON numbers when safe (they always are for realistic money),
 * otherwise strings; Prisma Decimals become decimal strings (never floats).
 */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Decimal.isDecimal(value) || (value as { constructor?: { name?: string } }).constructor?.name === 'Decimal') {
    return (value as { toString(): string }).toString();
  }
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(toJsonSafe);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toJsonSafe(v);
  return out;
}
