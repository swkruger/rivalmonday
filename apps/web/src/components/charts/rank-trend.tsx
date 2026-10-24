import { formatDate } from '@/lib/format';
import type { RankTrendView } from '@cs/tools';
import { type ChartSeries, foldSeries, seriesColor } from './line-chart';

const NOT_IN_TOP = 21;
const MUTED = '#64748B';
const GRID = '#E2E8F0';
const MARKER = '#94A3B8';

const shortDate = (iso: string) => formatDate(iso, { tz: 'UTC', withYear: 'never' });
const fmt = (v: number) => (v >= NOT_IN_TOP ? '20+' : String(Math.round(v * 10) / 10));
const clamp = (v: number) => Math.min(NOT_IN_TOP, Math.max(1, v));

/**
 * You + every tracked competitor as average-rank series (oldest → newest), at most 5 lines: "You" is pinned, the
 * best-ranked competitors (lowest latest average) are kept and the rest fold into "Other" (their mean).
 * `foldSeries` keeps the *highest* latest values, so ranks are negated around the fold.
 */
export function rankSeries(scans: RankTrendView['scans']): ChartSeries[] {
  const names = new Map<string, string>();
  for (const s of scans) for (const c of s.competitors) names.set(c.competitorId, c.name);
  const series: ChartSeries[] = [];
  if (scans.some((s) => s.self !== null)) series.push({ key: 'self', name: 'You', you: true, points: scans.map((s) => (s.self ? clamp(s.self.avgRank) : null)) });
  for (const [id, name] of names) {
    series.push({ key: id, name, points: scans.map((s) => { const c = s.competitors.find((x) => x.competitorId === id); return c ? clamp(c.avgRank) : null; }) });
  }
  const neg = (s: ChartSeries): ChartSeries => ({ ...s, points: s.points.map((v) => (v === null ? null : -v)) });
  // Name-sorted in, because colours follow position and foldSeries returns ≤ 5 series unchanged.
  series.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return foldSeries(series.map(neg), 5, { pin: ['self'], aggregate: 'mean' }).map(neg);
}

/**
 * Trend tab (Phase 13b D8): average map rank per scan for one keyword, y inverted (1 at the top, 21 = "20+").
 * A dashed vertical marker sits at every scan whose settings changed, so a jump there is read with care.
 * Takes `get_rank_trend` scans oldest → newest. Colours follow `LineChart` (fixed slots, name-sorted series).
 */
export function RankTrend({ scans, keyword, height = 200 }: { scans: RankTrendView['scans']; keyword: string; height?: number }) {
  const series = rankSeries(scans);
  const title = `Average map rank for “${keyword}”`;
  if (scans.length === 0 || series.every((s) => s.points.every((v) => v === null))) return <p className="text-sm text-muted-foreground">No rank history yet.</p>;
  const W = 600;
  const H = height;
  const L = 34;
  const R = 12;
  const T = 10;
  const B = 22;
  const n = scans.length;
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ((v - 1) / (NOT_IN_TOP - 1)) * (H - T - B);
  const colorOf = (s: ChartSeries) => seriesColor(s, series);
  const latest = (s: ChartSeries) => { const v = [...s.points].reverse().find((p) => p !== null); return v == null ? 'no data' : fmt(v); };
  const summary = series.map((s) => `${s.name} ${latest(s)}`).join(', ');
  const changed = scans.map((s, i) => (s.settingsChanged ? i : -1)).filter((i) => i >= 0);
  const runs = (p: (number | null)[]) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    p.forEach((v, i) => {
      if (v === null) { if (cur.length) out.push(cur); cur = []; } else cur.push([x(i), y(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Latest: ${summary}.`} className="w-full">
        {[1, 5, 10, 15, NOT_IN_TOP].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={MUTED}>{fmt(v)}</text>
          </g>
        ))}
        {[...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill={MUTED}>{shortDate(scans[i]!.finishedAt)}</text>
        ))}
        {changed.map((i) => (
          <g key={`m${i}`} data-settings-marker>
            <title>{`Settings changed (scan of ${shortDate(scans[i]!.finishedAt)})`}</title>
            <line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke={MARKER} strokeWidth={1.5} strokeDasharray="4 3" />
          </g>
        ))}
        {series.map((s) => {
          const color = colorOf(s);
          return (
            <g key={s.key}>
              {runs(s.points).map((r, k) => (r.length === 1
                ? <circle key={k} data-marker={s.key} cx={r[0]![0]} cy={r[0]![1]} r={3} fill={color} />
                : <polyline key={k} data-series={s.key} points={r.map(([a, b]) => `${a},${b}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />))}
              {s.points.map((v, i) => (v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={8} fill="transparent">
                  <title>{`${s.name}: average rank ${fmt(v)} (scan of ${shortDate(scans[i]!.finishedAt)})`}</title>
                </circle>
              )))}
            </g>
          );
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: colorOf(s) }} />
            <span>{s.name}</span>
          </li>
        ))}
        {changed.length > 0 && (
          <li className="flex items-center gap-1.5">
            <svg aria-hidden width={10} height={12} viewBox="0 0 10 12"><line x1={5} x2={5} y1={0} y2={12} stroke={MARKER} strokeWidth={1.5} strokeDasharray="3 2" /></svg>
            <span>Settings changed</span>
          </li>
        )}
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Scan of</th>
                {series.map((s) => <th key={s.key} scope="col">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {scans.map((sc, i) => (
                <tr key={sc.scanId}>
                  <th scope="row" className="font-normal">{shortDate(sc.finishedAt)}{sc.settingsChanged && ' (settings changed)'}</th>
                  {series.map((s) => <td key={s.key}>{s.points[i] == null ? '—' : fmt(s.points[i]!)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
