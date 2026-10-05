import type { ReportDetail } from '@cs/tools';
import { notFound } from 'next/navigation';
import { ReportView } from '@/components/views/report-view';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export default async function ReportPage({ params }: { params: Promise<{ clientId: string; reportId: string }> }) {
  const { clientId, reportId } = await params;
  const { ctx } = await requireContext();
  const report = await callTool<ReportDetail>(ctx, 'get_trend_report', { reportId });
  if (report.clientId !== clientId) notFound();
  return <ReportView report={report} />;
}
