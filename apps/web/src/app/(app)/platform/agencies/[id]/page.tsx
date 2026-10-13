import { StatCard } from '@/components/stat-card';
import { requireOperatorContext } from '@/server/current-viewer';
import { formatUsd } from '@/server/format';
import { callTool } from '@/server/tools';
import { type Health, HealthPill } from '../../_components/health-pill';
import { cardCls, deltaPill, PlatformCharts, type Point, type Tile } from '../../_components/overview-charts';
import { parseRange, RangeToggle } from '../../_components/range-toggle';

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

/** Unknown/malformed id or a non-operator → the tool's not_found / permission_denied → 404 (callTool). */
export default async function PlatformAgencyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string | string[] }> }) {
  const { id } = await params;
  const range = parseRange((await searchParams).range);
  const { ctx } = await requireOperatorContext();
  const { agency, tiles, series, team, clients } = await callTool<Detail>(ctx, 'get_platform_agency', { agencyId: id, range });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-tight">{agency.name}</h1>
          <HealthPill health={agency.health} />
          <span className="text-sm text-muted-foreground">Created {agency.createdAt.slice(0, 10)}</span>
        </div>
        <RangeToggle current={range} basePath={`/platform/agencies/${agency.id}`} />
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
      <p className="text-sm text-muted-foreground">Agency management is coming soon.</p>
    </>
  );
}
