import { isAgencyRole } from '@cs/core';
import type { BriefQueueRow } from '@cs/tools';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { STATUS_LABEL } from './status';

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
