import { describe, expect, it } from 'vitest';
import { bucketSeries, type SeriesRow, seriesWindowStart } from './series';

const TODAY = new Date('2026-10-13T05:00:00Z'); // Tuesday; yesterday = Monday 2026-10-12
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

function row(agencyId: string, day: string, f: Partial<SeriesRow> = {}): SeriesRow {
  return { agencyId, day, clientsActive: null, agencySeats: null, clientSeats: null, wau: null, spendUsd: null, ...f };
}

describe('bucketSeries (P3)', () => {
  it('12w: 12 ISO-week buckets (Monday starts), the last one holding yesterday', () => {
    const s = bucketSeries([], '12w', TODAY);
    expect(s).toHaveLength(12);
    expect(s[0]!.start).toBe('2026-07-27');
    expect(s[11]!.start).toBe('2026-10-12');
    expect(s.every((p) => new Date(`${p.start}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(seriesWindowStart('12w', TODAY)).toBe('2026-07-27');
  });

  it('12m: 12 calendar-month buckets ending with yesterday’s month', () => {
    const s = bucketSeries([], '12m', TODAY);
    expect(s.map((p) => p.start)).toEqual([
      '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
      '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01',
    ]);
    // On the 1st, yesterday is last month's final day: the window ends there.
    expect(bucketSeries([], '12m', new Date('2026-11-01T01:00:00Z')).at(-1)!.start).toBe('2026-10-01');
    expect(seriesWindowStart('12m', TODAY)).toBe('2025-11-01');
  });

  it('week: level metrics take the last measured day, wau the mean, spend the sum (summed over agencies)', () => {
    // Week of 2026-10-05 (Mon) .. 2026-10-11 (Sun).
    const rows = [
      row(A, '2026-10-05', { clientsActive: 1, agencySeats: 1, clientSeats: 0, wau: 2, spendUsd: '1.2500' }),
      row(B, '2026-10-05', { clientsActive: 4, agencySeats: 2, clientSeats: 1, wau: 4, spendUsd: '0.5000' }),
      row(A, '2026-10-09', { clientsActive: 3, agencySeats: 2, clientSeats: 2, wau: null, spendUsd: '2.0000' }),
      row(B, '2026-10-09', { clientsActive: 5, agencySeats: 2, clientSeats: 1, wau: 6, spendUsd: null }),
      row(A, '2026-10-11', { clientsActive: null, agencySeats: null, clientSeats: null, wau: null, spendUsd: '0.0000' }),
    ];
    const w = bucketSeries(rows, '12w', TODAY).find((p) => p.start === '2026-10-05')!;
    // Last day with rows (10-11) has only A; its clientsActive is NULL, so the level comes from 10-09.
    expect(w).toEqual({ start: '2026-10-05', agencies: 1, clientsActive: 8, seats: 7, wau: 6, spendUsd: 3.75 });
  });

  it('a bucket with only NULL figures stays NULL; measured zero stays 0', () => {
    const rows = [
      row(A, '2026-09-28', { wau: null, spendUsd: null, clientsActive: null }),
      row(A, '2026-09-21', { wau: 0, spendUsd: '0.0000', clientsActive: 0, agencySeats: 0, clientSeats: 0 }),
    ];
    const s = bucketSeries(rows, '12w', TODAY);
    expect(s.find((p) => p.start === '2026-09-28')).toEqual({ start: '2026-09-28', agencies: 1, clientsActive: null, seats: null, wau: null, spendUsd: null });
    expect(s.find((p) => p.start === '2026-09-21')).toEqual({ start: '2026-09-21', agencies: 1, clientsActive: 0, seats: 0, wau: 0, spendUsd: 0 });
    expect(s.find((p) => p.start === '2026-09-14')).toEqual({ start: '2026-09-14', agencies: null, clientsActive: null, seats: null, wau: null, spendUsd: null });
  });

  it('month: same rules over calendar months; rows outside the window (incl. today) are ignored', () => {
    const rows = [
      row(A, '2026-09-01', { clientsActive: 1, wau: 1, spendUsd: '1' }),
      row(A, '2026-09-30', { clientsActive: 2, wau: 2, spendUsd: '2' }),
      row(A, '2025-10-31', { clientsActive: 99, wau: 99, spendUsd: '99' }),
      row(A, '2026-10-13', { clientsActive: 50, wau: 50, spendUsd: '50' }),
    ];
    const s = bucketSeries(rows, '12m', TODAY);
    expect(s.find((p) => p.start === '2026-09-01')).toMatchObject({ agencies: 1, clientsActive: 2, wau: 1.5, spendUsd: 3 });
    expect(s.find((p) => p.start === '2026-10-01')).toMatchObject({ agencies: null, clientsActive: null, wau: null, spendUsd: null });
    expect(s.some((p) => p.clientsActive === 99 || p.clientsActive === 50)).toBe(false);
  });
});
