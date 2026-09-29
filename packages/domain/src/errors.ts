/**
 * Machine-readable domain error. The API layer maps these to the standard error envelope.
 * `message` must be safe to show to end users (no secrets, no internal identifiers beyond what the caller supplied).
 */
export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_STATE_TRANSITION'
  | 'CURRENCY_MISMATCH'
  | 'UNSUPPORTED_CONFIGURATION'
  | 'LEDGER_UNBALANCED'
  | 'INSUFFICIENT_BALANCE'
  | 'UNSAFE_URL'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function invariant(condition: unknown, code: DomainErrorCode, message: string, details?: Record<string, unknown>): asserts condition {
  if (!condition) throw new DomainError(code, message, details);
}
