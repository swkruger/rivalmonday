import { formatDate } from '@/lib/format';
import type { RankTrendView } from '@cs/tools';
import { type ChartSeries, foldSeries, seriesColor } from './line-chart';
import { ChartPlot, PLOT, PlotDot, PlotLine } from './plot';

const NOT_IN_TOP = 21;
const MARKER = 'var(--chart-context)';

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
  // Name-sorted in so ties and the folded list are stable; colours come from `seriesColor` (best-ranked two rivals highlighted).
  series.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return foldSeries(series.map(neg), 5, { pin: ['self'], aggregate: 'mean' }).map(neg);
}

/**
 * Trend tab (Phase 13b D8): average map rank per scan for one keyword, y inverted (1 at the top, 21 = "20+").
 * A dashed vertical marker sits at every scan whose settings changed, so a jump there is read with care.
 * Takes `get_rank_trend` scans oldest → newest. Colours follow `seriesColor` with `lowerIsBetter`: you, the two best-ranked rivals highlighted (up to 2 rivals keep their order), the rest grey.
 */
export function RankTrend({ scans, keyword, height = 260 }: { scans: RankTrendView['scans']; keyword: string; height?: number }) {
  const series = rankSeries(scans);
  const title = `Average map rank for “${keyword}”`;
  if (scans.length === 0 || series.every((s) => s.points.every((v) => v === null))) return <p className="text-sm text-muted-foreground">No rank history yet.</p>;
  const n = scans.length;
  const x = (i: number) => (n === 1 ? PLOT / 2 : (i * PLOT) / (n - 1));
  const y = (v: number) => ((v - 1) / (NOT_IN_TOP - 1)) * PLOT;
  const colorOf = (s: ChartSeries) => seriesColor(s, series, { lowerIsBetter: true });
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
      <ChartPlot
        label={`${title}. Latest: ${summary}.`}
        height={height}
        yTicks={[1, 5, 10, 15, NOT_IN_TOP].map((v) => ({ at: y(v) / PLOT, label: fmt(v) }))}
        xTicks={[...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => ({ at: x(i) / PLOT, label: shortDate(scans[i]!.finishedAt) }))}
      >
        {changed.map((i) => (
          <g key={`m${i}`} data-settings-marker>
            <title>{`Settings changed (scan of ${shortDate(scans[i]!.finishedAt)})`}</title>
            <PlotLine x1={x(i)} x2={x(i)} y1={0} y2={PLOT} stroke={MARKER} strokeWidth={1.5} strokeDasharray="4 3" />
          </g>
        ))}
        {series.map((s) => {
          const color = colorOf(s);
          return (
            <g key={s.key}>
              {runs(s.points).map((r, k) => (r.length === 1
                ? <PlotDot key={k} data-marker={s.key} x={r[0]![0]} y={r[0]![1]} size={6} color={color} />
                : <polyline key={k} data-series={s.key} points={r.map(([a, b]) => `${a},${b}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />))}
              {s.points.map((v, i) => (v === null ? null : (
                <PlotDot key={i} x={x(i)} y={y(v)} size={16} color="transparent" pointerEvents="stroke">
                  <title>{`${s.name}: average rank ${fmt(v)} (scan of ${shortDate(scans[i]!.finishedAt)})`}</title>
                </PlotDot>
              )))}
            </g>
          );
        })}
      </ChartPlot>
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
