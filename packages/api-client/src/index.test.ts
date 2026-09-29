import { describe, expect, it } from 'vitest';
import { formatMoney, formatRate, toMinorUnits } from './index';

describe('display helpers', () => {
  it('formats minor units by currency exponent without floats', () => {
    expect(formatMoney(12345, 'JOD')).toBe('12.345 JOD');
    expect(formatMoney(5, 'USD')).toBe('0.05 USD');
    expect(formatMoney(-150, 'USD')).toBe('-1.50 USD');
    expect(formatMoney(null, 'USD')).toBe('—');
  });
  it('parses user amounts into minor units', () => {
    expect(toMinorUnits('12.5', 'USD')).toBe(1250);
    expect(toMinorUnits('12.345', 'JOD')).toBe(12345);
    expect(toMinorUnits('1.234', 'USD')).toBeNull();
    expect(toMinorUnits('abc', 'USD')).toBeNull();
  });
  it('formats fraction rates as percentages', () => {
    expect(formatRate('0.15')).toBe('15%');
    expect(formatRate('0.125')).toBe('12.5%');
    expect(formatRate('1')).toBe('100%');
  });
});
