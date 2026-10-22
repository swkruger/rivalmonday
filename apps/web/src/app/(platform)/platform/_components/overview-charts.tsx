import { formatMoney } from '@/lib/format';
import { LineChart } from '@/components/charts/line-chart';
import type { StatPill } from '@/components/stat-card';

export interface Tile { value: number; delta28d: number | null }
export interface Point { start: string; agencies: number | null; clientsActive: number | null; seats: number | null; wau: number | null; spendUsd: number | null }

export const cardCls = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';
export const EMPTY_CHART = 'No history yet — figures appear after the first nightly run.';

export function deltaPill(t: Tile, fmt: (n: number) => string = String): StatPill | null {
  if (t.delta28d === null || t.delta28d === 0) return null;
  const up = t.delta28d > 0;
  return { text: `${up ? '+' : '−'}${fmt(Math.abs(t.delta28d))}`, tone: up ? 'up' : 'down' };
}

/**
 * The three platform charts (clients, seats + WAU, spend) as grid cells. NULL series values stay NULL (chart gaps).
 * `includeAgencies` adds the platform-wide agency count to the first chart (meaningless for one agency).
 */
export function PlatformCharts({ series, range, includeAgencies }: { series: Point[]; range: '12w' | '12m'; includeAgencies: boolean }) {
  const period = range === '12m' ? 'month' : 'week';
  const labels = series.map((p) => (period === 'month' ? p.start.slice(0, 7) : p.start));
  const col = (k: keyof Omit<Point, 'start'>) => series.map((p) => p[k]);
  const hasData = series.some((p) => [p.agencies, p.clientsActive, p.seats, p.wau, p.spendUsd].some((v) => v !== null));
  const chart = (title: string, s: { key: string; name: string; points: (number | null)[] }[], valueLabel: string, fmt?: (n: number) => string) => (
    <section className={cardCls}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3">
        {hasData ? <LineChart title={title} labels={labels} series={s} valueLabel={valueLabel} period={period} formatValue={fmt} /> : <p className="text-sm text-muted-foreground">{EMPTY_CHART}</p>}
      </div>
    </section>
  );
  return (
    <>
      {chart(includeAgencies ? 'Agencies and active clients' : 'Active clients', [
        { key: 'clientsActive', name: 'Active clients', points: col('clientsActive') },
        ...(includeAgencies ? [{ key: 'agencies', name: 'Agencies', points: col('agencies') }] : []),
      ], 'total')}
      {chart('Seats and weekly active users', [
        { key: 'seats', name: 'Seats', points: col('seats') },
        { key: 'wau', name: 'Weekly active users', points: col('wau') },
      ], 'total')}
      {chart('Spend', [{ key: 'spendUsd', name: 'Spend', points: col('spendUsd') }], 'spend', (n: number) => formatMoney(n, { cents: true }))}
    </>
  );
}
