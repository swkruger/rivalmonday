import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { AiByVerticalTable } from './_components/ai-by-vertical-table';
import { CostItemDialog } from './_components/cost-item-dialog';
import { CostItemsTable } from './_components/cost-items-table';
import { MonthlyChart } from './_components/monthly-chart';
import { RefreshButton } from './_components/refresh-button';
import { ServicesTable } from './_components/services-table';
import { type GuardSettings, SpendGuardSettings } from './_components/spend-guard-settings';
import { SummaryCards } from './_components/summary-cards';
import type { CostsData } from './_components/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Costs' };

const card = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';
const HELP_KEY = 'page:platform.costs';
const COPY = PAGE_COPY['platform.costs'];

/** Owners only: the tool's `permission_denied` becomes a 404 in `callTool`. */
export default async function PlatformCostsPage() {
  const { ctx } = await requireOperatorContext();
  const [data, guard, guides] = await Promise.all([
    callTool<CostsData>(ctx, 'list_platform_costs', {}),
    callTool<{ settings: GuardSettings }>(ctx, 'get_spend_guard', {}),
    helpGuides(ctx, 'platform'),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5">
      <PageHeader
        title="Costs"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Costs' }]}
        description={<HelpText text={COPY.description} />}
        actions={<RefreshButton refreshQueued={data.refreshQueued} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'About projected spend', tip: 'platform.costs.projected' },
          { label: 'About low balance warnings', tip: 'platform.costs.low' },
        ]}
      />
      <SummaryCards summary={data.summary} />
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Services</h2>
          <HelpTip tip="platform.costs.services" />
        </div>
        <ServicesTable services={data.services} now={new Date()} />
      </section>
      <section className={card}>
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold">Monthly spend</h2>
          <HelpTip tip="platform.costs.monthly" />
        </div>
        <p className="mb-3 text-sm text-muted-foreground">Monthly spend (approximate: balance services are estimated from daily readings)</p>
        <MonthlyChart months={data.months} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">AI by business type (last 30 days)</h2>
          <HelpTip tip="platform.costs.ai" />
        </div>
        <AiByVerticalTable rows={data.aiByVertical} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Limits &amp; spike guard</h2>
          <HelpTip tip="platform.costs.limits" />
        </div>
        <SpendGuardSettings settings={guard.settings} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold">Manual costs</h2>
            <HelpTip tip="platform.costs.manual" />
          </div>
          <CostItemDialog />
        </div>
        <CostItemsTable items={data.items} />
      </section>
    </div>
  );
}
