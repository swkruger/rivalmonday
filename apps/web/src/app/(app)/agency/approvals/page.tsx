import { isAgencyRole } from '@cs/core';
import type { BriefQueueRow } from '@cs/tools';
import { StatusChip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { formatWeekOf } from '@/lib/format';
import { BRIEF_STATUS, labelFor } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Approvals' };

const HELP_KEY = 'page:agency.approvals';
const COPY = PAGE_COPY['agency.approvals'];

export default async function ApprovalsPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [{ items }, guides] = await Promise.all([callTool<{ items: BriefQueueRow[] }>(ctx, 'list_brief_queue', {}), helpGuides(ctx, 'agency')]);

  return (
    <>
      <PageHeader
        title="Approvals"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Approvals' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      {items.length > 0 && !items.some((r) => r.status === 'ready') && (
        <p role="status" className="text-sm text-ink">{COPY.empty.nothingWaiting.title}. {COPY.empty.nothingWaiting.body}</p>
      )}
      {items.length === 0 ? (
        <EmptyState title={COPY.empty.noBriefs.title} body={COPY.empty.noBriefs.body} guideAnchor="how-to-use-it" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Week of</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5">Status <HelpTip tip="agency.approvals.status" /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5">Items <HelpTip tip="agency.approvals.items" /></span>
              </TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.briefId}>
                <TableCell>
                  <Link href={`/agency/approvals/${row.briefId}`} className="font-semibold text-primary-soft-text">
                    {row.clientName}
                  </Link>
                </TableCell>
                <TableCell>{formatWeekOf(row.deliveryDate, { tz: 'UTC' })}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip tone={labelFor(BRIEF_STATUS, row.status).tone}>{labelFor(BRIEF_STATUS, row.status).label}</StatusChip>
                    {row.kind === 'quiet' && <StatusChip tone="neutral">Quiet week</StatusChip>}
                  </div>
                </TableCell>
                <TableCell>
                  {row.activeItems} items · {row.droppedItems} removed
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {row.touched && <StatusChip tone="neutral">Edited</StatusChip>}
                    {row.autoSend && <StatusChip tone="neutral">Auto-send</StatusChip>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
