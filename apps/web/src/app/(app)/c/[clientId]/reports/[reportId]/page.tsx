import type { ClientProfile, ReportDetail, ReportSummary } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { clientCrumbs } from '@/components/client-crumbs';
import { PageHeader } from '@/components/page-header';
import { PrevNext } from '@/components/prev-next';
import { ReportView } from '@/components/views/report-view';
import { requireContext } from '@/server/current-viewer';
import { callTool, tryCallTool } from '@/server/tools';
import { neighbours } from '../../briefs/neighbours';

export const dynamic = 'force-dynamic';

/** One read per request, shared by the tab title and the page. `list_trend_reports` returns every report (one a quarter). */
const loadReport = cache(async (clientId: string, reportId: string) => {
  const { ctx } = await requireContext();
  const [report, profile, list] = await Promise.all([
    callTool<ReportDetail>(ctx, 'get_trend_report', { reportId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    tryCallTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
  ]);
  if (report.clientId !== clientId) notFound();
  return { report, profile, list };
});

const titleOf = (report: ReportDetail) => `Competitor trends — ${report.quarter}`;

export async function generateMetadata({ params }: { params: Promise<{ clientId: string; reportId: string }> }): Promise<Metadata> {
  const { clientId, reportId } = await params;
  return { title: titleOf((await loadReport(clientId, reportId)).report) };
}

/** Spec §2.8: breadcrumb `{client} › Briefs & reports › {quarter}`, Previous / Next by quarter (the list's order). */
export default async function ReportPage({ params }: { params: Promise<{ clientId: string; reportId: string }> }) {
  const { clientId, reportId } = await params;
  const { report, profile, list } = await loadReport(clientId, reportId);
  const { previous, next } = neighbours(list?.items ?? null, report.id, (id) => `/c/${clientId}/reports/${id}`);
  return (
    <>
      <PageHeader
        title={titleOf(report)}
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, { label: 'Briefs & reports', href: `/c/${clientId}/briefs?tab=reports` }, report.quarter)}
      />
      <ReportView report={report} titled={false} />
      <PrevNext previous={previous} next={next} />
    </>
  );
}
