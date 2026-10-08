import { isAgencyRole } from '@cs/core';
import type { ProspectRow } from '@cs/tools';
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { relativeTime } from '@/server/format';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

function isReady(row: ProspectRow): boolean {
  return row.keywords > 0 && row.hasServiceArea && row.competitors > 0;
}

export default async function ProspectsPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { items } = await callTool<{ items: ProspectRow[] }>(ctx, 'list_prospects', {});
  const now = new Date();
  const canAdd = ctx.clientScope === 'all';

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Prospects</h1>
          <p className="mt-1 text-muted-foreground">Businesses you’re pitching. A snapshot shows how they stack up locally — no monitoring until they sign.</p>
        </div>
        {canAdd && (
          <Button asChild>
            <Link href="/agency/prospects/new">New prospect</Link>
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          No prospects yet.{' '}
          {canAdd && (
            <Link href="/agency/prospects/new" className="font-semibold text-primary-soft-text">
              New prospect
            </Link>
          )}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Competitors</TableHead>
              <TableHead>Ready?</TableHead>
              <TableHead>Snapshot</TableHead>
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
