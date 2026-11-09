import type { NumericChange } from '@cs/db';

const DAY = 86_400_000;

/** A price fact that went down (numeric before and after). */
export const isPriceCut = (f: NumericChange): boolean =>
  f.kind === 'price' && typeof f.before?.value === 'number' && typeof f.after?.value === 'number' && f.after.value < f.before.value;

/** Sum of the given points, or null when every point is null (decision 12). */
export const sumPoints = (points: (number | null)[]): number | null =>
  points.every((p) => p === null) ? null : points.reduce<number>((s, p) => s + (p ?? 0), 0);

/** Week slot of `at` (0 = oldest, `weeks - 1` = the week ending at `now`). A row stamped after `now` (database clock, or
 * written mid-request) belongs in the latest window. */
export const weekIndex = (now: Date, at: Date, weeks: number): number =>
  Math.min(weeks - 1, weeks - 1 - Math.floor((now.getTime() - at.getTime()) / (7 * DAY)));

/** Rows per week slot, oldest → newest; rows older than the window are skipped. */
export function weeklyCounts(rows: { scoredAt: Date }[], now: Date, weeks: number): number[] {
  const out = Array<number>(weeks).fill(0);
  for (const r of rows) {
    const i = weekIndex(now, r.scoredAt, weeks);
    if (i >= 0) out[i]! += 1;
  }
  return out;
}
