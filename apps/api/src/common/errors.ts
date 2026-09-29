import { HttpStatus } from '@nestjs/common';

/** Machine-readable API error codes (spec §20.1). Documented in docs/API.md. */
export const ERROR_STATUS = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  MFA_REQUIRED: HttpStatus.FORBIDDEN,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  CSRF_REJECTED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  VERSION_CONFLICT: HttpStatus.CONFLICT,
  IDEMPOTENCY_KEY_REUSED: HttpStatus.UNPROCESSABLE_ENTITY,
  IDEMPOTENCY_KEY_REQUIRED: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_IN_PROGRESS: HttpStatus.CONFLICT,
  CURRENCY_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  UNSUPPORTED_CONFIGURATION: HttpStatus.UNPROCESSABLE_ENTITY,
  BUSINESS_RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  INSUFFICIENT_BALANCE: HttpStatus.UNPROCESSABLE_ENTITY,
  LEDGER_UNBALANCED: HttpStatus.INTERNAL_SERVER_ERROR,
  UNSAFE_URL: HttpStatus.BAD_REQUEST,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  WEBHOOK_SIGNATURE_INVALID: HttpStatus.UNAUTHORIZED,
  WEBHOOK_REPLAY_REJECTED: HttpStatus.UNAUTHORIZED,
  PROVIDER_ERROR: HttpStatus.BAD_GATEWAY,
  FEATURE_DISABLED: HttpStatus.FORBIDDEN,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly status: number = ERROR_STATUS[code],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (what = 'Resource'): ApiError => new ApiError('NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'You do not have permission to perform this action'): ApiError => new ApiError('FORBIDDEN', message);
export const ruleViolation = (message: string, details: Record<string, unknown> = {}): ApiError =>
  new ApiError('BUSINESS_RULE_VIOLATION', message, details);
