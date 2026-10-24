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

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Health' };

const card = 'min-w-0 rounded-[14px] bg-surface p-6 shadow-card';
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
    <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5">
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
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Spend guard</h2>
          <HelpTip tip="platform.health.spendGuard" />
        </div>
        <SpendGuardPanel data={guard} canReset={role === 'owner' || role === 'staff'} tz={tz} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Worker</h2>
          <HelpTip tip="platform.health.worker" />
        </div>
        <WorkerTable worker={data.worker} now={now} tz={tz} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Queues</h2>
          <HelpTip tip="platform.health.queues" />
        </div>
        <QueuesTable queues={data.queues} queueError={data.queueError} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Vendors</h2>
          <HelpTip tip="platform.health.vendors" />
        </div>
        <VendorsTable vendors={data.vendors} now={now} tz={tz} />
      </section>
      <section className={card}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Sources</h2>
          <HelpTip tip="platform.health.sources" />
        </div>
        <SourcesTable sources={data.sources} now={now} tz={tz} />
      </section>
    </div>
  );
}
