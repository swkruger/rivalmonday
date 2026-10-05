import { isAgencyRole } from '@cs/core';
import type { AlertDetail } from '@cs/tools';
import { notFound } from 'next/navigation';
import { AlertView } from '@/components/views/alert-view';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export default async function AlertPage({ params }: { params: Promise<{ clientId: string; alertId: string }> }) {
  const { clientId, alertId } = await params;
  const { ctx } = await requireContext();
  const alert = await callTool<AlertDetail>(ctx, 'get_alert', { alertId });
  if (alert.clientId !== clientId) notFound();
  return <AlertView alert={alert} agency={isAgencyRole(ctx.role)} />;
}
