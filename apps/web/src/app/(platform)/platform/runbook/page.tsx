import { platformRole } from '@cs/tools';
import { PageHeader } from '@/components/page-header';
import { RunbookEditor } from '@/components/runbook/runbook-editor';
import type { RunbookData } from '@/components/runbook/types';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { platformRunbookAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Runbook' };

/** Phase 14b: the standard runbook every agency starts from. Operators only (a refusal is a 404); owners and staff edit, viewers read. */
export default async function PlatformRunbookPage() {
  const { ctx } = await requireOperatorContext();
  const [data, role] = await Promise.all([
    callTool<RunbookData>(ctx, 'get_runbook', { owner: { level: 'platform' } }),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Runbook"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Runbook' }]}
        description="The standard plays, starting-point rules and settings every agency starts from. Agencies see your changes as updates they can take or keep their own version."
      />
      <RunbookEditor data={data} canEdit={role === 'owner' || role === 'staff'} action={platformRunbookAction} />
    </>
  );
}
