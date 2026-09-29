import { DomainError, invariant } from './errors';
import { assertRate, maxBig, multiplyRate, prorate, type RoundingMode } from './money';

/**
 * CODEK commission engine (spec §8). Pure, deterministic, server-side only.
 *
 * Amount semantics of a normalized conversion (documented in docs/DECISIONS.md, D-004):
 *  - grossMinor      merchandise/service subtotal BEFORE discounts, EXCLUDING tax and shipping
 *  - discountMinor   total customer discount applied to the subtotal
 *  - taxMinor        tax charged to the customer
 *  - shippingMinor   shipping/delivery fee charged to the customer
 *  - otherFeeMinor   other fees deducted to reach "net" (e.g. marketplace/service fees), if the source reports them
 *  - netMinor        source-reported net amount; when absent, net = gross - discount - otherFee
 *
 * Commission base by base_type:
 *  - gross       → grossMinor
 *  - discounted  → grossMinor - discountMinor
 *  - net         → netMinor (or derived)
 *  - custom      → not supported in V1 (DECISION NEEDED D-005); rejected
 * then + taxMinor if include_tax, + shippingMinor if include_shipping.
 */
export type CommissionType = 'percentage' | 'fixed' | 'hybrid';
export type CommissionBaseType = 'gross' | 'discounted' | 'net' | 'custom';
export type RefundBehavior = 'clawback' | 'reverse' | 'none';

export interface CommissionRuleSnapshot {
  ruleId: string;
  version: number;
  type: CommissionType;
  /** Fraction as decimal string: "0.15" = 15%. Required for percentage. */
  rate?: string | null;
  /** Required for fixed. */
  fixedMinor?: bigint | null;
  baseType: CommissionBaseType;
  includeTax: boolean;
  includeShipping: boolean;
  excludedItems?: ExcludedItems | null;
  minMinor?: bigint | null;
  maxMinor?: bigint | null;
  /** Required for fixed rules and for caps/floors. When set, conversions must be in this currency. */
  currency?: string | null;
  roundingMode: RoundingMode;
  refundBehavior: RefundBehavior;
}

export interface ExcludedItems {
  skus?: string[];
  categories?: string[];
  productIds?: string[];
}

export interface ConversionLineItem {
  sku?: string | null;
  productId?: string | null;
  category?: string | null;
  quantity: number;
  grossMinor: bigint;
  discountMinor?: bigint | null;
}

export interface ConversionAmounts {
  currency: string;
  grossMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  shippingMinor: bigint;
  otherFeeMinor: bigint;
  netMinor?: bigint | null;
  lineItems?: ConversionLineItem[] | null;
}

export interface CommissionResult {
  baseMinor: bigint;
  commissionMinor: bigint;
  currency: string;
  trace: Record<string, string | number | boolean | null>;
}

export function validateCommissionRule(rule: CommissionRuleSnapshot): void {
  if (rule.type === 'hybrid') {
    throw new DomainError('UNSUPPORTED_CONFIGURATION', 'Hybrid commission rules are planned for a later version');
  }
  if (rule.baseType === 'custom') {
    throw new DomainError('UNSUPPORTED_CONFIGURATION', 'Custom commission bases are not supported yet');
  }
  if (rule.type === 'percentage') {
    invariant(rule.rate != null, 'VALIDATION_FAILED', 'Percentage commission requires a rate');
    assertRate(rule.rate);
  }
  if (rule.type === 'fixed') {
    invariant(rule.fixedMinor != null && rule.fixedMinor > 0n, 'VALIDATION_FAILED', 'Fixed commission requires a positive amount');
    invariant(!!rule.currency, 'VALIDATION_FAILED', 'Fixed commission requires a currency');
  }
  if (rule.minMinor != null || rule.maxMinor != null) {
    invariant(!!rule.currency, 'VALIDATION_FAILED', 'Commission caps/floors require a currency');
  }
  if (rule.minMinor != null) invariant(rule.minMinor >= 0n, 'VALIDATION_FAILED', 'Minimum commission cannot be negative');
  if (rule.maxMinor != null) invariant(rule.maxMinor >= 0n, 'VALIDATION_FAILED', 'Maximum commission cannot be negative');
  if (rule.minMinor != null && rule.maxMinor != null) {
    invariant(rule.minMinor <= rule.maxMinor, 'VALIDATION_FAILED', 'Minimum commission cannot exceed maximum');
  }
}

