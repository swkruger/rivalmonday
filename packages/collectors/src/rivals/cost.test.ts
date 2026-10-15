import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from './cost';

describe('estimateCostUsd', () => {
  it('estimate 7x7x5 + 20 shortlisted <= 3.0', () => {
    const c = estimateCostUsd({ searches: 7 * 7 * 5, shortlist: 20 });
    expect(c).toBeLessThanOrEqual(3);
    expect(c).toBeCloseTo(245 * 0.002 + 20 * 0.0141);
  });
});
