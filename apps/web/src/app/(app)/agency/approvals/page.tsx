import { isAgencyRole } from '@cs/core';
import type { BriefQueueRow } from '@cs/tools';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  ready: 'Needs review',
  approved: 'Approved',
  sent: 'Sent',
  failed: 'Failed — retrying',
  generating: 'Drafting',
};

export default async function ApprovalsPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { items } = await callTool<{ items: BriefQueueRow[] }>(ctx, 'list_brief_queue', {});

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Approval queue</h1>
      <p className="text-muted-foreground">Friday drafts each brief on Thursday night. Clients set to auto-send get untouched briefs Monday 07:00.</p>
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
