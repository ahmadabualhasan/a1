import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Keyed pseudonymous hash for IPs, user agents and customer references (spec §14.2 minimization). */
export function pseudonymize(value: string, pepper: string): string {
  return createHmac('sha256', pepper).update(value).digest('hex');
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string | Buffer, payload: string | Buffer, encoding: 'hex' | 'base64' = 'hex'): string {
  return createHmac('sha256', secret).update(payload).digest(encoding);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Stable JSON serialization (sorted keys) used for snapshot hashing. BigInts are serialized as strings. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? JSON.stringify(value.toString()) : JSON.stringify(value) ?? 'null';
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
