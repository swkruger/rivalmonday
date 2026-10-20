import { isAgencyRole } from '@cs/core';
import type { ProspectRow } from '@cs/tools';
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { WriteGuard } from '@/components/read-only';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { relativeTime } from '@/server/format';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Prospects' };

const HELP_KEY = 'page:agency.prospects';
const COPY = PAGE_COPY['agency.prospects'];

function isReady(row: ProspectRow): boolean {
  return row.keywords > 0 && row.hasServiceArea && row.competitors > 0;
}

export default async function ProspectsPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [{ items }, guides] = await Promise.all([callTool<{ items: ProspectRow[] }>(ctx, 'list_prospects', {}), helpGuides(ctx, 'agency')]);
  const now = new Date();
  const canAdd = ctx.clientScope === 'all';

  return (
    <>
      <PageHeader
        title="Prospects"
        breadcrumb={[{ label: 'Agency', href: '/agency' }, { label: 'Prospects' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          canAdd && (
            <WriteGuard>
              <Button asChild>
                <Link href="/agency/prospects/new">New prospect</Link>
              </Button>
            </WriteGuard>
          )
        }
      />

      {items.length === 0 ? (
        canAdd ? (
          <EmptyState
            title={COPY.empty.noProspects.title}
            body={COPY.empty.noProspects.body}
            action={
              <WriteGuard>
                <Link href="/agency/prospects/new" className="font-semibold text-primary-soft-text">
                  New prospect
                </Link>
              </WriteGuard>
            }
          />
        ) : (
          <EmptyState title={COPY.empty.noProspectsScoped.title} body={COPY.empty.noProspectsScoped.body} />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Competitors</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5">Ready? <HelpTip tip="agency.prospects.ready" /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1.5">Snapshot <HelpTip tip="agency.prospects.snapshot" /></span>
              </TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.clientId}>
                <TableCell>
                  <Link href={`/agency/prospects/${row.clientId}`} className="font-semibold text-primary-soft-text">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell>{row.competitors}</TableCell>
                <TableCell>{isReady(row) ? '✓' : 'needs setup'}</TableCell>
                <TableCell>{row.report ? <Badge variant={row.report.status === 'ready' ? 'secondary' : row.report.status === 'failed' ? 'destructive' : 'outline'}>{row.report.status}</Badge> : '—'}</TableCell>
                <TableCell>{relativeTime(row.createdAt, now)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
