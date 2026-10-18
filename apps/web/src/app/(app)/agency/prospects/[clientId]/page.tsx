import { isAgencyRole } from '@cs/core';
import type { ClientProfile, ProspectReportView, TrackedCompetitor } from '@cs/tools';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { PageHeader } from '@/components/page-header';
import { WriteGuard } from '@/components/read-only';
import { ProspectLandscape } from '@/components/prospect-landscape';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { convertAction, runSnapshotAction } from './actions';
import { ConvertButton } from './convert-button';
import { SnapshotControls } from './snapshot-controls';

export const dynamic = 'force-dynamic';

/** One profile read per request, shared by the tab title and the page. */
const loadProfile = cache(async (clientId: string) => {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  return callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
});

export async function generateMetadata({ params }: { params: Promise<{ clientId: string }> }): Promise<Metadata> {
  return { title: (await loadProfile((await params).clientId)).name };
}

export default async function ProspectHubPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [profile, competitors, { report }] = await Promise.all([
    loadProfile(clientId),
    callTool<{ items: TrackedCompetitor[]; limit: number }>(ctx, 'list_client_competitors', { clientId }),
    callTool<{ report: ProspectReportView | null }>(ctx, 'get_prospect_report', { clientId }),
  ]);
  // A converted prospect's hub no longer applies — the client's own pages take over.
  if (profile.status === 'active') redirect(`/c/${clientId}`);

  const blockers: string[] = [];
  if (profile.keywords.length === 0) blockers.push('Add at least one search keyword');
  if (!profile.serviceArea) blockers.push('Set a service area');
  if (competitors.items.length === 0) blockers.push('Pick at least one competitor');
  const canRun = blockers.length === 0;

  return (
    <>
      <PageHeader
        title={profile.name}
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Prospects', href: '/agency/prospects' }, { label: profile.name }]}
        description="Find their competitors, run a one-off snapshot, and share the landscape. Nothing is monitored until you convert them."
      />

      <div className="rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="font-semibold">1. Profile</h2>
        <p className="mt-1 text-muted-foreground">
          {profile.keywords.length > 0 ? `${profile.keywords.length} keyword${profile.keywords.length === 1 ? '' : 's'}` : 'No keywords yet'}
          {' · '}
          {profile.serviceArea ? 'Service area set' : 'No service area yet'}
        </p>
        <Link href={`/c/${clientId}/settings/profile`} className="mt-2 inline-block font-semibold text-primary-soft-text">Edit business profile</Link>
      </div>

      <div className="rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="font-semibold">2. Competitors</h2>
        <p className="mt-1 text-muted-foreground">
          {competitors.items.length} of {competitors.limit}
          {competitors.items.length > 0 ? ` — ${competitors.items.map((c) => c.name).join(', ')}` : ''}
        </p>
        <Link href={`/c/${clientId}/competitors`} className="mt-2 inline-block font-semibold text-primary-soft-text">Find and pick competitors</Link>
      </div>

      <div className="rounded-[14px] bg-surface p-6 shadow-card">
        <h2 className="font-semibold">3. Snapshot</h2>
        <p className="mt-1 text-muted-foreground">≈ $0.10–0.15 per snapshot</p>
        <SnapshotControls clientId={clientId} report={report} canRun={canRun} blockers={blockers} action={runSnapshotAction} />
      </div>

      {report?.status === 'ready' && report.data && (
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="font-semibold">Landscape</h2>
          <ProspectLandscape data={report.data} />
        </div>
      )}

      <WriteGuard>
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h2 className="font-semibold">4. Convert</h2>
          <p className="mt-1 text-muted-foreground">Converting starts weekly monitoring, alerts and briefs for this business.</p>
          <ConvertButton clientId={clientId} action={convertAction} canUpgrade={ctx.role === 'agency_admin'} />
        </div>
      </WriteGuard>
    </>
  );
}
