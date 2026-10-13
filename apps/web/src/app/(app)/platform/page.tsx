import { StatCard } from '@/components/stat-card';
import { requireOperatorContext } from '@/server/current-viewer';
import { formatUsd } from '@/server/format';
import { callTool } from '@/server/tools';
import { loadMoreActivity } from './actions';
import { ActivityFeed, type ActivityPage } from './_components/activity-feed';
import { cardCls, deltaPill, PlatformCharts, type Point, type Tile } from './_components/overview-charts';
import { parseRange, RangeToggle } from './_components/range-toggle';

export const dynamic = 'force-dynamic';

interface Overview {
  tiles: { agencies: Tile; clientsActive: Tile; seats: Tile; wau: Tile; spendMonthUsd: Tile };
  series: Point[];
}

/** Non-operators get the tools' permission_denied → 404 (callTool). NULL series values stay NULL (chart gaps). */
export default async function PlatformOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseRange((await searchParams).range);
  const { ctx } = await requireOperatorContext();
  const [overview, activity] = await Promise.all([
    callTool<Overview>(ctx, 'platform_overview', { range }),
    callTool<ActivityPage>(ctx, 'list_platform_activity', { limit: 20 }),
  ]);
  const { tiles, series } = overview;
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
        <PlatformCharts series={series} range={range} includeAgencies />
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
