/**
 * Server-only presentational pieces for the Changes feed (Task 8 brief). No hooks, no `'use client'` — this module
 * is rendered entirely on the server, so it may freely import `@cs/tools` types (the restriction is only for client
 * components, HANDOVER §6). Reused by later tasks: `RoutePill` (9, 13), `changesHref`/`ChangesParams` (9, 11, 13).
 */
import { channelLabel, type EventRow } from '@cs/tools';
import { Button, cn, segmentedItemClass, segmentedTrackClass, StatusChip, toolbarControlClass } from '@cs/ui';
import Link from 'next/link';
import { HelpTip } from '@/components/help/help-tip';
import { formatDate } from '@/lib/format';
import { EVENT_ROUTE, labelFor } from '@/lib/labels';
import type { WeekLabel } from './group';
import { changesHref, type ChangesParams } from './params';

/** The route chip shown next to an event's score: Alert/Brief/Archived. The score stays in the accessible name. */
export function RoutePill({ route, score }: { route: EventRow['route']; score: number }) {
  const { label, tone } = labelFor(EVENT_ROUTE, route);
  const name = `Score ${score}, routed to ${label.toLowerCase()}`;
  return (
    <StatusChip tone={tone} title={name}>
      <span className="sr-only">{`${name}: `}</span>
      <span aria-hidden="true">{label}</span>
    </StatusChip>
  );
}

const SELECT_CLASS = toolbarControlClass;

function SegmentLink({ clientId, params, route, label }: { clientId: string; params: ChangesParams; route: ChangesParams['route']; label: string }) {
  const active = params.route === route;
  return (
    <Link
      href={changesHref(clientId, { ...params, route, offset: 0, event: undefined, change: undefined })}
      aria-current={active ? 'page' : undefined}
      className={segmentedItemClass}
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
        <input name="q" defaultValue={params.q ?? ''} placeholder="Search changes" aria-label="Search changes" className={cn(toolbarControlClass, 'w-full max-w-[220px]')} />
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
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </form>
      <div className="flex items-center gap-1.5">
        <div className={segmentedTrackClass}>
          <SegmentLink clientId={clientId} params={params} route="flagged" label="Alerts + brief" />
          <SegmentLink clientId={clientId} params={params} route="all" label="All" />
          <SegmentLink clientId={clientId} params={params} route="archive" label="Archived" />
        </div>
        {/* One of the two shows (by audience): the client wording, or the agency's routing rules. */}
        <HelpTip tip="client.changes.routes" />
        <HelpTip tip="client.changes.routing" />
      </div>
    </div>
  );
}

/**
 * Rows grouped by week. `channels` are raw codes; the row shows them through `channelLabel`. `currentId` is the event
 * the URL names (`?event=`): only that row gets `aria-current` (P2). `selectedId` (the auto-selected first row
 * included) drives the highlight on `lg:` and up, where the detail pane is visible.
 */
export function FeedList({
  clientId,
  params,
  groups,
  selectedId,
  currentId,
  timezone,
}: {
  clientId: string;
  params: ChangesParams;
  groups: { label: WeekLabel; items: EventRow[] }[];
  selectedId?: string | null;
  /** The event named by `?event=`; null when the first row is auto-selected. */
  currentId?: string | null;
  timezone: string;
}) {
  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-4 pb-1.5 pt-4 text-xs font-medium text-muted-ink first:pt-3">{group.label}</div>
          <ul className="flex flex-col">
            {group.items.map((row) => {
              const selected = row.eventId === selectedId;
              const current = row.eventId === currentId;
              return (
                <li key={row.eventId}>
                  <Link
                    href={changesHref(clientId, { ...params, event: row.eventId, change: undefined, tab: 'side' })}
                    data-row-id={row.eventId}
                    data-selected={selected ? 'true' : undefined}
                    aria-current={current ? 'true' : undefined}
                    className={
                      selected
                        ? 'grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 hover:bg-muted-surface lg:bg-primary-soft'
                        : 'grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 hover:bg-muted-surface'
                    }
                  >
                    <div className="min-w-0">
                      <h4 className={cn('truncate text-ink', selected ? 'font-semibold' : 'font-medium')}>
                        {row.competitorName} · {row.summary}
                      </h4>
                      {/* Selected (lg): ink text — the brand-derived primary-soft tint drops muted/secondary below 4.5:1 for some agency primaries. */}
                      <p className={cn('mt-0.5 truncate text-xs text-muted-ink', selected && 'lg:text-ink')}>
                        {row.typeLabel} · {row.channels.map(channelLabel).join(', ')} · {formatDate(row.occurredAt, { tz: timezone })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('font-semibold', row.route === 'archive' ? 'text-muted-ink' : 'text-secondary', selected && 'lg:text-ink')}>{row.score}</span>
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