export function validateAmounts(a: ConversionAmounts): void {
  for (const [k, v] of Object.entries({
    grossMinor: a.grossMinor,
    discountMinor: a.discountMinor,
    taxMinor: a.taxMinor,
    shippingMinor: a.shippingMinor,
    otherFeeMinor: a.otherFeeMinor,
  })) {
    invariant(v >= 0n, 'VALIDATION_FAILED', `${k} cannot be negative`);
  }
  invariant(a.discountMinor <= a.grossMinor, 'VALIDATION_FAILED', 'Discount cannot exceed gross amount');
  if (a.netMinor != null) invariant(a.netMinor >= 0n, 'VALIDATION_FAILED', 'netMinor cannot be negative');
}

function isExcluded(item: ConversionLineItem, ex: ExcludedItems): boolean {
  return (
    (!!item.sku && !!ex.skus?.includes(item.sku)) ||
    (!!item.productId && !!ex.productIds?.includes(item.productId)) ||
    (!!item.category && !!ex.categories?.includes(item.category))
  );
}

function hasExclusions(ex?: ExcludedItems | null): ex is ExcludedItems {
  return !!ex && ((ex.skus?.length ?? 0) + (ex.categories?.length ?? 0) + (ex.productIds?.length ?? 0) > 0);
}

/** Compute the commission base (before rate application). */
export function computeBase(rule: CommissionRuleSnapshot, a: ConversionAmounts): { baseMinor: bigint; trace: CommissionResult['trace'] } {
  validateAmounts(a);
  const trace: CommissionResult['trace'] = { baseType: rule.baseType };
  const derivedNet = a.netMinor ?? a.grossMinor - a.discountMinor - a.otherFeeMinor;
  let base: bigint;
  switch (rule.baseType) {
    case 'gross':
      base = a.grossMinor;
      break;
    case 'discounted':
      base = a.grossMinor - a.discountMinor;
      break;
    case 'net':
      base = derivedNet;
      break;
    default:
      throw new DomainError('UNSUPPORTED_CONFIGURATION', 'Custom commission bases are not supported yet');
  }
  trace.initialBaseMinor = base.toString();

  if (hasExclusions(rule.excludedItems)) {
    if (!a.lineItems || a.lineItems.length === 0) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'This commission rule excludes some items, but the conversion has no line items; manual review required',
        { reason: 'EXCLUSIONS_REQUIRE_LINE_ITEMS' },
      );
    }
    const excluded = a.lineItems.filter((li) => isExcluded(li, rule.excludedItems as ExcludedItems));
    const excludedGross = excluded.reduce((s, li) => s + li.grossMinor, 0n);
    let excludedDiscount = 0n;
    if (rule.baseType !== 'gross' && excludedGross > 0n) {
      const allHaveDiscount = a.lineItems.every((li) => li.discountMinor != null);
      excludedDiscount = allHaveDiscount
        ? excluded.reduce((s, li) => s + (li.discountMinor ?? 0n), 0n)
        : a.grossMinor === 0n
          ? 0n
          : prorate(a.discountMinor, excludedGross, a.grossMinor, 'half_even');
    }
    const excludedAmount = excludedGross - excludedDiscount;
    base -= excludedAmount;
    trace.excludedLineCount = excluded.length;
    trace.excludedAmountMinor = excludedAmount.toString();
  }

  if (rule.includeTax) base += a.taxMinor;
  if (rule.includeShipping) base += a.shippingMinor;
  trace.includeTax = rule.includeTax;
  trace.includeShipping = rule.includeShipping;
  base = maxBig(base, 0n);
  trace.baseMinor = base.toString();
  return { baseMinor: base, trace };
}

