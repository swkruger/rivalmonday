import { isAgencyRole } from '@cs/core';
import type { BriefQueueRow } from '@cs/tools';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { STATUS_LABEL } from './status';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Approvals' };

export default async function ApprovalsPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { items } = await callTool<{ items: BriefQueueRow[] }>(ctx, 'list_brief_queue', {});

  return (
    <>
      <PageHeader
        title="Approvals"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Approvals' }]}
        description="Friday drafts each brief on Thursday night. Clients set to auto-send get untouched briefs Monday 07:00."
      />
      {items.length === 0 ? (
        <p className="text-muted-foreground">Nothing to review this week.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Week of</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead />
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
                <TableCell>{row.deliveryDate}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{STATUS_LABEL[row.status] ?? row.status}</Badge>
                    {row.kind === 'quiet' && <Badge variant="outline">Quiet week</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {row.activeItems} items · {row.droppedItems} removed
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {row.touched && <Badge variant="outline">Edited</Badge>}
                    {row.autoSend && <Badge variant="outline">Auto-send</Badge>}
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
