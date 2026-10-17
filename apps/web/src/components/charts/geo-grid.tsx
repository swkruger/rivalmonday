import { projectToImage } from '@cs/core';
import type { GeoGridView } from '@cs/tools';
import { useId } from 'react';

const INK = '#0B2540';
const WHITE = '#FFFFFF';
const LINE = '#E2E8F0';
const HATCH_ID = 'geogrid-hatch';

/** Decision 12: single-hue ordinal ramp (validated 2026-10-08), darker = better; 21 = not in the top 20; null = no data. */
export function rankFill(rank: number | null, hatchId: string = HATCH_ID): { fill: string; text: string; label: string; stroke: string | null } {
  if (rank === null) return { fill: `url(#${hatchId})`, text: '#64748B', label: '–', stroke: LINE };
  if (rank <= 3) return { fill: '#0d366b', text: WHITE, label: String(rank), stroke: null };
  if (rank <= 10) return { fill: '#256abf', text: WHITE, label: String(rank), stroke: null };
  if (rank <= 20) return { fill: '#86b6ef', text: INK, label: String(rank), stroke: null };
  return { fill: '#f0efec', text: INK, label: '20+', stroke: LINE };
}

const sayRank = (rank: number | null) => (rank === null ? 'no data for this point' : rank > 20 ? 'not in the top 20' : `rank ${rank}`);
const LEGEND: { label: string; rank: number | null }[] = [
  { label: '1–3', rank: 1 }, { label: '4–10', rank: 4 }, { label: '11–20', rank: 11 }, { label: 'Not in top 20', rank: 21 }, { label: 'No data', rank: null },
];

function Swatch({ rank, legendId }: { rank: number | null; legendId: string }) {
  const f = rankFill(rank, legendId);
  return (
    <svg aria-hidden width={16} height={12} viewBox="0 0 16 12">
      <rect x={0.5} y={0.5} width={15} height={11} rx={2} fill={f.fill} stroke={f.stroke ?? 'none'} />
    </svg>
  );
}

type GridMap = NonNullable<GeoGridView['map']>;
/** `map` is the background actually used (null = plain lattice); `centre` and `size` place each cell's square. */
export interface GridLayout { map: GridMap | null; W: number; H: number; centre: (r: number, c: number) => { x: number; y: number }; size: number }

/**
 * Where each cell of a rows × cols grid sits: a plain lattice with a compass margin, or projected onto the map image
 * when one is given and `lats`/`lngs` cover every row and column. Shared by GeoGrid and ChangeGrid.
 */
export function gridLayout(rows: number, cols: number, map: GridMap | null = null, lats?: number[], lngs?: number[]): GridLayout {
  const CELL = 44;
  const M = 22;
  if (map !== null && lats !== undefined && lngs !== undefined && lats.length >= rows && lngs.length >= cols) {
    const pts = lats.slice(0, rows).map((lat) => lngs.slice(0, cols).map((lng) => projectToImage({ lat, lng }, map.bounds, map.width, map.height)));
    const gaps: number[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) gaps.push(Math.abs(pts[r]![c + 1]!.x - pts[r]![c]!.x));
      if (r + 1 < rows) gaps.push(Math.abs(pts[r + 1]![c]!.y - pts[r]![c]!.y));
    }
    const spacing = gaps.length ? Math.min(...gaps) : CELL;
    return { map, W: map.width, H: map.height, centre: (r, c) => pts[r]![c]!, size: Math.max(18, 0.86 * spacing) };
  }
  return {
    map: null, W: cols * CELL + 2 * M, H: rows * CELL + 2 * M,
    centre: (r, c) => ({ x: M + c * CELL + CELL / 2, y: M + r * CELL + CELL / 2 }), size: CELL - 2,
  };
}

/**
 * Cell label font size in viewBox units. A map frame (512–1024 px wide) is drawn at ≤ 520 px, so a fixed 13 would
 * shrink to ~6.5 px; on a map the label scales with the cell (≈ 0.3 × size → ~12–13 px rendered). Plain grid: 13.
 */
export function gridLabelFont(size: number, onMap: boolean): { fontSize: number; dy: number } {
  const fontSize = onMap ? Math.max(13, size * 0.3) : 13;
  return { fontSize, dy: fontSize * 0.38 };
}

/** The four compass letters around a plain (map-less) grid. */
export function Compass({ W, H }: { W: number; H: number }) {
  return (
    <>
      <text data-compass x={W / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">N</text>
      <text data-compass x={W / 2} y={H - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">S</text>
      <text data-compass x={9} y={H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">W</text>
      <text data-compass x={W - 9} y={H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">E</text>
    </>
  );
}

/**
 * Module 7 geo-grid (decision 9): a plain N×N grid, rows north → south and columns west → east, as the scan's
 * `gridPoints` lays them out. Every cell prints its rank, so colour is never the only signal.
 */
export function GeoGrid({ title, summary, cells, businessName, keyword, map = null, lats, lngs }: { title: string; summary: string; cells: (number | null)[][]; businessName: string; keyword: string; map?: GeoGridView['map']; lats?: number[]; lngs?: number[] }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const hatchId = `geogrid-hatch-${uid}`;
  const legendId = `${hatchId}-legend`;
  const rows = cells.length;
  const cols = Math.max(0, ...cells.map((r) => r.length));
  if (rows === 0 || cols === 0) return <p className="text-sm text-muted-foreground">No rank data in this scan.</p>;
  const { map: bg, W, H, centre, size } = gridLayout(rows, cols, map, lats, lngs);
  const { fontSize, dy } = gridLabelFont(size, bg !== null);
  return (
    <figure className="flex flex-col gap-2">
      <div className="mx-auto w-full max-w-[520px]">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="w-full">
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={WHITE} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#CBD5E1" strokeWidth="2" />
            </pattern>
          </defs>
          {bg ? (
            <image aria-hidden="true" href={bg.url} x={0} y={0} width={bg.width} height={bg.height} preserveAspectRatio="none" />
          ) : (
            <Compass W={W} H={H} />
          )}
          {cells.map((row, r) =>
            Array.from({ length: cols }, (_, c) => {
              const rank = row[c] ?? null;
              const f = rankFill(rank, hatchId);
              const { x, y } = centre(r, c);
              return (
                <g key={`${r}-${c}`}>
                  <title>{`${businessName}: ${sayRank(rank)} for "${keyword}" (row ${r + 1} of ${rows}, column ${c + 1} of ${cols})`}</title>
                  <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={4} fill={f.fill} stroke={f.stroke ?? 'none'} strokeWidth={f.stroke ? 1 : 0} />
                  <text data-rank x={x} y={y + dy} textAnchor="middle" fontSize={fontSize}fontWeight={700} fill={f.text} pointerEvents="none">
                    {f.label}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      {bg && <figcaption className="text-center text-xs text-muted-foreground">{bg.attribution}</figcaption>}
      <svg data-legend-defs aria-hidden width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <pattern id={legendId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill={WHITE} />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#CBD5E1" strokeWidth="1.5" />
          </pattern>
        </defs>
      </svg>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <Swatch rank={l.rank} legendId={legendId} />
            <span>{l.label}</span>
          </li>
        ))}
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
              {cells.map((row, r) => (
                <tr key={r}>
                  <th scope="row" className="font-normal">{r === 0 ? 'Row 1 (north)' : r === rows - 1 ? `Row ${r + 1} (south)` : `Row ${r + 1}`}</th>
                  {Array.from({ length: cols }, (_, c) => { const rank = row[c] ?? null; return <td key={c}>{rank === null ? 'no data' : rank > 20 ? '20+' : rank}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
