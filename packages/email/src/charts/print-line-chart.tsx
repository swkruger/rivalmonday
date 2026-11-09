/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { type ChartRole, type ChartSeries, chartRole, linePath, niceMax, yTicks } from '@cs/core';

/** Print hexes for the chart roles (design system 09 § 5.4), on white. */
export const PRINT_ROLE_HEX: Record<ChartRole, string> = { you: '#2A6BAC', rival1: '#E05A2B', rival2: '#14936A', context: '#A3B1C2' };
const GRID = '#EDF1F5';
const AXIS = '#5B6B80';

const latest = (p: (number | null)[]): number | null => {
  for (let i = p.length - 1; i >= 0; i--) if (p[i] !== null && p[i] !== undefined) return p[i]!;
  return null;
};

/** Static SVG line chart for the PDF report: no script, no external refs, legend as text rows. */
export function PrintLineChart({
  title,
  labels,
  series: input,
  lowerIsBetter,
  width = 640,
  height = 220,
  yFormat,
  yDomain,
  yStep,
}: {
  title: string;
  labels: string[];
  series: ChartSeries[];
  lowerIsBetter?: boolean;
  width?: number;
  height?: number;
  yFormat?: (v: number) => string;
  /** Fixed y range (e.g. ratings [3, 5]); default 0 → `niceMax` of the data. */
  yDomain?: [number, number];
  /** Tick step inside `yDomain` (default: 2 steps). */
  yStep?: number;
}) {
  const series = input.map((s) => ({ ...s, points: s.points.slice(0, labels.length) }));
  const fmt = yFormat ?? ((v: number) => String(Math.round(v * 100) / 100));
  const known = series.flatMap((s) => s.points.filter((v): v is number => v !== null));
  const fixed = yDomain && Number.isFinite(yDomain[0]) && Number.isFinite(yDomain[1]) && yDomain[1] > yDomain[0] ? yDomain : null;
  const yMin = fixed ? fixed[0] : 0;
  const yMax = fixed ? fixed[1] : niceMax(known.length ? Math.max(...known) : 0);
  const steps = fixed && yStep && yStep > 0 ? Math.max(1, Math.round((yMax - yMin) / yStep)) : 2;
  const ticks = fixed ? Array.from({ length: steps + 1 }, (_, i) => Math.round((yMin + ((yMax - yMin) * i) / steps) * 1000) / 1000) : yTicks(yMax, 2);
  const pad = { l: 40, r: 12, t: 10, b: 24 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i: number) => Math.round((labels.length <= 1 ? w / 2 : (i * w) / (labels.length - 1)) * 100) / 100;
  const y = (v: number) => Math.round((1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * h * 100) / 100;
  const role = (s: ChartSeries) => chartRole(s, series, { lowerIsBetter });
  const valueText = (s: ChartSeries) => {
    const v = latest(s.points);
    return v === null ? 'no data yet' : fmt(v);
  };
  const summary = series.map((s) => `${s.name} ${valueText(s)}`).join(', ');
  // Context first, you last (on top).
  const order: ChartRole[] = ['context', 'rival2', 'rival1', 'you'];
  const drawn = [...series].sort((a, b) => order.indexOf(role(a)) - order.indexOf(role(b)));
  const xTickIdx = [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])].filter((i) => i >= 0);
  return (
    <div style={{ margin: 0 }}>
      <svg role="img" aria-label={`${title}. Latest: ${summary}.`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <g transform={`translate(${pad.l},${pad.t})`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={0} x2={w} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
              <text x={-6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={AXIS}>{fmt(v)}</text>
            </g>
          ))}
          {xTickIdx.map((i) => (
            <text key={i} x={x(i)} y={h + 16} textAnchor={i === 0 && labels.length > 1 ? 'start' : i === labels.length - 1 && labels.length > 1 ? 'end' : 'middle'} fontSize={10} fill={AXIS}>{labels[i]}</text>
          ))}
          {drawn.map((s) => {
            const color = PRINT_ROLE_HEX[role(s)];
            const d = linePath(s.points, x, y);
            const li = s.points.reduce<number>((a, v, i) => (v === null ? a : i), -1);
            return (
              <g key={s.key}>
                {d && <path d={d} fill="none" stroke={color} strokeWidth={role(s) === 'context' ? 1.5 : 2} strokeLinejoin="round" strokeLinecap="round" />}
                {s.points.map((v, i) => (v !== null && (i === li || s.points[i - 1] == null && s.points[i + 1] == null) ? <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={color} /> : null))}
              </g>
            );
          })}
        </g>
      </svg>
      <div style={{ fontSize: 11, color: AXIS, lineHeight: '16px' }}>
        {series.map((s) => (
          <div key={s.key}>
            <span style={{ display: 'inline-block', width: 12, height: 3, backgroundColor: PRINT_ROLE_HEX[role(s)], marginRight: 6, verticalAlign: 'middle' }} />
            <span>{s.name}{s.you ? ' (you)' : ''}</span>
            {latest(s.points) === null && <span>{' '}no data yet</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
