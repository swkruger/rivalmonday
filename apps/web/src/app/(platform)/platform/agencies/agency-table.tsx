import { formatDate, formatMoney, formatRelative } from '@/lib/format';
import { AGENCY_HEALTH, AGENCY_LIFECYCLE, BILLING_STATE, labelFor } from '@/lib/labels';
import { EmptyState } from '@/components/help/empty-state';
import { PAGE_COPY } from '@/help/copy';
import Link from 'next/link';
import type { BillingState } from '@cs/db';
import { StatusChip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
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
    <>
      <Table className="min-w-[940px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((c) => {
              const active = c.sort === sort;
              const next = c.sort ? (active ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir(c.sort)) : null;
              return (
                <TableHead
                  key={c.label}
                  scope="col"
                  numeric={c.right}
                  aria-sort={c.sort && active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sort ? (
                    <Link href={agenciesHref({ q: query, status, sort: c.sort, dir: next! })} className="hover:text-ink">
                      {c.label}
                      {active && <span aria-hidden="true">{dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </Link>
                  ) : (
                    c.label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-semibold">
                <Link href={`/platform/agencies/${r.id}`} className="text-secondary hover:underline">{r.name}</Link>
                {r.onHold && !r.archivedAt && <> <StatusChip tone={AGENCY_LIFECYCLE.on_hold.tone}>{AGENCY_LIFECYCLE.on_hold.label}</StatusChip></>}
              </TableCell>
              <TableCell>{formatDate(r.createdAt, { tz, now })}</TableCell>
              <TableCell numeric>{r.clientsActive}</TableCell>
              <TableCell numeric>{r.clientsProspect}</TableCell>
              <TableCell numeric>{r.agencySeats + r.clientSeats}</TableCell>
              <TableCell numeric>{r.wau ?? '—'}</TableCell>
              <TableCell>{r.lastActivityAt ? formatRelative(r.lastActivityAt, now, { tz }) : '—'}</TableCell>
              <TableCell numeric>{formatMoney(r.spendMonthUsd, { cents: true })}</TableCell>
              <TableCell><Chip entry={labelFor(AGENCY_HEALTH, r.health)} /></TableCell>
              <TableCell><Chip entry={labelFor(BILLING_STATE, r.billingState)} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && query && <p className="py-6 text-sm text-muted-ink">No agencies match “{query}”.</p>}
      {rows.length === 0 && !query && <EmptyState {...PAGE_COPY['platform.agencies'].empty.none} guideAnchor="what-this-page-tells-you" />}
    </>
  );
}

const Chip = ({ entry }: { entry: { label: string; tone: Parameters<typeof StatusChip>[0]['tone'] } }) => <StatusChip tone={entry.tone}>{entry.label}</StatusChip>;

/** Archived view (spec 4.4): fewer columns, the purge hint and the owner's Unarchive button. */
function ArchivedTable({ rows, now, tz, query, canUnarchive }: { rows: AgencyRow[]; now: Date; tz: string; query?: string; canUnarchive: boolean }) {
  const archived = AGENCY_LIFECYCLE.archived;
  return (
    <>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Agency</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" numeric>Clients</TableHead>
            <TableHead scope="col">Archived</TableHead>
            {canUnarchive && <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const at = r.archivedAt ?? null;
            const purgeable = at !== null && now.getTime() - new Date(at).getTime() >= PURGE_AFTER_MS;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">
                  <Link href={`/platform/agencies/${r.id}`} className="text-secondary hover:underline">{r.name}</Link>
                </TableCell>
                <TableCell><StatusChip tone={archived.tone}>{archived.label}</StatusChip></TableCell>
                <TableCell numeric>{r.clientsActive + r.clientsProspect}</TableCell>
                <TableCell>{at ? formatDate(at, { tz, now }) : '—'}{purgeable && ' · purge possible'}</TableCell>
                {canUnarchive && <TableCell className="text-right"><UnarchiveRowButton agency={{ id: r.id, name: r.name }} /></TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rows.length === 0 && query && <p className="py-6 text-sm text-muted-ink">No agencies match “{query}”.</p>}
      {rows.length === 0 && !query && <p className="py-6 text-sm text-muted-ink">No archived agencies.</p>}
    </>
  );
}
