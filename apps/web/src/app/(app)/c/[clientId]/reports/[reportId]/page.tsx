import type { ClientProfile, ReportDetail, ReportSummary } from '@cs/tools';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { clientCrumbs } from '@/components/client-crumbs';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PrevNext } from '@/components/prev-next';
import { ReportView } from '@/components/views/report-view';
import { PAGE_COPY, type TipKey } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import { neighbours } from '../../briefs/neighbours';

export const dynamic = 'force-dynamic';

const HELP_KEY = 'page:client.reports.detail';
const COPY = PAGE_COPY['client.reports.detail'];
/** The report's sections, each with the tip that explains it (shown only when the report has data). */
const TIPS: readonly { label: string; tip: TipKey }[] = [
  { label: 'Business table', tip: 'client.reports.detail.businesses' },
  { label: 'Changes by type', tip: 'client.reports.detail.changes' },
  { label: 'Quarter moves', tip: 'client.reports.detail.moves' },
  { label: 'Totals', tip: 'client.reports.detail.activity' },
];

/** One read per request, shared by the tab title and the page. `list_trend_reports` returns every report (one a quarter). */
const loadReport = cache(async (clientId: string, reportId: string) => {
  const { ctx } = await requireContext();
  const [report, profile, list] = await Promise.all([
    callTool<ReportDetail>(ctx, 'get_trend_report', { reportId }),
    callTool<ClientProfile>(ctx, 'get_client_profile', { clientId }),
    tryCallTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
  ]);
  if (report.clientId !== clientId) notFound();
  return { ctx, report, profile, list };
});

const titleOf = (report: ReportDetail) => `Competitor trends — ${report.quarter}`;

export async function generateMetadata({ params }: { params: Promise<{ clientId: string; reportId: string }> }): Promise<Metadata> {
  const { clientId, reportId } = await params;
  return { title: titleOf((await loadReport(clientId, reportId)).report) };
}

/** Spec §2.8: breadcrumb `{client} › Briefs & reports › {quarter}`, Previous / Next by quarter (the list's order). */
export default async function ReportPage({ params }: { params: Promise<{ clientId: string; reportId: string }> }) {
  const { clientId, reportId } = await params;
  const { ctx, report, profile, list } = await loadReport(clientId, reportId);
  const guides = await helpGuides(ctx, 'client', clientId);
  const { previous, next } = neighbours(list?.items ?? null, report.id, (id) => `/c/${clientId}/reports/${id}`);
  return (
    <>
      <PageHeader
        title={titleOf(report)}
        breadcrumb={clientCrumbs({ id: clientId, name: profile.name }, { label: 'Briefs & reports', href: `/c/${clientId}/briefs?tab=reports` }, report.quarter)}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {report.data != null && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {TIPS.map((t) => (
            <span key={t.tip} className="inline-flex items-center gap-1.5">
              {t.label}
              <HelpTip tip={t.tip} />
            </span>
          ))}
        </div>
      )}
      <ReportView report={report} titled={false} />
      <PrevNext previous={previous} next={next} />
    </>
  );
}
