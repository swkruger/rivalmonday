const INK = '#0B2540';
const WHITE = '#FFFFFF';
const LINE = '#E2E8F0';
const HATCH_ID = 'geogrid-hatch';

/** Decision 12: single-hue ordinal ramp (validated 2026-10-08), darker = better; 21 = not in the top 20; null = no data. */
export function rankFill(rank: number | null): { fill: string; text: string; label: string; stroke: string | null } {
  if (rank === null) return { fill: `url(#${HATCH_ID})`, text: '#64748B', label: '–', stroke: LINE };
  if (rank <= 3) return { fill: '#0d366b', text: WHITE, label: String(rank), stroke: null };
  if (rank <= 10) return { fill: '#256abf', text: WHITE, label: String(rank), stroke: null };
  if (rank <= 20) return { fill: '#86b6ef', text: INK, label: String(rank), stroke: null };
  return { fill: '#f0efec', text: INK, label: '20+', stroke: LINE };
}

const sayRank = (rank: number | null) => (rank === null ? 'no data for this point' : rank > 20 ? 'not in the top 20' : `rank ${rank}`);
const LEGEND: { label: string; rank: number | null }[] = [
  { label: '1–3', rank: 1 }, { label: '4–10', rank: 4 }, { label: '11–20', rank: 11 }, { label: 'Not in top 20', rank: 21 }, { label: 'No data', rank: null },
];

function Swatch({ rank }: { rank: number | null }) {
  const f = rankFill(rank);
  return (
    <svg aria-hidden width={16} height={12} viewBox="0 0 16 12">
      <defs>
        <pattern id={`${HATCH_ID}-legend`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill={WHITE} />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#CBD5E1" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect x={0.5} y={0.5} width={15} height={11} rx={2} fill={rank === null ? `url(#${HATCH_ID}-legend)` : f.fill} stroke={f.stroke ?? 'none'} />
    </svg>
  );
}

/**
 * Module 7 geo-grid (decision 9): a plain N×N grid, rows north → south and columns west → east, as the scan's
 * `gridPoints` lays them out. Every cell prints its rank, so colour is never the only signal.
 */
export function GeoGrid({ title, summary, cells, businessName, keyword }: { title: string; summary: string; cells: (number | null)[][]; businessName: string; keyword: string }) {
  const rows = cells.length;
  const cols = Math.max(0, ...cells.map((r) => r.length));
  if (rows === 0 || cols === 0) return <p className="text-sm text-muted-foreground">No rank data in this scan.</p>;
  const CELL = 44;
  const M = 22;
  const W = cols * CELL + 2 * M;
  const H = rows * CELL + 2 * M;
  return (
    <figure className="flex flex-col gap-2">
      <div className="mx-auto w-full max-w-[520px]">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="w-full">
          <defs>
            <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={WHITE} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#CBD5E1" strokeWidth="2" />
            </pattern>
          </defs>
          <text data-compass x={W / 2} y={15} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">N</text>
          <text data-compass x={W / 2} y={H - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">S</text>
          <text data-compass x={9} y={H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">W</text>
          <text data-compass x={W - 9} y={H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#64748B">E</text>
          {cells.map((row, r) =>
            row.map((rank, c) => {
              const f = rankFill(rank);
              return (
                <g key={`${r}-${c}`}>
                  <title>{`${businessName}: ${sayRank(rank)} for "${keyword}" (row ${r + 1} of ${rows}, column ${c + 1} of ${cols})`}</title>
                  <rect x={M + c * CELL + 1} y={M + r * CELL + 1} width={CELL - 2} height={CELL - 2} rx={4} fill={f.fill} stroke={f.stroke ?? 'none'} strokeWidth={f.stroke ? 1 : 0} />
                  <text data-rank x={M + c * CELL + CELL / 2} y={M + r * CELL + CELL / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={f.text} pointerEvents="none">
                    {f.label}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <Swatch rank={l.rank} />
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
                  {row.map((rank, c) => <td key={c}>{rank === null ? 'no data' : rank > 20 ? '20+' : rank}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
