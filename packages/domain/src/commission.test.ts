import { describe, expect, it } from 'vitest';
import { computeCommission, recalculateAfterRefund, type CommissionRuleSnapshot, type ConversionAmounts } from './commission';
import { computePlatformFee } from './fees';

const rule = (o: Partial<CommissionRuleSnapshot> = {}): CommissionRuleSnapshot => ({
  ruleId: 'r1',
  version: 1,
  type: 'percentage',
  rate: '0.10',
  baseType: 'discounted',
  includeTax: false,
  includeShipping: false,
  roundingMode: 'half_up',
  refundBehavior: 'reverse',
  currency: null,
  ...o,
});

const amounts = (o: Partial<ConversionAmounts> = {}): ConversionAmounts => ({
  currency: 'USD',
  grossMinor: 10_000n,
  discountMinor: 1_000n,
  taxMinor: 1_600n,
  shippingMinor: 500n,
  otherFeeMinor: 200n,
  ...o,
});

describe('commission engine', () => {
  it('percentage on discounted base', () => {
    const r = computeCommission(rule(), amounts());
    expect(r.baseMinor).toBe(9_000n);
    expect(r.commissionMinor).toBe(900n);
  });

  it('percentage on gross base', () => {
    expect(computeCommission(rule({ baseType: 'gross' }), amounts()).commissionMinor).toBe(1_000n);
  });

  it('net base derives net when the source does not report it', () => {
    expect(computeCommission(rule({ baseType: 'net' }), amounts()).baseMinor).toBe(8_800n);
    expect(computeCommission(rule({ baseType: 'net' }), amounts({ netMinor: 8_500n })).baseMinor).toBe(8_500n);
  });

  it('tax and shipping inclusion', () => {
    expect(computeCommission(rule({ includeTax: true }), amounts()).baseMinor).toBe(10_600n);
    expect(computeCommission(rule({ includeShipping: true }), amounts()).baseMinor).toBe(9_500n);
    expect(computeCommission(rule({ includeTax: true, includeShipping: true }), amounts()).baseMinor).toBe(11_100n);
  });

  it('fixed commission requires currency match', () => {
    const fixed = rule({ type: 'fixed', rate: null, fixedMinor: 1_500n, currency: 'USD' });
    expect(computeCommission(fixed, amounts()).commissionMinor).toBe(1_500n);
    expect(() => computeCommission(fixed, amounts({ currency: 'JOD' }))).toThrow(/currency/);
  });

  it('rounding modes are applied at the minor unit', () => {
    const a = amounts({ grossMinor: 1_005n, discountMinor: 0n });
    expect(computeCommission(rule({ rate: '0.125', roundingMode: 'half_up' }), a).commissionMinor).toBe(126n); // 125.625
    expect(computeCommission(rule({ rate: '0.125', roundingMode: 'floor' }), a).commissionMinor).toBe(125n);
    const b = amounts({ grossMinor: 100n, discountMinor: 0n });
    expect(computeCommission(rule({ rate: '0.125', roundingMode: 'half_even' }), b).commissionMinor).toBe(12n); // 12.5
    expect(computeCommission(rule({ rate: '0.125', roundingMode: 'half_up' }), b).commissionMinor).toBe(13n);
  });

  it('caps and floors', () => {
    const capped = rule({ maxMinor: 500n, currency: 'USD' });
    expect(computeCommission(capped, amounts()).commissionMinor).toBe(500n);
    const floored = rule({ minMinor: 2_000n, currency: 'USD' });
    expect(computeCommission(floored, amounts()).commissionMinor).toBe(2_000n);
    // floor does not apply when there is no commissionable base
    expect(computeCommission(floored, amounts({ grossMinor: 0n, discountMinor: 0n })).commissionMinor).toBe(0n);
  });

  it('excluded items require line items and are subtracted', () => {
    const ex = rule({ excludedItems: { skus: ['GIFTCARD'] } });
    expect(() => computeCommission(ex, amounts())).toThrow(/line items/);
    const a = amounts({
      grossMinor: 10_000n,
      discountMinor: 1_000n,
      lineItems: [
        { sku: 'SHOE', quantity: 1, grossMinor: 8_000n, discountMinor: 800n },
        { sku: 'GIFTCARD', quantity: 1, grossMinor: 2_000n, discountMinor: 200n },
      ],
    });
    expect(computeCommission(ex, a).baseMinor).toBe(7_200n);
    // proportional discount allocation when line discounts are missing
    const b = amounts({
      lineItems: [
        { sku: 'SHOE', quantity: 1, grossMinor: 8_000n },
        { sku: 'GIFTCARD', quantity: 1, grossMinor: 2_000n },
      ],
    });
    expect(computeCommission(ex, b).baseMinor).toBe(7_200n);
  });

  it('rejects unsupported and invalid configurations', () => {
    expect(() => computeCommission(rule({ type: 'hybrid' }), amounts())).toThrow(/Hybrid/);
    expect(() => computeCommission(rule({ baseType: 'custom' }), amounts())).toThrow(/Custom/);
    expect(() => computeCommission(rule({ rate: '1.5' }), amounts())).toThrow(/between 0 and 1/);
    expect(() => computeCommission(rule(), amounts({ discountMinor: 20_000n }))).toThrow(/Discount/);
    expect(() => computeCommission(rule(), amounts({ taxMinor: -1n }))).toThrow(/negative/);
  });

  it('is deterministic for the same snapshot and input', () => {
    const a = computeCommission(rule({ rate: '0.137' }), amounts());
    const b = computeCommission(rule({ rate: '0.137' }), amounts());
    expect(a).toEqual(b);
  });
});

