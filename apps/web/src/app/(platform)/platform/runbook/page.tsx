import { platformRole } from '@cs/tools';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { RunbookEditor } from '@/components/runbook/runbook-editor';
import type { RunbookData } from '@/components/runbook/types';
import { requireOperatorContext } from '@/server/current-viewer';
import { PAGE_COPY } from '@/help/copy';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { platformRunbookAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Runbook' };

const HELP_KEY = 'page:platform.runbook';
const COPY = PAGE_COPY['platform.runbook'];

/** Phase 14b: the standard runbook every agency starts from. Operators only (a refusal is a 404); owners and staff edit, viewers read. */
export default async function PlatformRunbookPage() {
  const { ctx } = await requireOperatorContext();
  const [data, role, guides] = await Promise.all([
    callTool<RunbookData>(ctx, 'get_runbook', { owner: { level: 'platform' } }),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
    helpGuides(ctx, 'platform'),
  ]);
  return (
    <>
      <PageHeader
        title="Runbook"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Runbook' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'About the standard runbook', tip: 'platform.runbook.standard' },
          { label: 'About updates', tip: 'platform.runbook.updates' },
          { label: 'Who can edit', tip: 'platform.runbook.edit' },
        ]}
      />
      <RunbookEditor data={data} canEdit={role === 'owner' || role === 'staff'} action={platformRunbookAction} />
    </>
  );
}
