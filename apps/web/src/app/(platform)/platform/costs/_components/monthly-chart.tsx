import { ChartPlot, PLOT } from '@/components/charts/plot';
import { formatMoney } from '@/lib/format';
import type { CostMonth } from './types';

/** Chart roles: secondary for API-metered spend, `--chart-rival-2` (not amber: that is Friday's) for manual costs. dataviz validator vs secondary: normal dE 18.1, worst CVD dE 7.6 (tritan; legend and surface outline carry identity), 3.88:1 on white. */
export const API_COLOR = 'var(--secondary)';
export const MANUAL_COLOR = 'var(--chart-rival-2)';
/** A surface-coloured hairline separates the stacked segments. */
const MANUAL_EDGE = 'var(--surface)';

const H = 240;
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
  const slot = PLOT / Math.max(months.length, 1);
  const barW = slot * 0.6;
  const y = (v: number) => PLOT - (v / max) * PLOT;
  const ticks = [max, max / 2, 0];
  return (
    <div>
      <ChartPlot
        label="Monthly platform spend, API and manual, last six months"
        height={H}
        yTicks={ticks.map((t) => ({ at: y(t) / PLOT, label: formatMoney(t, { cents: true }).replace(/\.00$/, '') }))}
        xTicks={months.map((m, i) => ({ at: (slot * i + slot / 2) / PLOT, label: monthLabel(m.month).slice(0, 3) }))}
      >
        {months.map((m, i) => {
          const x = slot * i + (slot - barW) / 2;
          const apiH = (m.apiUsd / max) * PLOT;
          const manH = (m.manualUsd / max) * PLOT;
          const total = m.apiUsd + m.manualUsd;
          return (
            <g key={m.month} data-bar={m.month}>
              <title>{`${monthLabel(m.month)}: ${formatMoney(total, { cents: true })} (API ${formatMoney(m.apiUsd, { cents: true })}, manual ${formatMoney(m.manualUsd, { cents: true })})`}</title>
              {apiH > 0 && <rect x={x} y={y(0) - apiH} width={barW} height={apiH} fill={API_COLOR} />}
              {manH > 0 && <rect x={x} y={y(0) - apiH - manH} width={barW} height={manH} fill={MANUAL_COLOR} stroke={MANUAL_EDGE} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </ChartPlot>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-ink">
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: API_COLOR }} />API usage</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border" style={{ background: MANUAL_COLOR, borderColor: MANUAL_EDGE }} />Manual costs</li>
      </ul>
    </div>
  );
}
