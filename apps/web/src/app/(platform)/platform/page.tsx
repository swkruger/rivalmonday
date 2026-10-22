import { formatMoney } from '@/lib/format';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { StatCard } from '@/components/stat-card';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { loadMoreActivity } from './actions';
import { ActivityFeed, type ActivityPage } from './_components/activity-feed';
import { cardCls, deltaPill, PlatformCharts, type Point, type Tile } from './_components/overview-charts';
import { parseRange, RangeToggle } from './_components/range-toggle';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Overview' };

const HELP_KEY = 'page:platform.overview';
const COPY = PAGE_COPY['platform.overview'];

interface Overview {
  tiles: { agencies: Tile; clientsActive: Tile; seats: Tile; wau: Tile; spendMonthUsd: Tile };
  series: Point[];
}

/** Non-operators get the tools' permission_denied → 404 (callTool). NULL series values stay NULL (chart gaps). */
export default async function PlatformOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const range = parseRange((await searchParams).range);
  const { ctx } = await requireOperatorContext();
  const [overview, activity, guides] = await Promise.all([
    callTool<Overview>(ctx, 'platform_overview', { range }),
    callTool<ActivityPage>(ctx, 'list_platform_activity', { limit: 20 }),
    helpGuides(ctx, 'platform'),
  ]);
  const { tiles, series } = overview;
  return (
    <>
      <PageHeader
        title="Overview"
        description={<HelpText text={COPY.description} />}
        actions={<RangeToggle current={range} basePath="/platform" />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'About these figures', tip: 'platform.overview.figures' },
          { label: 'About the change', tip: 'platform.overview.last28' },
          { label: 'About the charts', tip: 'platform.overview.range' },
          { label: 'About the activity', tip: 'platform.overview.activity' },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-5">
        <StatCard title="Agencies" value={String(tiles.agencies.value)} pill={deltaPill(tiles.agencies)} hint="Last 28 days" />
        <StatCard title="Active clients" value={String(tiles.clientsActive.value)} pill={deltaPill(tiles.clientsActive)} hint="Last 28 days" />
        <StatCard title="Seats" value={String(tiles.seats.value)} pill={deltaPill(tiles.seats)} hint="Last 28 days" />
        <StatCard title="Weekly active users" value={String(tiles.wau.value)} pill={deltaPill(tiles.wau)} hint="Last 28 days" />
        <StatCard title="Spend this month" value={formatMoney(tiles.spendMonthUsd.value, { cents: true })} pill={deltaPill(tiles.spendMonthUsd, (n: number) => formatMoney(n, { cents: true }))} hint="Last 28 days" />
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
