import type { AgencyDailyStatRow } from '@cs/db';
import { addDays, utcDay } from './stats';

export type SeriesRange = '12w' | '12m';

/** One chart bucket. `start` = bucket's first day (ISO-week Monday or month's 1st). NULL = nothing measured in the bucket. */
export interface SeriesPoint {
  start: string;
  agencies: number | null;
  clientsActive: number | null;
  seats: number | null;
  wau: number | null;
  spendUsd: number | null;
}

/** The stat columns bucketing reads (a full `AgencyDailyStatRow` fits). */
export type SeriesRow = Pick<AgencyDailyStatRow, 'agencyId' | 'day' | 'clientsActive' | 'agencySeats' | 'clientSeats' | 'wau' | 'spendUsd'>;

const BUCKETS = 12;

/** Platform-wide figures for one day: SUM over agencies, ignoring NULLs; NULL when no agency measured it. */
interface DayTotal {
  agencies: number;
  clientsActive: number | null;
  seats: number | null;
  wau: number | null;
  spendUsd: number | null;
}

const add = (a: number | null, b: number | null): number | null => (b === null ? a : (a ?? 0) + b);
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function nextMonth(start: string): string {
  const d = new Date(`${start}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return utcDay(d);
}

/** Bucket starts, oldest first; the last bucket contains yesterday (UTC). */
function bucketStarts(range: SeriesRange, today: Date): string[] {
  const yesterday = addDays(utcDay(today), -1);
  if (range === '12w') {
    const last = weekStart(yesterday);
    return Array.from({ length: BUCKETS }, (_, i) => addDays(last, -7 * (BUCKETS - 1 - i)));
  }
  const last = new Date(`${monthStart(yesterday)}T00:00:00.000Z`);
  return Array.from({ length: BUCKETS }, (_, i) => {
    const d = new Date(last);
    d.setUTCMonth(d.getUTCMonth() - (BUCKETS - 1 - i));
    return utcDay(d);
  });
}

/** First day covered by `bucketSeries` for this range (for the stat query's lower bound). */
export function seriesWindowStart(range: SeriesRange, today: Date): string {
  return bucketStarts(range, today)[0]!;
}

/**
 * P3: `12w` = 12 ISO weeks ending yesterday, `12m` = 12 calendar months. Rows are summed over agencies per day, then per bucket:
 * level metrics (agencies, clientsActive, seats) take the latest day in the bucket that measured them, `wau` the mean
 * of measured days, `spendUsd` the sum of measured days. A bucket with nothing measured stays NULL (never 0).
 */
export function bucketSeries(rows: readonly SeriesRow[], range: SeriesRange, today: Date): SeriesPoint[] {
  const starts = bucketStarts(range, today);
  const first = starts[0]!;
  const yesterday = addDays(utcDay(today), -1);

  const days = new Map<string, DayTotal>();
  for (const r of rows) {
    if (r.day < first || r.day > yesterday) continue;
    const t = days.get(r.day) ?? { agencies: 0, clientsActive: null, seats: null, wau: null, spendUsd: null };
    t.agencies += 1;
    t.clientsActive = add(t.clientsActive, r.clientsActive);
    t.seats = add(t.seats, r.agencySeats === null || r.clientSeats === null ? null : r.agencySeats + r.clientSeats);
    t.wau = add(t.wau, r.wau);
    t.spendUsd = add(t.spendUsd, r.spendUsd === null ? null : Number(r.spendUsd));
    days.set(r.day, t);
  }

  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]! : range === '12w' ? addDays(start, 7) : nextMonth(start); // exclusive
    const inBucket = [...days.entries()].filter(([d]) => d >= start && d < end).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, t]) => t);
    const latest = (k: 'agencies' | 'clientsActive' | 'seats'): number | null => {
      for (let j = inBucket.length - 1; j >= 0; j--) {
        const v = inBucket[j]![k];
        if (v !== null) return v;
      }
      return null;
    };
    const wau = inBucket.map((t) => t.wau).filter((v): v is number => v !== null);
    const spend = inBucket.map((t) => t.spendUsd).filter((v): v is number => v !== null);
    return {
      start,
      agencies: inBucket.length === 0 ? null : latest('agencies'),
      clientsActive: latest('clientsActive'),
      seats: latest('seats'),
      wau: wau.length === 0 ? null : round(wau.reduce((a, b) => a + b, 0) / wau.length, 1),
      spendUsd: spend.length === 0 ? null : round(spend.reduce((a, b) => a + b, 0), 4),
    };
  });
}
