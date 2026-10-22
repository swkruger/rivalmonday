import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('usd vs cents units', () => {
    expect(formatMoney(229)).toBe('$229');
    expect(formatMoney(22900, { unit: 'cents' })).toBe('$229');
    expect(formatMoney(4950, { unit: 'cents' })).toBe('$49.50');
    expect(formatMoney(8.5)).toBe('$8.50');
  });
  it('$229 without cents and $0.42 with', () => {
    expect(formatMoney(229)).toBe('$229');
    expect(formatMoney(0.42)).toBe('$0.42');
    expect(formatMoney(42, { unit: 'cents' })).toBe('$0.42');
  });
  it('can force cents on or off', () => {
    expect(formatMoney(229, { cents: true })).toBe('$229.00');
    expect(formatMoney(1234.567, { cents: true })).toBe('$1,234.57');
    expect(formatMoney(0, { cents: true })).toBe('$0.00');
  });
});
