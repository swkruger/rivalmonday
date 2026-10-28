import { formatMoney } from '@/lib/format';
import type { CostMonth } from './types';

/** Chart roles: secondary for API-metered spend, `--chart-rival-2` (not amber: that is Friday's) for manual costs. dataviz validator vs secondary: normal dE 18.1, worst CVD dE 7.6 (tritan; legend and surface outline carry identity), 3.88:1 on white. */
export const API_COLOR = 'var(--secondary)';
export const MANUAL_COLOR = 'var(--chart-rival-2)';
/** A surface-coloured hairline separates the stacked segments. */
const MANUAL_EDGE = 'var(--surface)';

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
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--chart-axis)">{formatMoney(t, { cents: true }).replace(/\.00$/, '')}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const apiH = (m.apiUsd / max) * innerH;
          const manH = (m.manualUsd / max) * innerH;
          const total = m.apiUsd + m.manualUsd;
          return (
            <g key={m.month} data-bar={m.month}>
              <title>{`${monthLabel(m.month)}: ${formatMoney(total, { cents: true })} (API ${formatMoney(m.apiUsd, { cents: true })}, manual ${formatMoney(m.manualUsd, { cents: true })})`}</title>
              {apiH > 0 && <rect x={x} y={y(0) - apiH} width={barW} height={apiH} fill={API_COLOR} />}
              {manH > 0 && <rect x={x} y={y(0) - apiH - manH} width={barW} height={manH} fill={MANUAL_COLOR} stroke={MANUAL_EDGE} strokeWidth={1} />}
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--chart-axis)">{monthLabel(m.month).slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-ink">
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: API_COLOR }} />API usage</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border" style={{ background: MANUAL_COLOR, borderColor: MANUAL_EDGE }} />Manual costs</li>
      </ul>
    </div>
  );
}
