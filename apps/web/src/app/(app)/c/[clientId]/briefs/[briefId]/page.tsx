import { isAgencyRole } from '@cs/core';
import type { BriefDetail } from '@cs/tools';
import { notFound } from 'next/navigation';
import { BriefView } from '@/components/views/brief-view';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export default async function BriefPage({ params }: { params: Promise<{ clientId: string; briefId: string }> }) {
  const { clientId, briefId } = await params;
  const { ctx } = await requireContext();
  const brief = await callTool<BriefDetail>(ctx, 'get_brief', { briefId });
  if (brief.clientId !== clientId) notFound();
  return <BriefView brief={brief} agency={isAgencyRole(ctx.role)} />;
}
