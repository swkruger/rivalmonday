import { formatUsd } from '@/server/format';
import type { CostMonth } from './types';

/** Brand tokens (CLAUDE.md): secondary for API-metered spend, accent for manual costs. */
export const API_COLOR = '#2A6BAC';
export const MANUAL_COLOR = '#F5A524';
/** The accent alone is ~2:1 on white (below the 3:1 non-text minimum), so manual segments also carry this darker outline. */
const MANUAL_EDGE = '#B45309';

const W = 640;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10" -> "Oct 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? key} ${y}`;
}

/** A round upper bound (1, 2, 2.5, 5 x 10^n) so the three gridlines carry readable numbers. */
function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 2, 2.5, 5, 10]) if (v <= f * p) return f * p;
  return 10 * p;
}

/** Last six months, stacked API + manual bars. Hand-written SVG, one `<title>` per bar for hover and screen readers. */
export function MonthlyChart({ months }: { months: CostMonth[] }) {
  const max = niceMax(Math.max(...months.map((m) => m.apiUsd + m.manualUsd), 0));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(months.length, 1);
  const barW = Math.min(56, slot * 0.6);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly platform spend, API and manual, last six months" className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#CBD5E1" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#475569">{formatUsd(t).replace(/\.00$/, '')}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const apiH = (m.apiUsd / max) * innerH;
          const manH = (m.manualUsd / max) * innerH;
          const total = m.apiUsd + m.manualUsd;
          return (
            <g key={m.month} data-bar={m.month}>
              <title>{`${monthLabel(m.month)}: ${formatUsd(total)} (API ${formatUsd(m.apiUsd)}, manual ${formatUsd(m.manualUsd)})`}</title>
              {apiH > 0 && <rect x={x} y={y(0) - apiH} width={barW} height={apiH} fill={API_COLOR} />}
              {manH > 0 && <rect x={x} y={y(0) - apiH - manH} width={barW} height={manH} fill={MANUAL_COLOR} stroke={MANUAL_EDGE} strokeWidth={1} />}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#475569">{monthLabel(m.month).slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: API_COLOR }} />API usage</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border" style={{ background: MANUAL_COLOR, borderColor: MANUAL_EDGE }} />Manual costs</li>
      </ul>
    </div>
  );
}
