import { Section } from '@cs/ui';
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
import { SummaryStrip } from './_components/summary-cards';
import type { CostsData } from './_components/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Costs' };

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
    <>
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
      <SummaryStrip summary={data.summary} months={data.months} />
      <Section title="Services" titleAside={<HelpTip tip="platform.costs.services" />}>
        <ServicesTable services={data.services} now={new Date()} />
      </Section>
      <Section
        title="Monthly spend"
        titleAside={<HelpTip tip="platform.costs.monthly" />}
        description="Monthly spend (approximate: balance services are estimated from daily readings)"
        ruled
      >
        <MonthlyChart months={data.months} />
      </Section>
      <Section title="AI by business type (last 30 days)" titleAside={<HelpTip tip="platform.costs.ai" />} ruled>
        <AiByVerticalTable rows={data.aiByVertical} />
      </Section>
      <Section title="Limits & spike guard" titleAside={<HelpTip tip="platform.costs.limits" />} ruled>
        <SpendGuardSettings settings={guard.settings} />
      </Section>
      <Section title="Manual costs" titleAside={<HelpTip tip="platform.costs.manual" />} actions={<CostItemDialog />} ruled>
        <CostItemsTable items={data.items} />
      </Section>
    </>
  );
}
