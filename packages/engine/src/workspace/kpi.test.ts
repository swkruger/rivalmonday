import type { NumericChange } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { isPriceCut, sumPoints, weekIndex, weeklyCounts } from './kpi';

const DAY = 86_400_000;
const now = new Date('2026-11-08T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const fact = (kind: string, before: unknown, after: unknown) => ({ kind, before: { value: before }, after: { value: after } }) as unknown as NumericChange;

describe('isPriceCut', () => {
  it('is true only for a numeric price decrease', () => {
    expect(isPriceCut(fact('price', 100, 90))).toBe(true);
    expect(isPriceCut(fact('price', 90, 100))).toBe(false);
    expect(isPriceCut(fact('price', 90, 90))).toBe(false);
    expect(isPriceCut(fact('percent', 20, 10))).toBe(false);
    expect(isPriceCut(fact('price', '100', 90))).toBe(false);
  });
});

describe('sumPoints', () => {
  it('is null when every point is null, else sums with nulls as 0', () => {
    expect(sumPoints([])).toBeNull();
    expect(sumPoints([null, null])).toBeNull();
    expect(sumPoints([null, 2, 3])).toBe(5);
    expect(sumPoints([0, null])).toBe(0);
  });
});

describe('weekIndex / weeklyCounts', () => {
  it('puts the latest week last and clamps future rows into it', () => {
    expect(weekIndex(now, now, 8)).toBe(7);
    expect(weekIndex(now, ago(6.9), 8)).toBe(7);
    expect(weekIndex(now, ago(7), 8)).toBe(6);
    expect(weekIndex(now, ago(55), 8)).toBe(0);
    expect(weekIndex(now, new Date(now.getTime() + DAY), 8)).toBe(7);
    expect(weekIndex(now, ago(70), 8)).toBeLessThan(0);
  });

  it('counts rows per week and skips rows older than the window', () => {
    const rows = [now, ago(1), ago(8), ago(20), ago(70)].map((scoredAt) => ({ scoredAt }));
    expect(weeklyCounts(rows, now, 4)).toEqual([0, 1, 1, 2]);
  });
});
