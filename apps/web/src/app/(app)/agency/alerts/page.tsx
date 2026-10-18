import { isAgencyRole } from '@cs/core';
import type { AlertQueueRow } from '@cs/tools';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { AlertList } from './alert-controls';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Alert review' };

export default async function AlertReviewPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { items } = await callTool<{ items: AlertQueueRow[] }>(ctx, 'list_alert_queue', {});

  return (
    <>
      <PageHeader
        title="Alert review"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Alert review' }]}
        description="High-priority alerts (score 70+) for clients set to “after my check”. Unreviewed alerts expire after 7 days."
      />
      <AlertList items={items} />
    </>
  );
}
