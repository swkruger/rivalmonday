import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { RunbookEditor } from '@/components/runbook/runbook-editor';
import type { RunbookData } from '@/components/runbook/types';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { agencyRunbookAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Runbook' };

const HELP_KEY = 'page:agency.settings.runbook';
const COPY = PAGE_COPY['agency.settings.runbook'];

export default async function AgencyRunbookPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [data, guides] = await Promise.all([callTool<RunbookData>(ctx, 'get_runbook', { owner: { level: 'agency' } }), helpGuides(ctx, 'agency')]);
  return (
    <>
      <PageHeader
        title="Runbook"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Runbook' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Sections', tip: 'agency.settings.runbook.sections' },
          { label: 'Badges', tip: 'agency.settings.runbook.badges' },
          { label: 'Updates', tip: 'agency.settings.runbook.updates' },
          { label: 'Editing', tip: 'agency.settings.runbook.edit' },
          { label: 'Clients', tip: 'agency.settings.runbook.clients' },
        ]}
      />
      <RunbookEditor data={data} canEdit={ctx.role === 'agency_admin'} action={agencyRunbookAction} />
    </>
  );
}
