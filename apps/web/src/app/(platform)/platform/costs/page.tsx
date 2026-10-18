import { PageHeader } from '@/components/page-header';
import { requireOperatorContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { CostItemDialog } from './_components/cost-item-dialog';
import { CostItemsTable } from './_components/cost-items-table';
import { MonthlyChart } from './_components/monthly-chart';
import { RefreshButton } from './_components/refresh-button';
import { ServicesTable } from './_components/services-table';
import { SummaryCards } from './_components/summary-cards';
import type { CostsData } from './_components/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Costs' };

const card = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';

/** Owners only: the tool's `permission_denied` becomes a 404 in `callTool`. */
export default async function PlatformCostsPage() {
  const { ctx } = await requireOperatorContext();
  const data = await callTool<CostsData>(ctx, 'list_platform_costs', {});
  return (
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5">
      <PageHeader
        title="Costs"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Costs' }]}
        description="What it costs to run Rival Monday. API balances refresh daily at 06:00 UTC."
        actions={<RefreshButton refreshQueued={data.refreshQueued} />}
      />
      <SummaryCards summary={data.summary} />
      <section className={card}>
        <h2 className="mb-3 font-semibold">Services</h2>
        <ServicesTable services={data.services} now={new Date()} />
      </section>
      <section className={card}>
        <h2 className="font-semibold">Monthly spend</h2>
        <p className="mb-3 text-sm text-muted-foreground">Monthly spend (approximate: balance services are estimated from daily readings)</p>
        <MonthlyChart months={data.months} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Manual costs</h2>
          <CostItemDialog />
        </div>
        <CostItemsTable items={data.items} />
      </section>
    </div>
  );
}
