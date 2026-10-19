import { isAgencyRole } from '@cs/core';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { RunbookEditor } from '@/components/runbook/runbook-editor';
import type { RunbookData } from '@/components/runbook/types';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { agencyRunbookAction } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Runbook' };

export default async function AgencyRunbookPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const data = await callTool<RunbookData>(ctx, 'get_runbook', { owner: { level: 'agency' } });
  return (
    <>
      <PageHeader
        title="Runbook"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Runbook' }]}
        description="How Friday words its recommendations, which starting-point rules apply and the settings behind them. Clients start from this runbook and can customise their own copy."
      />
      <RunbookEditor data={data} canEdit={ctx.role === 'agency_admin'} action={agencyRunbookAction} />
    </>
  );
}
