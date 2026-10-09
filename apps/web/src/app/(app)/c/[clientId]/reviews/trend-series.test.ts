import type { RatingTrendView } from '@cs/tools';
import { describe, expect, it } from 'vitest';
import { trendSeries } from './trend-series';

const biz = (i: number, self: boolean, ratings: (number | null)[]) => ({
  competitorId: `c${i}`, name: self ? 'Mine' : `Rival ${i}`, self,
  monthly: ratings.map((avgRating, k) => ({ month: `2026-0${k + 1}`, avgRating, reviewCount: 1 })),
}) as unknown as RatingTrendView['businesses'][number];

describe('trendSeries', () => {
  it('pins You, averages the folded rivals and labels them Other (average)', () => {
    const businesses = [biz(0, true, [1, 1]), ...[1, 2, 3, 4, 5].map((i) => biz(i, false, [5, 4]))];
    businesses[5] = biz(5, false, [3, 4]);
    const out = trendSeries({ businesses } as unknown as RatingTrendView);
    expect(out).toHaveLength(5);
    expect(out[0]!.name).toBe('You');
    const other = out.at(-1)!;
    expect(other.name).toBe('Other (average)');
    expect(other.points.every((p) => p === null || p <= 5)).toBe(true);
    expect(other.points[0]).toBeCloseTo(4, 5); // mean of 5 and 3, never their 8 sum
  });
});