/** Deterministic commission calculation for one conversion under one frozen rule snapshot. */
export function computeCommission(rule: CommissionRuleSnapshot, a: ConversionAmounts): CommissionResult {
  validateCommissionRule(rule);
  if (rule.currency && rule.currency !== a.currency) {
    throw new DomainError('CURRENCY_MISMATCH', 'Conversion currency does not match the commission rule currency', {
      ruleCurrency: rule.currency,
      conversionCurrency: a.currency,
    });
  }
  const { baseMinor, trace } = computeBase(rule, a);
  let commission: bigint;
  if (rule.type === 'percentage') {
    commission = baseMinor > 0n ? multiplyRate(baseMinor, rule.rate as string, rule.roundingMode) : 0n;
    trace.rate = rule.rate ?? null;
  } else {
    commission = rule.fixedMinor as bigint;
    trace.fixedMinor = commission.toString();
  }
  trace.rawCommissionMinor = commission.toString();
  if (rule.minMinor != null && baseMinor > 0n && commission < rule.minMinor) {
    commission = rule.minMinor;
    trace.floorApplied = true;
  }
  if (rule.maxMinor != null && commission > rule.maxMinor) {
    commission = rule.maxMinor;
    trace.capApplied = true;
  }
  trace.roundingMode = rule.roundingMode;
  trace.ruleVersion = rule.version;
  return { baseMinor, commissionMinor: commission, currency: a.currency, trace };
}

/** Customer-paid total used to prorate refunds: gross - discount + tax + shipping. */
export function customerTotal(a: ConversionAmounts): bigint {
  return a.grossMinor - a.discountMinor + a.taxMinor + a.shippingMinor;
}

export interface RefundRecalculation {
  /** Commission that should remain after the cumulative refund. */
  remainingCommissionMinor: bigint;
  /** How much of the originally calculated commission must be reversed/clawed back (>= 0). */
  reversalMinor: bigint;
  fullRefund: boolean;
  trace: CommissionResult['trace'];
}

/**
 * Recalculate commission after a cumulative refund amount (spec §8.1 refund/clawback, §9.3 reversal effects).
 * - Full refund → commission becomes 0 (fixed or percentage).
 * - Partial refund, percentage → base reduced proportionally to refunded share of the customer total, commission recomputed.
 * - Partial refund, fixed → fixed commission unchanged (DECISION NEEDED D-006; safe documented default).
 * - refund_behavior "none" → commission unchanged.
 */
export function recalculateAfterRefund(
  rule: CommissionRuleSnapshot,
  a: ConversionAmounts,
  originalCommissionMinor: bigint,
  cumulativeRefundedMinor: bigint,
): RefundRecalculation {
  invariant(cumulativeRefundedMinor >= 0n, 'VALIDATION_FAILED', 'Refund amount cannot be negative');
  const total = customerTotal(a);
  const fullRefund = total === 0n || cumulativeRefundedMinor >= total;
  const trace: CommissionResult['trace'] = {
    customerTotalMinor: total.toString(),
    cumulativeRefundedMinor: cumulativeRefundedMinor.toString(),
    refundBehavior: rule.refundBehavior,
  };
  if (rule.refundBehavior === 'none') {
    return { remainingCommissionMinor: originalCommissionMinor, reversalMinor: 0n, fullRefund, trace };
  }
  let remaining: bigint;
  if (fullRefund) {
    remaining = 0n;
  } else if (rule.type === 'fixed') {
    remaining = originalCommissionMinor;
    trace.partialFixedUnchanged = true;
  } else {
    const { baseMinor } = computeBase(rule, a);
    const refundedBase = prorate(baseMinor, cumulativeRefundedMinor, total, 'half_even');
    const newBase = maxBig(baseMinor - refundedBase, 0n);
    remaining = newBase > 0n ? multiplyRate(newBase, rule.rate as string, rule.roundingMode) : 0n;
    if (rule.minMinor != null && newBase > 0n && remaining < rule.minMinor) remaining = rule.minMinor;
    if (rule.maxMinor != null && remaining > rule.maxMinor) remaining = rule.maxMinor;
    trace.newBaseMinor = newBase.toString();
  }
  if (remaining > originalCommissionMinor) remaining = originalCommissionMinor;
  return { remainingCommissionMinor: remaining, reversalMinor: originalCommissionMinor - remaining, fullRefund, trace };
}
