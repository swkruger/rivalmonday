import { platformRole } from '@cs/tools';
import { StatusChip } from '@cs/ui';
import type { Metadata } from 'next';
import { cache } from 'react';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { HelpTip } from '@/components/help/help-tip';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { type SupportSessionRow, SupportSessionsTable } from '@/components/support-sessions-table';
import { formatDate, formatMoney } from '@/lib/format';
import { AGENCY_HEALTH, CLIENT_STATUS, labelFor } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { cardCls, deltaPill, PlatformCharts, type Point, type Tile } from '../../_components/overview-charts';
import { parseRange, RangeToggle } from '../../_components/range-toggle';
import { type AgencyBilling, BillingPanel } from './billing-panel';
import { type ClientLimits, ClientLimitsTable } from './client-limits';
import { SupportDialog } from './support-dialog';

export const dynamic = 'force-dynamic';

const HELP_KEY = 'page:platform.agencies.detail';
const COPY = PAGE_COPY['platform.agencies.detail'];

type Health = 'at_risk' | 'idle' | 'growing' | 'steady';

interface Detail {
  agency: { id: string; name: string; createdAt: string; health: Health };
  tiles: { agencies: Tile; clientsActive: Tile; seats: Tile; wau: Tile; spendMonthUsd: Tile };
  series: Point[];
  team: { agencyAdmin: number; accountManager: number; clientOwner: number; clientViewer: number };
  clients: { id: string; name: string; status: string; createdAt: string }[];
}

const TEAM: { key: keyof Detail['team']; label: string }[] = [
  { key: 'agencyAdmin', label: 'Agency admins' },
  { key: 'accountManager', label: 'Account managers' },
  { key: 'clientOwner', label: 'Client owners' },
  { key: 'clientViewer', label: 'Client viewers' },
];

type Range = ReturnType<typeof parseRange>;
interface Props { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string | string[]; ended?: string | string[] }> }

/** One detail read per request, shared by the tab title and the page. */
const loadAgency = cache(async (agencyId: string, range: Range) => {
  const { ctx } = await requireOperatorContext();
  return callTool<Detail>(ctx, 'get_platform_agency', { agencyId, range });
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { agency } = await loadAgency((await params).id, parseRange((await searchParams).range));
  return { title: agency.name };
}

/**
 * Unknown/malformed id or a non-operator → the tool's not_found / permission_denied → 404 (callTool).
 * Phase 8b: "View as agency" (owner/staff only), recent support sessions, and the `?ended=1` flash after Exit/expiry.
 */
export default async function PlatformAgencyPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const { ctx } = await requireOperatorContext();
  const { agency, tiles, series, team, clients } = await loadAgency(id, range);
  const [{ rows: sessions }, role, guides, tz] = await Promise.all([
    callTool<{ rows: SupportSessionRow[] }>(ctx, 'list_agency_support_sessions', { agencyId: agency.id }),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
  ]);
  const health = labelFor(AGENCY_HEALTH, agency.health);
  const canStart = role === 'owner' || role === 'staff';
  const [limits, billing, codes] = await Promise.all([
    callTool<ClientLimits>(ctx, 'get_client_limits', { agencyId: agency.id }),
    callTool<AgencyBilling>(ctx, 'get_agency_billing', { agencyId: agency.id }),
    canStart
      ? callTool<{ codes: { id: string; code: string; revokedAt: string | null }[] }>(ctx, 'list_discount_codes', {}).then((r) => r.codes.filter((c) => !c.revokedAt))
      : Promise.resolve([]),
  ]);
  return (
    <>
      {sp.ended === '1' && (
        <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">
          Support session ended.
        </p>
      )}
      <PageHeader
        title={agency.name}
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Agencies', href: '/platform/agencies' }, { label: agency.name }]}
        description={
          <>
            <HelpText text={COPY.description} /> Created {formatDate(agency.createdAt, { tz })}.
          </>
        }
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
        actions={
          <>
            <StatusChip tone={health.tone}>{health.label}</StatusChip>
            {canStart && <SupportDialog agencyId={agency.id} />}
          </>
        }
      />
      <TipRow
        items={[
          { label: 'About health', tip: 'platform.agencies.health' },
          { label: 'About support sessions', tip: 'platform.agencies.detail.support' },
          { label: 'About the team counts', tip: 'platform.agencies.detail.team' },
          { label: 'About the billing panel', tip: 'platform.agencies.detail.billingPanel' },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <StatCard title="Active clients" value={String(tiles.clientsActive.value)} pill={deltaPill(tiles.clientsActive)} hint="Last 28 days" />
        <StatCard title="Seats" value={String(tiles.seats.value)} pill={deltaPill(tiles.seats)} hint="Last 28 days" />
        <StatCard title="Weekly active users" value={String(tiles.wau.value)} pill={deltaPill(tiles.wau)} hint="Last 28 days" />
        <StatCard title="Spend this month" value={formatMoney(tiles.spendMonthUsd.value, { cents: true })} pill={deltaPill(tiles.spendMonthUsd, (n: number) => formatMoney(n, { cents: true }))} hint="Last 28 days" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <PlatformCharts series={series} range={range} includeAgencies={false} rangeToggle={<RangeToggle current={range} basePath={`/platform/agencies/${agency.id}`} />} />
        <section className={cardCls}>
          <h2 className="font-semibold">Team</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {TEAM.map((t) => (
              <div key={t.key}>
                <dt className="text-muted-foreground">{t.label}</dt>
                <dd className="text-xl font-semibold text-secondary">{team[t.key]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section className={cardCls}>
        <h2 className="font-semibold">Clients</h2>
        {clients.length === 0 ? (
          <div className="mt-3">
            <EmptyState {...COPY.empty.noClients} />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-semibold">Client</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{c.name}</td>
                    <td className="px-3 py-2"><StatusChip tone={labelFor(CLIENT_STATUS, c.status).tone}>{labelFor(CLIENT_STATUS, c.status).label}</StatusChip></td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(c.createdAt, { tz })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className={cardCls}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="font-semibold">Client limits</h2>
          <HelpTip tip="platform.agencies.detail.clientLimits" />
        </div>
        <ClientLimitsTable data={limits} canEdit={canStart} />
      </section>
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Billing</h2>
        <BillingPanel billing={billing} role={role ?? 'viewer'} codes={codes.map((c) => ({ id: c.id, code: c.code }))} tz={tz} />
      </section>
      <section className={cardCls}>
        <h2 className="font-semibold">Support sessions</h2>
        <SupportSessionsTable rows={sessions} empty="No support sessions yet." tz={tz} />
      </section>
      <p className="text-sm text-muted-foreground">Agency management is coming soon.</p>
    </>
  );
}
