import type { ChartSeries } from './brief-report';

/** Design system v1 chart roles (09 § 5.4), shared by the web charts and the print (PDF) charts. */
export type ChartRole = 'you' | 'rival1' | 'rival2' | 'context';

const last = (p: (number | null)[]): number => {
  for (let i = p.length - 1; i >= 0; i--) if (p[i] !== null) return p[i]!;
  return -Infinity;
};

/** P8: <= 2 rivals keep their order (stable colours); more -> the two highest latest values are highlighted (lowest when `lowerIsBetter`, e.g. ranks). */
export function chartRole(s: ChartSeries, all: ChartSeries[], opts: { lowerIsBetter?: boolean } = {}): ChartRole {
  if (s.you) return 'you';
  if (s.key === 'other') return 'context';
  const rivals = all.filter((x) => !x.you && x.key !== 'other');
  // A series with no data is the worst, whichever way "better" points.
  const rank = (x: ChartSeries) => { const v = last(x.points); return v === -Infinity && opts.lowerIsBetter ? Infinity : v; };
  const ranked = rivals.length <= 2 ? rivals : [...rivals].sort((a, b) => (opts.lowerIsBetter ? rank(a) - rank(b) : rank(b) - rank(a)) || a.name.localeCompare(b.name, 'en'));
  const i = ranked.slice(0, 2).findIndex((x) => x.key === s.key);
  return i === 0 ? 'rival1' : i === 1 ? 'rival2' : 'context';
}

export interface FoldOptions {
  /** How the folded series combine: sum for counts, mean/min for ratings and prices. Nulls are ignored. */
  aggregate?: 'sum' | 'mean' | 'min';
  /** Series keys that are always kept and never folded (e.g. "You"). They come first. */
  pin?: string[];
  /** Name of the folded series. */
  label?: string;
}

const AGGREGATE: Record<NonNullable<FoldOptions['aggregate']>, (v: number[]) => number> = {
  sum: (v) => v.reduce((a, b) => a + b, 0),
  mean: (v) => v.reduce((a, b) => a + b, 0) / v.length,
  min: (v) => Math.min(...v),
};

export function foldSeries(series: ChartSeries[], max = 5, opts: FoldOptions = {}): ChartSeries[] {
  if (series.length <= max) return series;
  const { aggregate = 'sum', pin = [], label = 'Other' } = opts;
  const pinned = series.filter((s) => pin.includes(s.key));
  const free = series.filter((s) => !pin.includes(s.key));
  const ranked = [...free].sort((a, b) => last(b.points) - last(a.points) || a.name.localeCompare(b.name, 'en'));
  const keep = Math.max(0, max - pinned.length - 1);
  const kept = ranked.slice(0, keep).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const rest = ranked.slice(keep);
  const len = Math.max(...series.map((s) => s.points.length));
  const points = Array.from({ length: len }, (_, i) => {
    const vals = rest.map((s) => s.points[i]).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? AGGREGATE[aggregate](vals) : null;
  });
  const shown = [...pinned, ...kept].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [...shown, { key: 'other', name: label, points }];
}

export const niceMax = (v: number): number => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = Math.ceil(v / p) * p;
  return n % 2 === 0 ? n : n + 1; // even, so the mid gridline is an integer
};

/** `n` equal steps from 0 to `max` (n + 1 values). */
export const yTicks = (max: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => (max * i) / n);

/** SVG path data for a line that breaks at nulls (a lone point is a bare move). */
export function linePath(points: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = '';
  let pen = false;
  points.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`;
    pen = true;
  });
  return d;
}
