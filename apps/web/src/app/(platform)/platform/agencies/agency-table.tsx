import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { AGENCY_HEALTH, AGENCY_LIFECYCLE, BILLING_STATE, labelFor } from '@/lib/labels';
import { EmptyState } from '@/components/help/empty-state';
import { PAGE_COPY } from '@/help/copy';
import Link from 'next/link';
import type { BillingState } from '@cs/db';
import { StatusChip } from '@cs/ui';
import { UnarchiveRowButton } from './unarchive-row-button';

type Health = 'at_risk' | 'idle' | 'growing' | 'steady';

export const SORTS = ['name', 'created', 'clients', 'wau', 'lastActivity', 'spend', 'health'] as const;
export type AgencySort = (typeof SORTS)[number];
export type SortDir = 'asc' | 'desc';

export interface AgencyRow {
  id: string;
  name: string;
  createdAt: string;
  clientsActive: number;
  clientsProspect: number;
  agencySeats: number;
  clientSeats: number;
  wau: number | null;
  lastActivityAt: string | null;
  spendMonthUsd: number;
  health: Health;
  billingState: BillingState;
  onHold?: boolean;
  archivedAt?: string | null;
}

export const STATUSES = ['active', 'on_hold', 'archived', 'all'] as const;
export type AgencyStatus = (typeof STATUSES)[number];
/** Archived agencies can be purged from this age (the CLI refuses earlier). */
const PURGE_AFTER_MS = 30 * 86_400_000;

/** Same default as `list_platform_agencies`: name and health ascending, figures and dates descending. */
export const defaultDir = (sort: AgencySort): SortDir => (sort === 'name' || sort === 'health' ? 'asc' : 'desc');

const COLUMNS: { label: string; sort?: AgencySort; right?: boolean }[] = [
  { label: 'Agency', sort: 'name' },
  { label: 'Created', sort: 'created' },
  { label: 'Active clients', sort: 'clients', right: true },
  { label: 'Prospects', right: true },
  { label: 'Seats', right: true },
  { label: 'WAU', sort: 'wau', right: true },
  { label: 'Last activity', sort: 'lastActivity' },
  { label: 'Spend this month', sort: 'spend', right: true },
  { label: 'Health', sort: 'health' },
  { label: 'Billing' },
];

/** The one builder for the page's links (sort headers, search, Previous/Next): keeps `q`, `sort` and `dir`; `cursor` only when given. */
export function agenciesHref(o: { q?: string; status?: AgencyStatus; sort: AgencySort; dir: SortDir; cursor?: string | null }): string {
  const p = new URLSearchParams();
  if (o.q) p.set('q', o.q);
  if (o.status && o.status !== 'active') p.set('status', o.status);
  p.set('sort', o.sort);
  p.set('dir', o.dir);
  if (o.cursor) p.set('cursor', o.cursor);
  return `/platform/agencies?${p.toString()}`;
}

export function AgencyTable({ rows, sort, dir, now, tz = 'UTC', query, status = 'active', canUnarchive = false }: { rows: AgencyRow[]; sort: AgencySort; dir: SortDir; now: Date; tz?: string; query?: string; status?: AgencyStatus; canUnarchive?: boolean }) {
  if (status === 'archived') return <ArchivedTable rows={rows} now={now} tz={tz} query={query} canUnarchive={canUnarchive} />;
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface p-2 sm:p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              {COLUMNS.map((c) => {
                const active = c.sort === sort;
                const next = c.sort ? (active ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir(c.sort)) : null;
                return (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={c.sort && active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`whitespace-nowrap px-3 py-2 font-semibold ${c.right ? 'text-right' : ''}`}
                  >
                    {c.sort ? (
                      <Link href={agenciesHref({ q: query, status, sort: c.sort, dir: next! })} className="hover:text-ink">
                        {c.label}
                        {active && <span aria-hidden="true">{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </Link>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#EEF2F6]">
                <td className="px-3 py-2 font-semibold">
                  <Link href={`/platform/agencies/${r.id}`} className="text-secondary hover:underline">{r.name}</Link>
                  {r.onHold && !r.archivedAt && <> <StatusChip tone={AGENCY_LIFECYCLE.on_hold.tone}>{AGENCY_LIFECYCLE.on_hold.label}</StatusChip></>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(r.createdAt, { tz, now })}</td>
                <td className="px-3 py-2 text-right">{r.clientsActive}</td>
                <td className="px-3 py-2 text-right">{r.clientsProspect}</td>
                <td className="px-3 py-2 text-right">{r.agencySeats + r.clientSeats}</td>
                <td className="px-3 py-2 text-right">{r.wau ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.lastActivityAt ? formatRelative(r.lastActivityAt, now, { tz }) : '—'}</td>
                <td className="px-3 py-2 text-right">{formatMoney(r.spendMonthUsd, { cents: true })}</td>
                <td className="px-3 py-2"><Chip entry={labelFor(AGENCY_HEALTH, r.health)} /></td>
                <td className="px-3 py-2"><Chip entry={labelFor(BILLING_STATE, r.billingState)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && query && <p className="px-3 py-6 text-sm text-muted-ink">No agencies match “{query}”.</p>}
      {rows.length === 0 && !query && <EmptyState {...PAGE_COPY['platform.agencies'].empty.none} guideAnchor="what-this-page-tells-you" />}
    </div>
  );
}

const Chip = ({ entry }: { entry: { label: string; tone: Parameters<typeof StatusChip>[0]['tone'] } }) => <StatusChip tone={entry.tone}>{entry.label}</StatusChip>;

/** Archived view (spec 4.4): fewer columns, the purge hint and the owner's Unarchive button. */
function ArchivedTable({ rows, now, tz, query, canUnarchive }: { rows: AgencyRow[]; now: Date; tz: string; query?: string; canUnarchive: boolean }) {
  const archived = AGENCY_LIFECYCLE.archived;
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface p-2 sm:p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-semibold">Agency</th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Clients</th>
              <th scope="col" className="px-3 py-2 font-semibold">Archived</th>
              {canUnarchive && <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const at = r.archivedAt ?? null;
              const purgeable = at !== null && now.getTime() - new Date(at).getTime() >= PURGE_AFTER_MS;
              return (
                <tr key={r.id} className="border-t border-[#EEF2F6]">
                  <td className="px-3 py-2 font-semibold">
                    <Link href={`/platform/agencies/${r.id}`} className="text-secondary hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-3 py-2"><StatusChip tone={archived.tone}>{archived.label}</StatusChip></td>
                  <td className="px-3 py-2 text-right">{r.clientsActive + r.clientsProspect}</td>
                  <td className="whitespace-nowrap px-3 py-2">{at ? formatDate(at, { tz, now }) : '—'}{purgeable && ' · purge possible'}</td>
                  {canUnarchive && <td className="px-3 py-2 text-right"><UnarchiveRowButton agency={{ id: r.id, name: r.name }} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && query && <p className="px-3 py-6 text-sm text-muted-ink">No agencies match “{query}”.</p>}
      {rows.length === 0 && !query && <p className="px-3 py-6 text-sm text-muted-ink">No archived agencies.</p>}
    </div>
  );
}
