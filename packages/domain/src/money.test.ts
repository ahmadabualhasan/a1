import { describe, expect, it } from 'vitest';
import { formatMinor, multiplyRate, parseMajorToMinor, prorate, money, add, currencyExponent } from './money';

describe('money', () => {
  it('multiplies with each rounding mode without float drift', () => {
    // 0.1 * 0.2 style float traps: 1005 * 0.015 = 15.075
    expect(multiplyRate(1005n, '0.015', 'half_up')).toBe(15n);
    expect(multiplyRate(1050n, '0.015', 'half_up')).toBe(16n); // 15.75
    expect(multiplyRate(1000n, '0.0125', 'half_up')).toBe(13n); // 12.5 → 13
    expect(multiplyRate(1000n, '0.0125', 'half_even')).toBe(12n); // 12.5 → 12
    expect(multiplyRate(1000n, '0.0135', 'half_even')).toBe(14n); // 13.5 → 14
    expect(multiplyRate(999n, '0.1', 'floor')).toBe(99n);
    expect(multiplyRate(991n, '0.1', 'ceil')).toBe(100n);
  });

  it('handles very large amounts exactly', () => {
    expect(multiplyRate(9_007_199_254_740_993n, '0.5', 'floor')).toBe(4_503_599_627_370_496n);
  });

  it('prorates exactly', () => {
    expect(prorate(1000n, 1n, 3n, 'half_even')).toBe(333n);
    expect(prorate(1000n, 2n, 3n, 'half_up')).toBe(667n);
  });

  it('parses and formats major units by currency exponent', () => {
    expect(currencyExponent('JOD')).toBe(3);
    expect(parseMajorToMinor('12.345', 'JOD')).toBe(12345n);
    expect(parseMajorToMinor('12.5', 'USD')).toBe(1250n);
    expect(() => parseMajorToMinor('12.345', 'USD')).toThrow();
    expect(formatMinor(12345n, 'JOD')).toBe('12.345');
    expect(formatMinor(5n, 'USD')).toBe('0.05');
  });

  it('refuses mixed-currency arithmetic and unsafe numbers', () => {
    expect(() => add(money(1n, 'USD'), money(1n, 'JOD'))).toThrow(/Currency mismatch/);
    expect(() => money(0.5, 'USD')).toThrow();
  });
});
