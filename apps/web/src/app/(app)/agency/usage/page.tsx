import { isAgencyRole } from '@cs/core';
import type { UsageRow } from '@cs/tools';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SpendBadge } from '@/components/spend-badge';
import { requireContext } from '@/server/current-viewer';
import { formatUsd } from '@/server/format';
import { callTool } from '@/server/tools';
import { saveLimitsAction } from './actions';
import { LimitsForm } from './limits-form';

export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { month, items, agencyLevelUsd } = await callTool<{ month: string; items: UsageRow[]; agencyLevelUsd: number | null }>(ctx, 'get_usage', {});
  const atWarning = items.filter((r) => r.spend.level === 'warning').length;
  const atOver = items.filter((r) => r.spend.level === 'over').length;

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Usage & limits</h1>
        <p className="mt-1 text-muted-foreground">{`Spend this month (${month}, UTC) — AI and data costs tied to each client.`}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">Near cap</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{atWarning}</div>
        </div>
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">Over cap</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{atOver}</div>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Spend</TableHead>
            <TableHead>Share</TableHead>
            <TableHead>Competitors</TableHead>
            <TableHead>Questions</TableHead>
            {ctx.role === 'agency_admin' && <TableHead>Limits</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.clientId}>
              <TableCell>
                <Link href={row.status === 'prospect' ? `/agency/prospects/${row.clientId}` : `/c/${row.clientId}`} className="font-semibold text-primary-soft-text">
                  {row.name}
                </Link>
                {row.status === 'prospect' && (
                  <Badge variant="outline" className="ml-2">
                    Prospect
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {formatUsd(row.spend.monthToDateUsd)} of {formatUsd(row.spend.capUsd)}
              </TableCell>
              <TableCell>
                <SpendBadge spend={row.spend} />
              </TableCell>
              <TableCell>
                {row.competitors} of {row.competitorLimit}
                {row.competitors > row.competitorLimit && <div className="text-amber-text">Over limit</div>}
              </TableCell>
              <TableCell className="text-muted-ink">Ask arrives in Phase 6</TableCell>
              {ctx.role === 'agency_admin' && (
                <TableCell>
                  <LimitsForm key={row.clientId} action={saveLimitsAction} clientId={row.clientId} clientName={row.name} capUsd={row.spend.capUsd} competitorLimit={row.competitorLimit} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-muted-ink">
        Shared monitoring of competitors (Google profile, reviews, ads) and the intelligence engine’s shared work are not yet split across clients; they’ll be allocated in a later release.
        {agencyLevelUsd !== null && <> Agency-level spend not tied to a client: {formatUsd(agencyLevelUsd)}</>}
      </p>
    </>
  );
}
