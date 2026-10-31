import type { GeoGridView } from '@cs/tools';
import { useId } from 'react';
import { cellPaint, Compass, gridLabelFont, gridLayout, gridMaxWidth, labelHalo, WHITE } from './geo-grid';
import { MapZoom } from './map-zoom';

const INK = 'var(--ink)';
const MUTED = 'var(--chart-axis)';
const LINE = 'var(--chart-grid)';
const HATCH_ID = 'changegrid-hatch';
const MINUS = '−'; // U+2212, the typographic minus

const UP = ['#86b6ef', '#47a8e7', '#2a6bac'] as const;
const DOWN = ['#f0a22e', '#d47a06', '#9a4f00'] as const;
const SAME = '#f0efec';
const step = (n: number) => (n <= 2 ? 0 : n <= 5 ? 1 : 2);

/**
 * Phase 13b D8: diverging ramp for a per-point rank change (rank before − rank after; positive = moved up).
 * Up = brand blues, down = brand oranges, 3 steps per arm (1–2, 3–5, 6+), neutral grey `=` midpoint; null = the
 * GeoGrid hatch (no data on either side). Every cell prints its signed label, so colour is never the only signal.
 *
 * Steps (light theme): up #86b6ef / #47a8e7 / #2a6bac (ink, ink, white text); same #f0efec (ink);
 * down #f0a22e / #d47a06 / #9a4f00 (ink, ink, white text).
 * Validated 2026-10-17 with the dataviz skill's `validate_palette.js --mode light` (surface #fcfcfb):
 * - up arm `--ordinal`: PASS (monotone L, adjacent ΔL ≥ 0.06, light end 2.06:1, hue spread 13°);
 * - down arm `--ordinal`: PASS (monotone L, adjacent ΔL ≥ 0.06, light end 2.06:1, hue spread 15°);
 * - cross-arm pairs at equal steps: CVD ΔE 23.9 / 25.8 / 21.8 and normal-vision ΔE 24.9 / 28.3 / 24.5 (all PASS ≥ 8 / ≥ 15).
 * The neutral midpoint is the reference palette's light diverging grey; it is outlined because it sits at 1.12:1
 * against the surface (the categorical checks fail by design on a diverging ramp and were not used).
 */
export function changeFill(delta: number | null, hatchId: string = HATCH_ID): { fill: string; text: string; label: string } {
  if (delta === null) return { fill: `url(#${hatchId})`, text: MUTED, label: '–' };
  if (delta === 0) return { fill: SAME, text: INK, label: '=' };
  const i = step(Math.abs(delta));
  const fill = delta > 0 ? UP[i] : DOWN[i];
  return { fill, text: i === 2 ? WHITE : INK, label: delta > 0 ? `+${delta}` : `${MINUS}${-delta}` };
}

/** Rank before − rank after for one point; null when either scan has no data there. */
export const rankChange = (before: number | null | undefined, after: number | null | undefined): number | null =>
  before === null || before === undefined || after === null || after === undefined ? null : before - after;

const sayRank = (r: number) => (r > 20 ? '20+' : String(r));
const sayChange = (b: number | null, a: number | null, d: number | null) =>
  d === null ? 'no data for this point'
    : d === 0 ? `same rank (${sayRank(a!)})`
      : `moved ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} (rank ${sayRank(b!)} → ${sayRank(a!)})`;

const LEGEND: { label: string; delta: number | null }[] = [
  { label: 'Moved up', delta: 4 }, { label: 'Same', delta: 0 }, { label: 'Moved down', delta: -4 }, { label: 'No data', delta: null },
];

/**
 * Compare tab (Phase 13b D8): the per-point change between two scans with the same settings, laid out like GeoGrid
 * (rows north → south, columns west → east; on the map when one is given).
 */