describe('refund recalculation', () => {
  const a = amounts(); // customer total = 10000 - 1000 + 1600 + 500 = 11100
  it('full refund reverses entire commission', () => {
    const r = recalculateAfterRefund(rule(), a, 900n, 11_100n);
    expect(r.fullRefund).toBe(true);
    expect(r.reversalMinor).toBe(900n);
    expect(r.remainingCommissionMinor).toBe(0n);
  });

  it('partial refund prorates the base', () => {
    const r = recalculateAfterRefund(rule(), a, 900n, 5_550n); // half
    expect(r.remainingCommissionMinor).toBe(450n);
    expect(r.reversalMinor).toBe(450n);
  });

  it('cumulative partial refunds never exceed the original commission', () => {
    const r1 = recalculateAfterRefund(rule(), a, 900n, 1_110n);
    const r2 = recalculateAfterRefund(rule(), a, 900n, 99_999n);
    expect(r1.remainingCommissionMinor).toBe(810n);
    expect(r2.remainingCommissionMinor).toBe(0n);
  });

  it('partial refund leaves fixed commission unchanged; full refund reverses it', () => {
    const fixed = rule({ type: 'fixed', fixedMinor: 1_500n, rate: null, currency: 'USD' });
    expect(recalculateAfterRefund(fixed, a, 1_500n, 100n).reversalMinor).toBe(0n);
    expect(recalculateAfterRefund(fixed, a, 1_500n, 11_100n).reversalMinor).toBe(1_500n);
  });

  it('refund behavior none keeps commission', () => {
    expect(recalculateAfterRefund(rule({ refundBehavior: 'none' }), a, 900n, 11_100n).reversalMinor).toBe(0n);
  });
});

describe('platform fees', () => {
  it('charges nothing on the default plan', () => {
    expect(computePlatformFee({ planKey: 'default', basis: 'none', roundingMode: 'half_up' }, { commissionMinor: 900n, saleBaseMinor: 9000n })).toBe(0n);
  });
  it('supports percentage of commission and of sale', () => {
    expect(computePlatformFee({ planKey: 'p', basis: 'percentage_of_commission', rate: '0.2', roundingMode: 'half_up' }, { commissionMinor: 905n, saleBaseMinor: 0n })).toBe(181n);
    expect(computePlatformFee({ planKey: 'p', basis: 'percentage_of_sale', rate: '0.02', roundingMode: 'floor' }, { commissionMinor: 0n, saleBaseMinor: 9_999n })).toBe(199n);
  });
});
