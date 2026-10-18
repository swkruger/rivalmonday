import { isAgencyRole } from '@cs/core';
import type { ClientProfile, ProspectReportView } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientCrumbs } from '@/components/client-crumbs';
import { PageHeader } from '@/components/page-header';
import { ProspectLandscape } from '@/components/prospect-landscape';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pitch snapshot' };

/** Agency-only: the landscape shown to this business before it became a client (5b-2 Minor 2 carry-over). */
export default async function PitchSnapshotPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [profile, { report }] = await Promise.all([
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    callTool<{ report: ProspectReportView | null }>(ctx, 'get_prospect_report', { clientId }),
  ]);
  if (!report || report.status !== 'ready' || !report.data) notFound();
  return (
    <>
      {/* The breadcrumb's client crumb is the way back to the Overview (it replaces the old "← Overview" link). */}
      <PageHeader
        title="Pitch snapshot"
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, 'Pitch snapshot')}
        description={`The landscape we showed before ${profile.name} became a client (${(report.finishedAt ?? report.createdAt).slice(0, 10)}).`}
      />
      <div className="rounded-[14px] bg-surface p-6 shadow-card">
        <ProspectLandscape data={report.data} />
      </div>
    </>
  );
}
