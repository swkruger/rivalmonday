import { isAgencyRole } from '@cs/core';
import type { ClientProfile, ProspectReportView, TrackedCompetitor } from '@cs/tools';
import { Section } from '@cs/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { WriteGuard } from '@/components/read-only';
import { ProspectLandscape } from '@/components/prospect-landscape';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { viewerTimeZone } from '@/server/viewer-tz';
import { callTool } from '@/server/tools';
import { convertAction, runSnapshotAction } from './actions';
import { ConvertButton } from './convert-button';
import { SnapshotControls } from './snapshot-controls';

export const dynamic = 'force-dynamic';

const HELP_KEY = 'page:agency.prospects.detail';
const COPY = PAGE_COPY['agency.prospects.detail'];

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
  const [profile, competitors, { report }, guides] = await Promise.all([
    loadProfile(clientId),
    callTool<{ items: TrackedCompetitor[]; limit: number }>(ctx, 'list_client_competitors', { clientId }),
    callTool<{ report: ProspectReportView | null }>(ctx, 'get_prospect_report', { clientId }),
    helpGuides(ctx, 'agency'),
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
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />

      <TipRow
        items={[
          { label: 'Steps', tip: 'agency.prospects.detail.steps' },
          { label: 'Snapshot', tip: 'agency.prospects.detail.snapshot' },
          { label: 'Converting', tip: 'agency.prospects.detail.convert' },
        ]}
      />

      <Section title="1. Profile" as="h2">
        <div>
          <p className="text-muted-ink">
            {profile.keywords.length > 0 ? `${profile.keywords.length} keyword${profile.keywords.length === 1 ? '' : 's'}` : 'No keywords yet'}
            {' · '}
            {profile.serviceArea ? 'Service area set' : 'No service area yet'}
          </p>
          <Link href={`/c/${clientId}/settings/profile`} className="mt-2 inline-block font-semibold text-primary-soft-text">Edit business profile</Link>
        </div>
      </Section>

      <Section title="2. Competitors" as="h2" ruled>
        <div>
          <p className="text-muted-ink">
            {competitors.items.length} of {competitors.limit}
            {competitors.items.length > 0 ? ` — ${competitors.items.map((c) => c.name).join(', ')}` : ''}
          </p>
          <Link href={`/c/${clientId}/competitors`} className="mt-2 inline-block font-semibold text-primary-soft-text">Find and pick competitors</Link>
        </div>
      </Section>

      <Section title="3. Snapshot" as="h2" ruled>
        <div>
          <p className="mb-3 text-muted-ink">≈ $0.10–0.15 per snapshot</p>
          <SnapshotControls clientId={clientId} report={report} canRun={canRun} blockers={blockers} action={runSnapshotAction} />
        </div>
      </Section>

      {report?.status === 'ready' && report.data && (
        <Section title="Landscape" as="h2" ruled>
          <ProspectLandscape data={report.data} timezone={await viewerTimeZone()} />
        </Section>
      )}

      <WriteGuard>
        <Section title="4. Convert" as="h2" ruled description="Converting starts weekly monitoring, alerts and briefs for this business.">
          <ConvertButton clientId={clientId} action={convertAction} canUpgrade={ctx.role === 'agency_admin'} />
        </Section>
      </WriteGuard>
    </>
  );
}
