import { platformRole } from '@cs/tools';
import { StatCard } from '@/components/stat-card';
import { type SupportSessionRow, SupportSessionsTable } from '@/components/support-sessions-table';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { formatUsd } from '@/server/format';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { type Health, HealthPill } from '../../_components/health-pill';
import { cardCls, deltaPill, PlatformCharts, type Point, type Tile } from '../../_components/overview-charts';
import { parseRange, RangeToggle } from '../../_components/range-toggle';
import { type AgencyBilling, BillingPanel } from './billing-panel';
import { SupportDialog } from './support-dialog';

export const dynamic = 'force-dynamic';

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

/**
 * Unknown/malformed id or a non-operator → the tool's not_found / permission_denied → 404 (callTool).
 * Phase 8b: "View as agency" (owner/staff only), recent support sessions, and the `?ended=1` flash after Exit/expiry.
 */
export default async function PlatformAgencyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string | string[]; ended?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const { ctx } = await requireOperatorContext();
  const { agency, tiles, series, team, clients } = await callTool<Detail>(ctx, 'get_platform_agency', { agencyId: id, range });
  const [{ rows: sessions }, role] = await Promise.all([
    callTool<{ rows: SupportSessionRow[] }>(ctx, 'list_agency_support_sessions', { agencyId: agency.id }),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
  ]);
  const canStart = role === 'owner' || role === 'staff';
  const [billing, codes] = await Promise.all([
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-tight">{agency.name}</h1>
          <HealthPill health={agency.health} />
          <span className="text-sm text-muted-foreground">Created {agency.createdAt.slice(0, 10)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canStart && <SupportDialog agencyId={agency.id} />}
          <RangeToggle current={range} basePath={`/platform/agencies/${agency.id}`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <StatCard title="Active clients" value={String(tiles.clientsActive.value)} pill={deltaPill(tiles.clientsActive)} hint="Last 28 days" />
        <StatCard title="Seats" value={String(tiles.seats.value)} pill={deltaPill(tiles.seats)} hint="Last 28 days" />
        <StatCard title="Weekly active users" value={String(tiles.wau.value)} pill={deltaPill(tiles.wau)} hint="Last 28 days" />
        <StatCard title="Spend this month" value={formatUsd(tiles.spendMonthUsd.value)} pill={deltaPill(tiles.spendMonthUsd, formatUsd)} hint="Last 28 days" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <PlatformCharts series={series} range={range} includeAgencies={false} />
        <section className={cardCls}>
          <h2 className="font-semibold">Team</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {TEAM.map((t) => (
              <div key={t.key}>
                <dt className="text-muted-foreground">{t.label}</dt>
                <dd className="text-xl font-extrabold text-secondary">{team[t.key]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section className={cardCls}>
        <h2 className="font-semibold">Clients</h2>
        {clients.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No clients yet.</p>
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
                  <tr key={c.id} className="border-t border-[#EEF2F6]">
                    <td className="px-3 py-2 font-semibold">{c.name}</td>
                    <td className="px-3 py-2">{c.status}</td>
                    <td className="whitespace-nowrap px-3 py-2">{c.createdAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">Billing</h2>
        <BillingPanel billing={billing} role={role ?? 'viewer'} codes={codes.map((c) => ({ id: c.id, code: c.code }))} />
      </section>
      <section className={cardCls}>
        <h2 className="font-semibold">Support sessions</h2>
        <SupportSessionsTable rows={sessions} empty="No support sessions yet." />
      </section>
      <p className="text-sm text-muted-foreground">Agency management is coming soon.</p>
    </>
  );
}
