import { EmptyState } from '@/components/help/empty-state';
import { PAGE_COPY } from '@/help/copy';
import { formatUsd, relativeTime } from '@/server/format';
import Link from 'next/link';
import type { BillingState } from '@cs/db';
import { BillingStatePill } from '../_components/billing-state-pill';
import { type Health, HealthPill } from '../_components/health-pill';

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
}

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

const day = (iso: string) => iso.slice(0, 10);

export function AgencyTable({ rows, sort, dir, now }: { rows: AgencyRow[]; sort: AgencySort; dir: SortDir; now: Date }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-surface p-2 shadow-card sm:p-4">
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
                      <Link href={`/platform/agencies?sort=${c.sort}&dir=${next}`} className="hover:text-ink">
                        {c.label}
                        {active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
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
                </td>
                <td className="whitespace-nowrap px-3 py-2">{day(r.createdAt)}</td>
                <td className="px-3 py-2 text-right">{r.clientsActive}</td>
                <td className="px-3 py-2 text-right">{r.clientsProspect}</td>
                <td className="px-3 py-2 text-right">{r.agencySeats + r.clientSeats}</td>
                <td className="px-3 py-2 text-right">{r.wau ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.lastActivityAt ? relativeTime(r.lastActivityAt, now) : '—'}</td>
                <td className="px-3 py-2 text-right">{formatUsd(r.spendMonthUsd)}</td>
                <td className="px-3 py-2"><HealthPill health={r.health} /></td>
                <td className="px-3 py-2"><BillingStatePill state={r.billingState} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <EmptyState {...PAGE_COPY['platform.agencies'].empty.none} guideAnchor="what-this-page-tells-you" />}
    </div>
  );
}
