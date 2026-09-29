import Decimal from 'decimal.js';
import { DomainError, invariant } from './errors';

/**
 * Money is always represented as an integer number of minor units (bigint) plus an ISO-4217 currency.
 * Floating point is never used for monetary amounts. Rates use decimal.js.
 */
export type CurrencyCode = string;

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

export type RoundingMode = 'half_up' | 'half_even' | 'floor' | 'ceil';

/** Minor-unit exponents for currencies that differ from the default of 2. */
const CURRENCY_EXPONENTS: Record<string, number> = {
  JOD: 3,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  TND: 3,
  IQD: 3,
  LYD: 3,
  JPY: 0,
  KRW: 0,
  CLP: 0,
  VND: 0,
  ISK: 0,
  UGX: 0,
  XAF: 0,
  XOF: 0,
};

/** Currencies accepted by the platform. Extending this list is a controlled configuration change. */
export const SUPPORTED_CURRENCIES = ['JOD', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP'] as const;

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

export function assertSupportedCurrency(currency: string): asserts currency is CurrencyCode {
  invariant(isCurrencyCode(currency), 'VALIDATION_FAILED', 'Currency must be an ISO-4217 code', { currency });
  invariant(
    (SUPPORTED_CURRENCIES as readonly string[]).includes(currency),
    'VALIDATION_FAILED',
    'Currency is not supported',
    { currency },
  );
}

export function currencyExponent(currency: CurrencyCode): number {
  return CURRENCY_EXPONENTS[currency] ?? 2;
}

export function money(amountMinor: bigint | number, currency: CurrencyCode): Money {
  const amount = typeof amountMinor === 'number' ? toBigIntStrict(amountMinor) : amountMinor;
  invariant(isCurrencyCode(currency), 'VALIDATION_FAILED', 'Invalid currency code', { currency });
  return { amountMinor: amount, currency };
}

export function toBigIntStrict(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError('VALIDATION_FAILED', 'Money amounts must be safe integers in minor units', { value });
  }
  return BigInt(value);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new DomainError('CURRENCY_MISMATCH', 'Currency mismatch', { left: a.currency, right: b.currency });
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

const DECIMAL_ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  half_up: Decimal.ROUND_HALF_UP,
  half_even: Decimal.ROUND_HALF_EVEN,
  floor: Decimal.ROUND_FLOOR,
  ceil: Decimal.ROUND_CEIL,
};

/** A decimal-safe clone of Decimal with enough precision for financial multiplication. */
export const FinDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Multiply an integer minor-unit amount by a decimal rate and round to an integer minor unit.
 * `rate` is a string/Decimal to avoid binary float drift (e.g. "0.125" for 12.5%).
 */
export function multiplyRate(amountMinor: bigint, rate: string | Decimal, mode: RoundingMode): bigint {
  const r = new FinDecimal(rate.toString());
  invariant(r.isFinite(), 'VALIDATION_FAILED', 'Rate must be finite');
  const product = new FinDecimal(amountMinor.toString()).mul(r);
  return BigInt(product.toDecimalPlaces(0, DECIMAL_ROUNDING[mode]).toFixed(0));
}

/** Compute round(amount * numerator / denominator) with the given rounding mode, fully in integer/decimal space. */
export function prorate(amountMinor: bigint, numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  invariant(denominator !== 0n, 'VALIDATION_FAILED', 'Cannot prorate with a zero denominator');
  const q = new FinDecimal(amountMinor.toString()).mul(numerator.toString()).div(denominator.toString());
  return BigInt(q.toDecimalPlaces(0, DECIMAL_ROUNDING[mode]).toFixed(0));
}

export function roundDecimal(value: Decimal, mode: RoundingMode): bigint {
  return BigInt(new FinDecimal(value).toDecimalPlaces(0, DECIMAL_ROUNDING[mode]).toFixed(0));
}

/** Parse a user-facing decimal string ("12.50") into minor units for a currency without using floats. */
export function parseMajorToMinor(value: string, currency: CurrencyCode): bigint {
  invariant(/^-?\d+(\.\d+)?$/.test(value), 'VALIDATION_FAILED', 'Invalid decimal amount', { value });
  const exp = currencyExponent(currency);
  const d = new FinDecimal(value);
  invariant(d.decimalPlaces() <= exp, 'VALIDATION_FAILED', 'Too many decimal places for currency', { value, currency });
  return BigInt(d.mul(new FinDecimal(10).pow(exp)).toFixed(0));
}

/** Format minor units as a plain major-unit decimal string (display only). */
export function formatMinor(amountMinor: bigint, currency: CurrencyCode): string {
  const exp = currencyExponent(currency);
  const d = new FinDecimal(amountMinor.toString()).div(new FinDecimal(10).pow(exp));
  return d.toFixed(exp);
}

/** Validate a decimal rate string in [0, 1]. Rates are fractions: 0.1 = 10%. */
export function assertRate(rate: string): void {
  invariant(/^\d+(\.\d{1,6})?$/.test(rate), 'VALIDATION_FAILED', 'Rate must be a decimal with at most 6 places', { rate });
  const d = new FinDecimal(rate);
  invariant(d.gte(0) && d.lte(1), 'VALIDATION_FAILED', 'Rate must be between 0 and 1', { rate });
}
