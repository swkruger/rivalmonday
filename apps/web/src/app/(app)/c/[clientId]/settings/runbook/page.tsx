import { isAgencyRole } from '@cs/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientSettingsCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { RunbookEditor } from '@/components/runbook/runbook-editor';
import type { RunbookData } from '@/components/runbook/types';
import { PAGE_COPY } from '@/help/copy';
import { hasClientSettings } from '@/server/client-settings-nav';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { clientRunbookAction, clientRunbookStatusAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Runbook' };

const HELP_KEY = 'page:client.settings.runbook';
const COPY = PAGE_COPY['client.settings.runbook'];

/** Phase 14b: a client's own runbook (agency roles only; client roles get a 404). Account managers edit within their scope. */
export default async function ClientRunbookPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [data, profile, verticals, settingsLinked, guides] = await Promise.all([
    callTool<RunbookData>(ctx, 'get_runbook', { owner: { level: 'client', clientId } }),
    callTool<{ name: string; verticalId: string }>(ctx, 'get_client_profile', { clientId }),
    verticalOptions(),
    hasClientSettings(clientId),
    helpGuides(ctx, 'client', clientId),
  ]);
  return (
    <>
      <PageHeader
        title="Runbook"
        breadcrumb={clientSettingsCrumbs({ id: clientId, name: profile.name }, 'Runbook', settingsLinked)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Sections', tip: 'client.settings.runbook.sections' },
          { label: 'Badges', tip: 'client.settings.runbook.badges' },
          { label: 'Updates', tip: 'client.settings.runbook.updates' },
          { label: 'Own runbook', tip: 'client.settings.runbook.ownRunbook' },
        ]}
      />
      <RunbookEditor
        data={data}
        canEdit={ctx.role === 'agency_admin' || ctx.role === 'account_manager'}
        action={clientRunbookAction.bind(null, clientId)}
        statusAction={clientRunbookStatusAction.bind(null, clientId)}
        verticalName={verticals.find((v) => v.id === profile.verticalId)?.name}
      />
    </>
  );
}
