/** Decision 18 + the dataviz method: fixed-order categorical slots (validated 2026-10-08), legend for >= 2 series, table view, native tooltips. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const;
export const OTHER_COLOR = '#94a3b8';

export interface ChartSeries {
  key: string;
  name: string;
  points: (number | null)[];
}

const last = (p: (number | null)[]): number => {
  for (let i = p.length - 1; i >= 0; i--) if (p[i] !== null) return p[i]!;
  return -Infinity;
};

export function foldSeries(series: ChartSeries[], max = 5): ChartSeries[] {
  if (series.length <= max) return series;
  const ranked = [...series].sort((a, b) => last(b.points) - last(a.points) || a.name.localeCompare(b.name));
  const kept = ranked.slice(0, max - 1).sort((a, b) => a.name.localeCompare(b.name));
  const rest = ranked.slice(max - 1);
  const len = Math.max(...series.map((s) => s.points.length));
  const points = Array.from({ length: len }, (_, i) => {
    const vals = rest.map((s) => s.points[i]).filter((v): v is number => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  });
  return [...kept, { key: 'other', name: 'Other', points }];
}

const niceMax = (v: number) => {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
};
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function LineChart({
  title,
  labels,
  series,
  valueLabel,
  height = 180,
}: {
  title: string;
  labels: string[];
  series: ChartSeries[];
  valueLabel: string;
  height?: number;
}) {
  const all = series.flatMap((s) => s.points.filter((v): v is number => v !== null));
  if (all.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const W = 600;
  const H = height;
  const L = 32;
  const R = 12;
  const T = 10;
  const B = 22;
  const yMax = niceMax(Math.max(...all));
  const x = (i: number) => L + (labels.length === 1 ? 0 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const named = series.filter((s) => s.key !== 'other');
  const colorOf = (s: ChartSeries) => (s.key === 'other' ? OTHER_COLOR : SERIES_COLORS[named.indexOf(s) % SERIES_COLORS.length]!);
  const latest = (s: ChartSeries) => (last(s.points) === -Infinity ? 'no data' : String(last(s.points)));
  const summary = series.map((s) => `${s.name} ${latest(s)}`).join(', ');
  const runs = (p: (number | null)[]) => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    p.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push([x(i), y(v)]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const lastIndex = (p: (number | null)[]) => {
    for (let i = p.length - 1; i >= 0; i--) if (p[i] !== null) return i;
    return -1;
  };
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Latest: ${summary}.`} className="w-full">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(yMax * f)} y2={y(yMax * f)} stroke="#E2E8F0" strokeWidth={1} />
            <text x={L - 6} y={y(yMax * f) + 4} textAnchor="end" fontSize={11} fill="#64748B">
              {Math.round(yMax * f)}
            </text>
          </g>
        ))}
        {[...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#64748B">
            {shortDate(labels[i]!)}
          </text>
        ))}
        {series.map((s) => {
          const color = colorOf(s);
          const li = lastIndex(s.points);
          return (
            <g key={s.key}>
              {runs(s.points).map((r, k) => (
                <polyline
                  key={k}
                  data-series={s.key}
                  points={r.map(([a, b]) => `${a},${b}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {li >= 0 && <circle cx={x(li)} cy={y(s.points[li]!)} r={4} fill={color} stroke="#FFFFFF" strokeWidth={2} />}
              {s.points.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={8} fill="transparent">
                    <title>{`${s.name}: ${v} ${valueLabel} (week of ${shortDate(labels[i]!)})`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      {series.length >= 2 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: colorOf(s) }} />
              <span>{s.name}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th>Week of</th>
              {series.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l}>
                <td>{shortDate(l)}</td>
                {series.map((s) => (
                  <td key={s.key}>{s.points[i] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
