import type { PriceHistoryView } from '@cs/tools';
import { describe, expect, it } from 'vitest';
import { historySeries } from './history-series';

describe('historySeries', () => {
  it('folds with the lowest price, not the sum', () => {
    const series = Array.from({ length: 7 }, (_, i) => ({ competitorId: `c${i}`, name: `N${i}`, points: [100 + i * 10, 100 + i * 10] }));
    const out = historySeries({ series } as unknown as PriceHistoryView);
    expect(out).toHaveLength(5);
    const other = out.at(-1)!;
    expect(other.name).toBe('Other (lowest)');
    expect(other.points).toEqual([100, 100]);
  });
});
