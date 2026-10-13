import { LineChart } from '@/components/charts/line-chart';
import { StatCard, type StatPill } from '@/components/stat-card';
import { requireContext } from '@/server/current-viewer';
import { formatUsd } from '@/server/format';
import { callTool } from '@/server/tools';
import { loadMoreActivity } from './actions';
import { ActivityFeed, type ActivityPage } from './_components/activity-feed';
import { parseRange, RangeToggle } from './_components/range-toggle';

export const dynamic = 'force-dynamic';

interface Tile { value: number; delta28d: number | null }
interface Point { start: string; agencies: number | null; clientsActive: number | null; seats: number | null; wau: number | null; spendUsd: number | null }
interface Overview {
  tiles: { agencies: Tile; clientsActive: Tile; seats: Tile; wau: Tile; spendMonthUsd: Tile };
  series: Point[];
}

const cardCls = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';
const EMPTY = 'No history yet — figures appear after the first nightly run.';

function deltaPill(t: Tile, fmt: (n: number) => string = String): StatPill | null {
  if (t.delta28d === null || t.delta28d === 0) return null;
  const up = t.delta28d > 0;
  return { text: `${up ? '+' : '−'}${fmt(Math.abs(t.delta28d))}`, tone: up ? 'up' : 'down' };
}

/** Non-operators get the tools' permission_denied → 404 (callTool). NULL series values stay NULL (chart gaps). */
export default async function PlatformOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseRange((await searchParams).range);
  const { ctx } = await requireContext();
  const [overview, activity] = await Promise.all([
    callTool<Overview>(ctx, 'platform_overview', { range }),
    callTool<ActivityPage>(ctx, 'list_platform_activity', { limit: 20 }),
  ]);
  const { tiles, series } = overview;
  const period = range === '12m' ? 'month' : 'week';
  const labels = series.map((p) => (period === 'month' ? p.start.slice(0, 7) : p.start));
  const col = (k: keyof Omit<Point, 'start'>) => series.map((p) => p[k]);
  const hasData = series.some((p) => [p.agencies, p.clientsActive, p.seats, p.wau, p.spendUsd].some((v) => v !== null));
  const chart = (title: string, s: { key: string; name: string; points: (number | null)[] }[], valueLabel: string, fmt?: (n: number) => string) => (
    <section className={cardCls}>
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3">
        {hasData ? <LineChart title={title} labels={labels} series={s} valueLabel={valueLabel} period={period} formatValue={fmt} /> : <p className="text-sm text-muted-foreground">{EMPTY}</p>}
      </div>
    </section>
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Platform overview</h1>
        <RangeToggle current={range} basePath="/platform" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-5">
        <StatCard title="Agencies" value={String(tiles.agencies.value)} pill={deltaPill(tiles.agencies)} hint="Last 28 days" />
        <StatCard title="Active clients" value={String(tiles.clientsActive.value)} pill={deltaPill(tiles.clientsActive)} hint="Last 28 days" />
        <StatCard title="Seats" value={String(tiles.seats.value)} pill={deltaPill(tiles.seats)} hint="Last 28 days" />
        <StatCard title="Weekly active users" value={String(tiles.wau.value)} pill={deltaPill(tiles.wau)} hint="Last 28 days" />
        <StatCard title="Spend this month" value={formatUsd(tiles.spendMonthUsd.value)} pill={deltaPill(tiles.spendMonthUsd, formatUsd)} hint="Last 28 days" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {chart('Agencies and active clients', [
          { key: 'clientsActive', name: 'Active clients', points: col('clientsActive') },
          { key: 'agencies', name: 'Agencies', points: col('agencies') },
        ], 'total')}
        {chart('Seats and weekly active users', [
          { key: 'seats', name: 'Seats', points: col('seats') },
          { key: 'wau', name: 'Weekly active users', points: col('wau') },
        ], 'total')}
        {chart('Spend', [{ key: 'spendUsd', name: 'Spend', points: col('spendUsd') }], 'spend', formatUsd)}
        <section className={cardCls}>
          <h2 className="font-semibold">Recent activity</h2>
          <div className="mt-3">
            <ActivityFeed initial={activity} loadMore={loadMoreActivity} />
          </div>
        </section>
      </div>
    </>
  );
}
