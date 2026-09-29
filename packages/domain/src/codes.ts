import { randomInt } from 'node:crypto';
import { invariant } from './errors';

/**
 * Promotion code rules (spec §7.1): case-insensitive normalization, scoped uniqueness,
 * no reuse after expiry/revoke (enforced by the database: normalized codes are never freed).
 */
export const CODE_MIN_LENGTH = 4;
export const CODE_MAX_LENGTH = 32;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*[A-Z0-9]$/;
/** Unambiguous alphabet (no 0/O, 1/I/L) for generated suffixes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Normalize a code for comparison and uniqueness: NFKC, trim, uppercase (locale-invariant), collapse inner whitespace out. */
export function normalizeCode(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, '').toUpperCase();
}

export function isValidCode(normalized: string): boolean {
  return (
    normalized.length >= CODE_MIN_LENGTH && normalized.length <= CODE_MAX_LENGTH && CODE_PATTERN.test(normalized)
  );
}

export function assertValidCode(raw: string): string {
  const n = normalizeCode(raw);
  invariant(
    isValidCode(n),
    'VALIDATION_FAILED',
    `Codes must be ${CODE_MIN_LENGTH}-${CODE_MAX_LENGTH} characters: letters, digits, "-" or "_", starting and ending with a letter or digit`,
  );
  return n;
}

export function randomSuffix(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Build a candidate code from a creator handle, e.g. "SARA-7K2Q". Collisions are resolved by retrying with a new suffix. */
export function generateCodeCandidate(handle: string, suffixLength = 4): string {
  const prefix = normalizeCode(handle)
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  const candidate = prefix.length >= 2 ? `${prefix}-${randomSuffix(suffixLength)}` : `CDK-${randomSuffix(suffixLength + 2)}`;
  return normalizeCode(candidate);
}

/** Opaque URL-safe token for referral links. */
export function generateReferralToken(length = 10): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}
