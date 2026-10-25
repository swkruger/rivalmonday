import { StatusChip } from '@cs/ui';
import { EmptyState } from '@/components/help/empty-state';
import { formatDate } from '@/lib/format';
import { CLIENT_STATUS, labelFor } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { cardCls } from '../../_components/overview-charts';
import { type AgencyPeople, PeopleSection, type PeopleTab } from './people-section';

const COPY = PAGE_COPY['platform.agencies.detail'];

export type AgencyClientRow = { id: string; name: string; status: string; createdAt: string };

/** The detail page's Clients table (both the live and the archived view). */
export function ClientsSection({ clients, tz }: { clients: AgencyClientRow[]; tz: string }) {
  return (
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
  );
}

/**
 * Spec §4.5 "Archived detail" (R10): below the page header (Archived chip, date, Unarchive for owners), only People and
 * Clients, both read-only. Tiles, charts, limits, billing and support sessions are skipped with their reads, which keep
 * 404-ing archived agencies.
 */
export function ArchivedView({ agency, people, tab, hrefs, clients, tz, nowMs }: {
  agency: { id: string; name: string };
  people: AgencyPeople;
  tab: PeopleTab;
  hrefs: Record<PeopleTab, string>;
  clients: AgencyClientRow[];
  tz: string;
  nowMs: number;
}) {
  return (
    <>
      <div className={cardCls}>
        <PeopleSection agency={agency} people={people} tab={tab} hrefs={hrefs} canManage={false} tz={tz} nowMs={nowMs} />
      </div>
      <ClientsSection clients={clients} tz={tz} />
    </>
  );
}
