import { isAgencyRole } from '@cs/core';
import type { PortfolioRow } from '@cs/tools';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PressureBadge } from '@/components/pressure-badge';
import { requireContext } from '@/server/current-viewer';
import { relativeTime } from '@/server/format';
import { callTool } from '@/server/tools';

const VERTICAL_LABELS: Record<string, string> = { hvac_plumbing: 'HVAC & plumbing', dental: 'Dental' };

/** True when a client needs attention now — pulled to the top of the portfolio table. */
function isUrgent(row: PortfolioRow): boolean {
  return row.alertsPending > 0 || row.briefToApprove !== null;
}

function sortRows(items: PortfolioRow[]): PortfolioRow[] {
  return [...items].sort((a, b) => {
    const urgent = Number(isUrgent(b)) - Number(isUrgent(a));
    if (urgent !== 0) return urgent;
    const pressure = b.pressure.score - a.pressure.score;
    if (pressure !== 0) return pressure;
    return a.name.localeCompare(b.name);
  });
}

export default async function AgencyPortfolioPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const { items } = await callTool<{ items: PortfolioRow[] }>(ctx, 'get_portfolio', {});
  const now = new Date();
  const canAddClient = ctx.clientScope === 'all';
  const rows = sortRows(items);
  const alertsWaiting = items.reduce((sum, r) => sum + r.alertsPending, 0);
  const briefsToApprove = items.filter((r) => r.briefToApprove !== null).length;
  const highPressure = items.filter((r) => r.pressure.level === 'high').length;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Portfolio</h1>
          <p className="mt-1 text-muted-foreground">Every client at a glance — what needs you today.</p>
        </div>
        {canAddClient && (
          <Button asChild>
            <Link href="/agency/clients/new">Add client</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">Clients</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{items.length}</div>
        </div>
        <Link href="/agency/alerts" className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">Alerts waiting</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{alertsWaiting}</div>
        </Link>
        <Link href="/agency/approvals" className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">Briefs to approve</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{briefsToApprove}</div>
        </Link>
        <div className="rounded-[14px] bg-surface p-6 shadow-card">
          <h3 className="text-sm font-semibold">High pressure</h3>
          <div className="mt-2 text-[34px] font-extrabold tracking-tight text-secondary">{highPressure}</div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          No clients yet.{' '}
          {canAddClient && (
            <Link href="/agency/clients/new" className="font-semibold text-primary-soft-text">
              Add client
            </Link>
          )}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Pressure</TableHead>
              <TableHead>Alerts</TableHead>
              <TableHead>Brief</TableHead>
              <TableHead>Open actions</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.clientId}>
                <TableCell>
                  <Link href={`/c/${row.clientId}`} className="font-semibold text-primary-soft-text">
                    {row.name}
                  </Link>
                  <div className="text-muted-ink">{VERTICAL_LABELS[row.verticalId] ?? row.verticalId}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <PressureBadge score={row.pressure.score} level={row.pressure.level} />
                    {row.topCompetitor && <span>{row.topCompetitor}</span>}
                  </div>
                  {row.pressure.reasons.length > 0 && <div className="text-muted-ink">{row.pressure.reasons.join(' · ')}</div>}
                </TableCell>
                <TableCell>
                  {row.alertsPending > 0 ? (
                    <Link href="/agency/alerts" className="font-semibold text-primary-soft-text">
                      {row.alertsPending}
                    </Link>
                  ) : (
                    row.alertsPending
                  )}
                  <div className="text-muted-ink">{row.alertsDelivered7d} sent this week</div>
                </TableCell>
                <TableCell>
                  {row.briefToApprove ? (
                    <Link href={`/agency/approvals/${row.briefToApprove.id}`} className="font-semibold text-primary-soft-text">
                      Approve week of {row.briefToApprove.deliveryDate}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/c/${row.clientId}/recommendations`} className="font-semibold text-primary-soft-text">
                    {row.openRecommendations}
                  </Link>
                </TableCell>
                <TableCell>{relativeTime(row.lastActivityAt, now)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
