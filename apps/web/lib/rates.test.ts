import { describe, expect, it } from 'vitest';
import { minorToInput, percentToRate, rateToPercent } from './rates';

describe('rates', () => {
  it('converts percent to fraction strings without floating point', () => {
    expect(percentToRate('15')).toBe('0.15');
    expect(percentToRate('12.5')).toBe('0.125');
    expect(percentToRate('0.0001')).toBe('0.000001');
    expect(percentToRate('100')).toBe('1');
    expect(percentToRate('7')).toBe('0.07');
    expect(percentToRate('33.3333')).toBe('0.333333');
    expect(percentToRate('101')).toBeNull();
    expect(percentToRate('abc')).toBeNull();
    expect(percentToRate('-5')).toBeNull();
  });
  it('round-trips', () => {
    for (const p of ['15', '12.5', '7', '100', '0.5', '33.3333']) expect(rateToPercent(percentToRate(p))).toBe(p);
  });
  it('formats minor units for inputs', () => {
    expect(minorToInput(12500, 3)).toBe('12.500');
    expect(minorToInput(5, 2)).toBe('0.05');
    expect(minorToInput(100, 0)).toBe('100');
  });
});
