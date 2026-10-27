import { isAgencyRole } from '@cs/core';
import type { ClientProfile, ProspectReportView } from '@cs/tools';
import { Section } from '@cs/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { ProspectLandscape } from '@/components/prospect-landscape';
import { PAGE_COPY } from '@/help/copy';
import { formatDate } from '@/lib/format';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pitch snapshot' };

const HELP_KEY = 'page:client.pitch-snapshot';
const COPY = PAGE_COPY['client.pitch-snapshot'];

/** Agency-only: the landscape shown to this business before it became a client (5b-2 Minor 2 carry-over). */
export default async function PitchSnapshotPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [profile, { report }, guides] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ report: ProspectReportView | null }>(ctx, 'get_prospect_report', { clientId }),
    helpGuides(ctx, 'client', clientId),
  ]);
  if (!report || report.status !== 'ready' || !report.data) notFound();
  return (
    <>
      {/* The breadcrumb's client crumb is the way back to the Overview (it replaces the old "← Overview" link). */}
      <PageHeader
        title="Pitch snapshot"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Pitch snapshot')}
        description={
          <>
            <HelpText text={COPY.description} /> {`Generated ${formatDate(report.finishedAt ?? report.createdAt, { tz: profile.timezone })}.`}
          </>
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-ink">
        <span className="inline-flex items-center gap-1.5">
          Figures
          <HelpTip tip="client.pitch-snapshot.figures" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          Map visibility
          <HelpTip tip="client.pitch-snapshot.mapVisibility" />
        </span>
      </div>
      <Section>
        <ProspectLandscape data={report.data} timezone={profile.timezone} />
      </Section>
    </>
  );
}
