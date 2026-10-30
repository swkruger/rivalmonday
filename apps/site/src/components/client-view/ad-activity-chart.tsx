'use client';

import { useState } from 'react';
import { formatDay } from '../../sample/format';
import { useInView } from '../motion/in-view';

export interface AdSeries {
  name: string;
  role: 'rival1' | 'rival2' | 'context';
  points: readonly number[];
}

// Chart roles (design system 09 § 5.4): up to two highlighted rivals + context grey; no orange, text never in series colour.
const STROKE: Record<AdSeries['role'], string> = { rival1: 'stroke-chart-rival-1', rival2: 'stroke-chart-rival-2', context: 'stroke-chart-context' };
const FILL: Record<AdSeries['role'], string> = { rival1: 'fill-chart-rival-1', rival2: 'fill-chart-rival-2', context: 'fill-chart-context' };
const SWATCH: Record<AdSeries['role'], string> = { rival1: 'bg-chart-rival-1', rival2: 'bg-chart-rival-2', context: 'bg-chart-context' };

const W = 560;
const H = 200;
const PAD = { l: 36, r: 12, t: 12, b: 36 };
// Axis text in viewBox units: larger on phones, where the chart is drawn at about half size.
const AXIS_TEXT = 'fill-chart-axis text-xl sm:text-sm';

/**
 * Active competitor ads per week: one line per rival, drawn in once it scrolls into view (`draw-line`). A legend
 * names every series; a crosshair tooltip reads the hovered week; "Show as table" is the text alternative.
 */
export function AdActivityChart({ weeks, series }: { weeks: readonly string[]; series: readonly AdSeries[] }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(2, ...series.flatMap((s) => s.points));
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, weeks.length - 1);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = (pts: readonly number[]) => pts.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');
  const ticks = Array.from({ length: max + 1 }, (_, v) => v);
  const labelAt = [0, Math.floor((weeks.length - 1) / 2), weeks.length - 1];
  const summary = series.map((s) => `${s.name} ${s.points.at(-1)}`).join(', ');

  return (
    <div ref={ref} data-drawn={seen ? '' : undefined} className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-0.5 w-4 rounded-full ${SWATCH[s.role]}`} />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Active competitor ads per week over ${weeks.length} weeks. Latest week: ${summary}.`}
          className="h-auto w-full overflow-visible"
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-chart-grid" strokeWidth="1" />
              <text x={PAD.l - 10} y={y(v) + 6} textAnchor="end" className={AXIS_TEXT}>{v}</text>
            </g>
          ))}
          {labelAt.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === weeks.length - 1 ? 'end' : 'middle'} className={AXIS_TEXT}>
              {formatDay(weeks[i]!).replace(/, \d{4}$/, '')}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-line-strong" strokeWidth="1" strokeDasharray="3 3" />}
          {series.map((s) => (
            <path key={s.name} d={path(s.points)} pathLength={1} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className={`draw-line ${STROKE[s.role]}`} />
          ))}
          {hover !== null &&
            series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.points[hover] ?? 0)} r="4" strokeWidth="2" className={`${FILL[s.role]} stroke-surface`} />
            ))}
          {/* Hit targets: one column per week, wider than the marks. */}
          {weeks.map((w, i) => (
            <rect key={w} x={x(i) - (W - PAD.l - PAD.r) / (2 * (weeks.length - 1))} y={0} width={(W - PAD.l - PAD.r) / (weeks.length - 1)} height={H} fill="transparent" onPointerEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-md border border-line bg-surface p-2.5 text-xs shadow-float"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > weeks.length / 2 ? 'calc(-100% - 12px)' : '12px'})` }}
          >
            <p className="mb-1 font-semibold text-ink">Week of {formatDay(weeks[hover]!)}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center justify-between gap-3 text-ink-secondary">
                <span className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${SWATCH[s.role]}`} />
                  {s.name}
                </span>
                <span className="font-semibold tabular-nums text-ink">{s.points[hover]}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer py-1 text-muted-ink">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left tabular-nums">
            <caption className="sr-only">Active competitor ads per week</caption>
            <thead>
              <tr>
                <th scope="col">Week of</th>
                {series.map((s) => <th key={s.name} scope="col">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={w}>
                  <th scope="row" className="font-normal">{formatDay(w)}</th>
                  {series.map((s) => <td key={s.name}>{s.points[i]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