export function ChangeGrid({ before, after, lats, lngs, map = null, title = 'Change in local rank' }: {
  before: (number | null)[][]; after: (number | null)[][]; lats: number[]; lngs: number[]; map?: GeoGridView['map']; title?: string;
}) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const hatchId = `changegrid-hatch-${uid}`;
  const legendId = `${hatchId}-legend`;
  const rows = Math.max(before.length, after.length);
  const cols = Math.max(0, ...before.map((r) => r.length), ...after.map((r) => r.length));
  if (rows === 0 || cols === 0) return <p className="text-sm text-muted-foreground">No rank data in these scans.</p>;
  const { map: bg, W, H, centre, size } = gridLayout(rows, cols, map, lats, lngs);
  const onMap = bg !== null;
  const { fontSize, dy } = gridLabelFont(size, onMap);
  const rx = onMap ? size * 0.1 : 4;
  const deltas = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => rankChange(before[r]?.[c], after[r]?.[c])));
  const flat = deltas.flat();
  const up = flat.filter((d) => d !== null && d > 0).length;
  const same = flat.filter((d) => d === 0).length;
  const down = flat.filter((d) => d !== null && d < 0).length;
  const summary = `${up} points moved up, ${same} stayed the same, ${down} moved down`;
  const chart = (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}.`} className="block w-full">
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={WHITE} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-control)" strokeWidth="2" />
            </pattern>
          </defs>
          {bg ? <image aria-hidden="true" href={bg.url} x={0} y={0} width={bg.width} height={bg.height} preserveAspectRatio="none" /> : <Compass W={W} H={H} />}
          {deltas.map((row, r) => row.map((d, c) => {
            const f = changeFill(d, hatchId);
            const { x, y } = centre(r, c);
            const outlined = d === null || d === 0;
            const p = cellPaint(f.fill, outlined ? LINE : null, d === 0, onMap);
            return (
              <g key={`${r}-${c}`}>
                <title>{`${sayChange(before[r]?.[c] ?? null, after[r]?.[c] ?? null, d)} (row ${r + 1} of ${rows}, column ${c + 1} of ${cols})`}</title>
                <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={rx} fill={p.fill} fillOpacity={p.fillOpacity} stroke={p.stroke} strokeWidth={p.strokeWidth} />
                <text data-change x={x} y={y + dy} textAnchor="middle" fontSize={fontSize} fontWeight={700} fill={f.text} pointerEvents="none" {...labelHalo(f.text, fontSize, onMap)}>{f.label}</text>
              </g>
            );
          }))}
        </svg>
  );
  return (
    <figure className="flex flex-col gap-2">
      <div className="mx-auto w-full" style={{ maxWidth: gridMaxWidth(W, onMap) }}>{onMap ? <MapZoom>{chart}</MapZoom> : chart}</div>
      {bg && <figcaption className="text-center text-xs text-muted-foreground">{bg.attribution}</figcaption>}
      <svg data-legend-defs aria-hidden width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <pattern id={legendId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill={WHITE} />
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--line-control)" strokeWidth="1.5" />
          </pattern>
        </defs>
      </svg>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => {
          const f = changeFill(l.delta, legendId);
          const outlined = l.delta === null || l.delta === 0;
          return (
            <li key={l.label} className="flex items-center gap-1.5">
              <svg aria-hidden width={16} height={12} viewBox="0 0 16 12">
                <rect x={0.5} y={0.5} width={15} height={11} rx={2} fill={f.fill} stroke={outlined ? LINE : 'none'} />
              </svg>
              <span>{l.label}</span>
            </li>
          );
        })}
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Row</th>
                {Array.from({ length: cols }, (_, c) => <th key={c} scope="col">{c === 0 ? 'Col 1 (west)' : c === cols - 1 ? `Col ${c + 1} (east)` : `Col ${c + 1}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {deltas.map((row, r) => (
                <tr key={r}>
                  <th scope="row" className="font-normal">{r === 0 ? 'Row 1 (north)' : r === rows - 1 ? `Row ${r + 1} (south)` : `Row ${r + 1}`}</th>
                  {row.map((d, c) => <td key={c}>{d === null ? 'no data' : changeFill(d).label}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
