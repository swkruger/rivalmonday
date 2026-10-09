import { describe, expect, it } from 'vitest';
import { formatChange, formatPrice, pricingHref } from './format';

describe('pricing format', () => {
  it('formats prices with their qualifier and unit (decision 2)', () => {
    expect(formatPrice({ amount: 89, unit: 'USD', qualifier: 'exact' })).toBe('$89');
    expect(formatPrice({ amount: 79, unit: 'USD', qualifier: 'from' })).toBe('from $79');
    expect(formatPrice({ amount: 1200, unit: 'USD', qualifier: 'up_to' })).toBe('up to $1,200');
    expect(formatPrice({ amount: 95.5, unit: 'USD/hour', qualifier: 'exact' })).toBe('$95.5/hour');
  });

  it('marks a cut down and a rise up, and nothing without a change', () => {
    expect(formatChange({ before: 99, after: 79 })).toEqual({ text: '▼ $20', tone: 'down' });
    expect(formatChange({ before: 79, after: 99 })).toEqual({ text: '▲ $20', tone: 'up' });
    expect(formatChange(null)).toBeNull();
  });

  it('builds the selection href, leaving out the default period', () => {
    expect(pricingHref('c1', { competitor: 'x', service: 'ac_tune_up', days: 180 })).toBe('/c/c1/pricing?competitor=x&service=ac_tune_up&days=180');
    expect(pricingHref('c1', { competitor: 'x', service: 'ac_tune_up', days: 90 })).toBe('/c/c1/pricing?competitor=x&service=ac_tune_up');
    expect(pricingHref('c1', {})).toBe('/c/c1/pricing');
  });
});
