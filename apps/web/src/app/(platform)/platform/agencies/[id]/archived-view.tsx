import { Section, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { EmptyState } from '@/components/help/empty-state';
import { formatDate } from '@/lib/format';
import { CLIENT_STATUS, labelFor } from '@/lib/labels';
import { PAGE_COPY } from '@/help/copy';
import { type AgencyPeople, PeopleSection, type PeopleTab } from './people-section';

const COPY = PAGE_COPY['platform.agencies.detail'];

export type AgencyClientRow = { id: string; name: string; status: string; createdAt: string };

/** The detail page's Clients table (both the live and the archived view). */
export function ClientsSection({ clients, tz }: { clients: AgencyClientRow[]; tz: string }) {
  return (
    <Section ruled title="Clients">
      {clients.length === 0 ? (
        <EmptyState {...COPY.empty.noClients} />
      ) : (
        <TableFrame>
          <Table className="min-w-[420px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Client</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.name}</TableCell>
                  <TableCell><StatusChip tone={labelFor(CLIENT_STATUS, c.status).tone}>{labelFor(CLIENT_STATUS, c.status).label}</StatusChip></TableCell>
                  <TableCell>{formatDate(c.createdAt, { tz })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </Section>
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
      <PeopleSection agency={agency} people={people} tab={tab} hrefs={hrefs} canManage={false} tz={tz} nowMs={nowMs} />
      <ClientsSection clients={clients} tz={tz} />
    </>
  );
}
