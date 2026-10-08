/**
 * Server-only presentational pieces for the Changes feed (Task 8 brief). No hooks, no `'use client'` — this module
 * is rendered entirely on the server, so it may freely import `@cs/tools` types (the restriction is only for client
 * components, HANDOVER §6). Reused by later tasks: `RoutePill` (9, 13), `changesHref`/`ChangesParams` (9, 11, 13).
 */
import type { EventRow } from '@cs/tools';
import { Button, Input } from '@cs/ui';
import Link from 'next/link';
import type { WeekLabel } from './group';
import { changesHref, type ChangesParams } from './params';

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const ROUTE_LABEL: Record<EventRow['route'], string> = { alert: 'Alert', brief: 'Brief', archive: 'Archived' };
const ROUTE_TONE: Record<EventRow['route'], string> = {
  alert: 'bg-[#FEE2E2] text-[#B91C1C]',
  brief: 'bg-[#FFF3DC] text-[#B45309]',
  archive: 'bg-muted-surface-2 text-muted-foreground',
};

/** The route pill shown next to an event's score — Alert/Brief/Archived, in the status-pill colours (Global Constraints). */
export function RoutePill({ route, score }: { route: EventRow['route']; score: number }) {
  return (
    <span
      aria-label={`Score ${score}, routed to ${ROUTE_LABEL[route].toLowerCase()}`}
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${ROUTE_TONE[route]}`}
    >
      {ROUTE_LABEL[route]}
    </span>
  );
}

const SELECT_CLASS = 'h-9 rounded-md border border-input bg-transparent px-2 text-sm text-ink';

function SegmentLink({ clientId, params, route, label }: { clientId: string; params: ChangesParams; route: ChangesParams['route']; label: string }) {
  const active = params.route === route;
  return (
    <Link
      href={changesHref(clientId, { ...params, route, offset: 0, event: undefined, change: undefined })}
      aria-current={active ? 'page' : undefined}
      className={active ? 'rounded-md bg-surface px-3 py-1.5 text-sm font-semibold text-ink shadow-card' : 'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-ink'}
    >
      {label}
    </Link>
  );
}

/** A `GET` form (filters) plus a segmented route control, both built from the URL-driven `params`. */
export function FilterBar({
  clientId,
  params,
  competitors,
  types,
  services,
}: {
  clientId: string;
  params: ChangesParams;
  competitors: { id: string; name: string }[];
  types: { id: string; label: string }[];
  services: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form action={`/c/${clientId}/changes`} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="route" value={params.route} />
        <Input name="q" defaultValue={params.q ?? ''} placeholder="Search changes" aria-label="Search changes" className="max-w-[220px]" />
        <select name="competitor" defaultValue={params.competitor ?? ''} aria-label="Competitor" className={SELECT_CLASS}>
          <option value="">All competitors</option>
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={params.type ?? ''} aria-label="Change type" className={SELECT_CLASS}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select name="service" defaultValue={params.service ?? ''} aria-label="Service" className={SELECT_CLASS}>
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="days" defaultValue={String(params.days)} aria-label="Period" className={SELECT_CLASS}>
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
        <Button type="submit">Apply</Button>
      </form>
      <div className="flex items-center gap-1 rounded-lg bg-muted-surface p-1">
        <SegmentLink clientId={clientId} params={params} route="flagged" label="Alerts + brief" />
        <SegmentLink clientId={clientId} params={params} route="all" label="All" />
        <SegmentLink clientId={clientId} params={params} route="archive" label="Archived" />
      </div>
    </div>
  );
}

/**
 * Rows grouped by week. `channels` on each row is expected to already hold display labels (mapped by the page with
 * `channelLabel`, never raw channel codes) — this component is purely presentational.
 */
export function FeedList({
  clientId,
  params,
  groups,
  selectedId,
}: {
  clientId: string;
  params: ChangesParams;
  groups: { label: WeekLabel; items: EventRow[] }[];
  selectedId?: string;
}) {
  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-4 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-ink first:pt-3">{group.label}</div>
          <ul className="flex flex-col">
            {group.items.map((row) => {
              const current = row.eventId === selectedId;
              return (
                <li key={row.eventId}>
                  <Link
                    href={changesHref(clientId, { ...params, event: row.eventId, change: undefined, tab: 'side' })}
                    aria-current={current ? 'true' : undefined}
                    className={
                      current
                        ? 'grid grid-cols-[1fr_auto] items-start gap-3 bg-primary-soft px-4 py-3 shadow-[inset_3px_0_0_var(--color-primary)]'
                        : 'grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 hover:bg-muted-surface'
                    }
                  >
                    <div className="min-w-0">
                      <h4 className="truncate font-semibold text-ink">
                        {row.competitorName} · {row.summary}
                      </h4>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {row.typeLabel} · {row.channels.join(', ')} · {formatShortDate(row.occurredAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`font-extrabold ${row.route === 'archive' ? 'text-muted-foreground' : 'text-secondary'}`}>{row.score}</span>
                      <RoutePill route={row.route} score={row.score} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
