import { formatRelative, formatWeekOf } from '@/lib/format';
import { isAgencyRole } from '@cs/core';
import type { PortfolioRow } from '@cs/tools';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { OnboardingChecklist, type ChecklistStatus } from '@/components/agency/onboarding-checklist';
import { WriteGuard } from '@/components/read-only';
import { dismissChecklistAction } from '@/app/(onboarding)/onboarding/actions';
import { ClientBillingControls, type ClientBillingStatusRow } from '@/components/billing/client-billing-controls';
import { PressureBadge } from '@/components/pressure-badge';
import { SetupBadge } from '@/components/setup-badge';
import { SpendBadge } from '@/components/spend-badge';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { PAGE_COPY } from '@/help/copy';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool, tryCallTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { verticalOptions } from '@/server/verticals';

export const metadata = { title: 'Portfolio' };

const HELP_KEY = 'page:agency.portfolio';
const COPY = PAGE_COPY['agency.portfolio'];

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
  // 7a1 D7: independent reads in one stage. Admins only: account managers get no checklist and no extra reads.
  const [{ items }, billingRows, onboarding, guides] = await Promise.all([
    callTool<{ items: PortfolioRow[] }>(ctx, 'get_portfolio', {}),
    callTool<{ clients: ClientBillingStatusRow[] }>(ctx, 'list_client_billing_status', {}),
    ctx.role === 'agency_admin' ? callTool<ChecklistStatus & { source?: string }>(ctx, 'get_onboarding_status', {}) : null,
    helpGuides(ctx, 'agency'),
  ]);
  const billingBy = new Map((billingRows?.clients ?? []).map((b) => [b.clientId, b]));
  // 16 P3: no longer hidden by `completed` (nudges continue until a client exists); the card itself hides when nothing is open. Legacy agencies never had one.
  const showChecklist = !!onboarding && !onboarding.dismissed && onboarding.source !== 'legacy';
  // Fails soft: a refused or failing billing read only hides the "Add a payment method" sub-line.
  const billingSummary = showChecklist ? await tryCallTool<{ state: string }>(ctx, 'get_billing_summary', {}).catch(() => null) : null;
  const trialing = billingSummary?.state === 'trialing';
  const billingRole = ctx.role === 'agency_admin' ? 'agency_admin' : 'account_manager';
  const now = new Date();
  const tz = await viewerTimeZone();
  const canAddClient = ctx.clientScope === 'all';
  const verticalLabels = new Map((await verticalOptions()).map((v) => [v.id, v.name]));
  const rows = sortRows(items);
  const alertsWaiting = items.reduce((sum, r) => sum + r.alertsPending, 0);
  const briefsToApprove = items.filter((r) => r.briefToApprove !== null).length;
  const highPressure = items.filter((r) => r.pressure.level === 'high').length;

  return (
    <>
      <PageHeader
        title="Portfolio"
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          canAddClient && (
            <WriteGuard>
              <Button asChild>
                <Link href="/agency/clients/new">Add client</Link>
              </Button>
            </WriteGuard>
          )
        }
      />

      {showChecklist && <OnboardingChecklist status={onboarding} trialing={trialing} dismissAction={dismissChecklistAction} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        <StatCard title="Clients" value={String(items.length)} />
        <StatCard title="Alerts waiting" value={String(alertsWaiting)} href="/agency/alerts" />
        <StatCard title="Briefs to approve" value={String(briefsToApprove)} href="/agency/approvals" />
        <StatCard title="High pressure" value={String(highPressure)} />
      </div>

      {items.length === 0 ? (
        <>
          {canAddClient ? (
            <EmptyState
              title={COPY.empty.noClients.title}
              body={COPY.empty.noClients.body}
              action={
                <WriteGuard>
                  <Link href="/agency/clients/new" className="font-semibold text-primary-soft-text">
                    Add client
                  </Link>
                </WriteGuard>
              }
            />
          ) : (
            <EmptyState title={COPY.empty.noClientsScoped.title} body={COPY.empty.noClientsScoped.body} />
          )}
        </>
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
                  <ClientName row={row} labels={verticalLabels} />
                  <Pressure row={row} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <Field label="Budget"><SpendBadge credits={row.credits} /></Field>
                    <Field label="Alerts"><Alerts row={row} /></Field>
                    <Field label="Brief"><Brief row={row} /></Field>
                    <Field label="Open actions"><OpenActions row={row} /></Field>
                    <Field label="Last activity">{row.lastActivityAt ? formatRelative(row.lastActivityAt, now, { tz }) : 'No activity yet'}</Field>
                    <Field label="Billing"><Billing row={row} billing={billingBy.get(row.clientId)} role={billingRole} /></Field>
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
                    <TableHead>Billing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.clientId}>
                      <TableCell><ClientName row={row} labels={verticalLabels} /></TableCell>
                      <TableCell className="whitespace-normal"><Pressure row={row} /></TableCell>
                      <TableCell><SpendBadge credits={row.credits} /></TableCell>
                      <TableCell><Alerts row={row} /></TableCell>
                      <TableCell className="whitespace-normal"><Brief row={row} /></TableCell>
                      <TableCell><OpenActions row={row} /></TableCell>
                      <TableCell>{row.lastActivityAt ? formatRelative(row.lastActivityAt, now, { tz }) : 'No activity yet'}</TableCell>
                      <TableCell className="whitespace-normal"><Billing row={row} billing={billingBy.get(row.clientId)} role={billingRole} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <TipRow
        items={[
          { label: 'Pressure', tip: 'agency.portfolio.pressure' },
          { label: 'Budget', tip: 'agency.portfolio.budget' },
          { label: 'Alerts and briefs', tip: 'agency.portfolio.alertsBriefs' },
          { label: 'Open actions', tip: 'agency.portfolio.openActions' },
          { label: 'Setup chip', tip: 'agency.portfolio.setup' },
          ...(showChecklist ? [{ label: 'Checklist', tip: 'agency.portfolio.checklist' } as const] : []),
        ]}
      />
    </>
  );
}

function ClientName({ row, labels }: { row: PortfolioRow; labels: Map<string, string> }) {
  return (
    <div>
      <Link href={`/c/${row.clientId}`} className="font-semibold text-primary-soft-text">
        {row.name}
      </Link>
      <div className="text-muted-ink">{labels.get(row.verticalId) ?? row.verticalId}</div>
      {row.setup && (
        <div className="mt-1">
          <SetupBadge clientId={row.clientId} {...row.setup} />
        </div>
      )}
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

function Billing({ row, billing, role }: { row: PortfolioRow; billing: ClientBillingStatusRow | undefined; role: 'agency_admin' | 'account_manager' }) {
  if (!billing) return '—';
  return (
    <ClientBillingControls
      clientId={row.clientId} clientName={row.name} role={role} pill={billing.pill} billing={{ state: billing.state, enabled: billing.enabled }}
      nextPriceCents={billing.nextPriceCents}
    />
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
      Approve <span className="whitespace-nowrap">{formatWeekOf(row.briefToApprove.deliveryDate, { tz: 'UTC' })}</span>
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
