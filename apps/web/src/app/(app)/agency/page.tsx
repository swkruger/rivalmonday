import { isAgencyRole } from '@cs/core';
import type { PortfolioRow } from '@cs/tools';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { WriteGuard } from '@/components/read-only';
import { PressureBadge } from '@/components/pressure-badge';
import { SpendBadge } from '@/components/spend-badge';
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
          <WriteGuard>
            <Button asChild>
              <Link href="/agency/clients/new">Add client</Link>
            </Button>
          </WriteGuard>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        <div className="rounded-[14px] bg-surface p-4 shadow-card sm:p-6">
          <h3 className="text-sm font-semibold">Clients</h3>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight text-secondary sm:mt-2 sm:text-[34px]">{items.length}</div>
        </div>
        <Link href="/agency/alerts" className="rounded-[14px] bg-surface p-4 shadow-card sm:p-6">
          <h3 className="text-sm font-semibold">Alerts waiting</h3>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight text-secondary sm:mt-2 sm:text-[34px]">{alertsWaiting}</div>
        </Link>
        <Link href="/agency/approvals" className="rounded-[14px] bg-surface p-4 shadow-card sm:p-6">
          <h3 className="text-sm font-semibold">Briefs to approve</h3>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight text-secondary sm:mt-2 sm:text-[34px]">{briefsToApprove}</div>
        </Link>
        <div className="rounded-[14px] bg-surface p-4 shadow-card sm:p-6">
          <h3 className="text-sm font-semibold">High pressure</h3>
          <div className="mt-1 text-[28px] font-extrabold tracking-tight text-secondary sm:mt-2 sm:text-[34px]">{highPressure}</div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          No clients yet.{' '}
          {canAddClient && (
            <WriteGuard>
              <Link href="/agency/clients/new" className="font-semibold text-primary-soft-text">
                Add client
              </Link>
            </WriteGuard>
          )}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Below xl (sidebar plus card padding) the seven columns don't fit: one block per client instead of a table that hides most columns. */}
            <ul className="flex flex-col divide-y divide-line xl:hidden">
              {rows.map((row) => (
                <li key={row.clientId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <ClientName row={row} />
                  <Pressure row={row} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                    <Field label="Budget"><SpendBadge spend={row.spend} /></Field>
                    <Field label="Alerts"><Alerts row={row} /></Field>
                    <Field label="Brief"><Brief row={row} /></Field>
                    <Field label="Open actions"><OpenActions row={row} /></Field>
                    <Field label="Last activity">{relativeTime(row.lastActivityAt, now)}</Field>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden xl:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Pressure</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Alerts</TableHead>
                    <TableHead>Brief</TableHead>
                    <TableHead>Open actions</TableHead>
                    <TableHead>Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.clientId}>
                      <TableCell><ClientName row={row} /></TableCell>
                      <TableCell className="whitespace-normal"><Pressure row={row} /></TableCell>
                      <TableCell><SpendBadge spend={row.spend} /></TableCell>
                      <TableCell><Alerts row={row} /></TableCell>
                      <TableCell className="whitespace-normal"><Brief row={row} /></TableCell>
                      <TableCell><OpenActions row={row} /></TableCell>
                      <TableCell>{relativeTime(row.lastActivityAt, now)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ClientName({ row }: { row: PortfolioRow }) {
  return (
    <div>
      <Link href={`/c/${row.clientId}`} className="font-semibold text-primary-soft-text">
        {row.name}
      </Link>
      <div className="text-muted-ink">{VERTICAL_LABELS[row.verticalId] ?? row.verticalId}</div>
    </div>
  );
}

function Pressure({ row }: { row: PortfolioRow }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <PressureBadge score={row.pressure.score} level={row.pressure.level} />
        {row.topCompetitor && <span>{row.topCompetitor}</span>}
      </div>
      {row.pressure.reasons.length > 0 && <div className="text-muted-ink">{row.pressure.reasons.join(' · ')}</div>}
    </div>
  );
}

function Alerts({ row }: { row: PortfolioRow }) {
  return (
    <>
      {row.alertsPending > 0 ? (
        <Link href="/agency/alerts" className="font-semibold text-primary-soft-text">
          {row.alertsPending}
        </Link>
      ) : (
        row.alertsPending
      )}
      <div className="text-muted-ink">{row.alertsDelivered7d} sent this week</div>
    </>
  );
}

function Brief({ row }: { row: PortfolioRow }) {
  return row.briefToApprove ? (
    <Link href={`/agency/approvals/${row.briefToApprove.id}`} className="font-semibold text-primary-soft-text">
      Approve week of <span className="whitespace-nowrap">{row.briefToApprove.deliveryDate}</span>
    </Link>
  ) : (
    '—'
  );
}

function OpenActions({ row }: { row: PortfolioRow }) {
  return (
    <Link href={`/c/${row.clientId}/recommendations`} className="font-semibold text-primary-soft-text">
      {row.openRecommendations}
    </Link>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-ink">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
