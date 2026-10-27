import { Section } from '@cs/ui';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { platformRole } from '@cs/tools';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { type SpendGuardData, SpendGuardPanel } from './_components/spend-guard-panel';
import { type HealthData, QueuesTable, SourcesTable, VendorsTable, WorkerTable } from './_components/health-tables';
import { ReadinessPanel } from './_components/readiness-panel';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Health' };

const HELP_KEY = 'page:platform.health';
const COPY = PAGE_COPY['platform.health'];

/** Platform operators only: the tool's `permission_denied` becomes a 404 in `callTool`. */
export default async function PlatformHealthPage() {
  const { ctx } = await requireOperatorContext();
  const [data, guard, role, guides, tz] = await Promise.all([
    callTool<HealthData>(ctx, 'get_platform_health', {}),
    callTool<SpendGuardData>(ctx, 'get_spend_guard', {}),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
  ]);
  const now = new Date(data.generatedAt);
  return (
    <>
      <PageHeader
        title="Health"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Health' }]}
        description={<HelpText text={COPY.description} />}
        actions={
          data.sentryUrl ? (
            <a href={data.sentryUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline">Open Sentry</a>
          ) : undefined
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <Section title="Spend guard" titleAside={<HelpTip tip="platform.health.spendGuard" />}>
        <SpendGuardPanel data={guard} canReset={role === 'owner' || role === 'staff'} tz={tz} />
      </Section>
      <Section title="Brief readiness" ruled>
        <ReadinessPanel data={data.briefReadiness ?? null} now={now} tz={tz} />
      </Section>
      <Section title="Worker" titleAside={<HelpTip tip="platform.health.worker" />} ruled>
        <WorkerTable worker={data.worker} now={now} tz={tz} />
      </Section>
      <Section title="Queues" titleAside={<HelpTip tip="platform.health.queues" />} ruled>
        <QueuesTable queues={data.queues} queueError={data.queueError} />
      </Section>
      <Section title="Vendors" titleAside={<HelpTip tip="platform.health.vendors" />} ruled>
        <VendorsTable vendors={data.vendors} now={now} tz={tz} />
      </Section>
      <Section title="Sources" titleAside={<HelpTip tip="platform.health.sources" />} ruled>
        <SourcesTable sources={data.sources} now={now} tz={tz} />
      </Section>
    </>
  );
}
