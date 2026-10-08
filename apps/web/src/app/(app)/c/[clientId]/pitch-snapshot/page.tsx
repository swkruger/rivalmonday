import { isAgencyRole } from '@cs/core';
import type { ClientProfile, ProspectReportView } from '@cs/tools';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProspectLandscape } from '@/components/prospect-landscape';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

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
      <div>
        <Link href={`/c/${clientId}`} className="text-sm font-semibold text-primary-soft-text">← Overview</Link>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight">Pitch snapshot — {profile.name}</h1>
        <p className="mt-1 text-muted-foreground">
          The landscape we showed before {profile.name} became a client ({(report.finishedAt ?? report.createdAt).slice(0, 10)}).
        </p>
      </div>
      <div className="rounded-[14px] bg-surface p-6 shadow-card">
        <ProspectLandscape data={report.data} />
      </div>
    </>
  );
}
