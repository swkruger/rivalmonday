import { HairlineCell, HairlineGrid, Section } from '@cs/ui';
import { formatMoney } from '@/lib/format';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { StatStrip } from '@/components/stat-strip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { loadMoreActivity } from './actions';
import { ActivityFeed, type ActivityPage } from './_components/activity-feed';
import { deltaPill, PlatformCharts, type Point, type Tile } from './_components/overview-charts';
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
  const [overview, activity, guides, tz] = await Promise.all([
    callTool<Overview>(ctx, 'platform_overview', { range }),
    callTool<ActivityPage>(ctx, 'list_platform_activity', { limit: 20 }),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
  ]);
  const { tiles, series } = overview;
  const traceLabel = range === '12m' ? 'Last 12 months' : 'Last 12 weeks';
  return (
    <>
      <PageHeader
        title="Overview"
        description={<HelpText text={COPY.description} />}
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
      <StatStrip
        items={[
          { title: 'Agencies', value: String(tiles.agencies.value), pill: deltaPill(tiles.agencies), hint: 'Last 28 days', trace: series.map((p) => p.agencies), traceLabel },
          { title: 'Active clients', value: String(tiles.clientsActive.value), pill: deltaPill(tiles.clientsActive), hint: 'Last 28 days', trace: series.map((p) => p.clientsActive), traceLabel },
          { title: 'Seats', value: String(tiles.seats.value), pill: deltaPill(tiles.seats), hint: 'Last 28 days', trace: series.map((p) => p.seats), traceLabel },
          { title: 'Weekly active users', value: String(tiles.wau.value), pill: deltaPill(tiles.wau), hint: 'Last 28 days', trace: series.map((p) => p.wau), traceLabel },
          { title: 'Spend this month', value: formatMoney(tiles.spendMonthUsd.value, { cents: true }), pill: deltaPill(tiles.spendMonthUsd, (n: number) => formatMoney(n, { cents: true })), hint: 'Last 28 days', trace: series.map((p) => p.spendUsd), traceLabel: range === '12m' ? 'Spend per month, last 12 months' : 'Spend per week, last 12 weeks' },
        ]}
      />
      <HairlineGrid cols={2}>
        <PlatformCharts series={series} range={range} includeAgencies rangeToggle={<RangeToggle current={range} basePath="/platform" />} />
        <HairlineCell>
          <Section title="Recent activity">
            <ActivityFeed initial={activity} loadMore={loadMoreActivity} tz={tz} />
          </Section>
        </HairlineCell>
      </HairlineGrid>
    </>
  );
}
