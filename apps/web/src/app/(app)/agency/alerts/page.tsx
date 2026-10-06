import { isAgencyRole } from '@cs/core';
import type { AlertQueueRow } from '@cs/tools';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { AlertList } from './alert-controls';

export const dynamic = 'force-dynamic';

export default async function AlertReviewPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { items } = await callTool<{ items: AlertQueueRow[] }>(ctx, 'list_alert_queue', {});

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Alert review</h1>
      <p className="text-muted-foreground">High-priority alerts (score 70+) for clients set to “after my check”. Unreviewed alerts expire after 7 days.</p>
      <AlertList items={items} />
    </>
  );
}
