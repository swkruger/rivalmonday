/**
 * Competitor timeline (Task 13): events and moves grouped by month. No hooks — a server component, so it may
 * import `@cs/tools` types. Items arrive newest-first; grouping preserves that order.
 */
import type { TimelineItem } from '@cs/tools';
import { StatusChip } from '@cs/ui';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatMonth, localDay } from '@/lib/format';
import { MOVE_STATUS, labelFor } from '@/lib/labels';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';
import { RoutePill } from '../../changes/feed';
import { changesHref } from '../../changes/params';
import { movesHref } from '../../moves/move-card';

export function Timeline({ clientId, items, timezone }: { clientId: string; items: TimelineItem[]; timezone: string }) {
  if (items.length === 0) return <p className="text-muted-ink">No changes from this competitor in this period.</p>;
  const groups = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const key = localDay(it.at, timezone).slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...groups.values()].map((rows) => (
        <section key={localDay(rows[0]!.at, timezone).slice(0, 7)}>
          <h3 className="mb-2 text-sm font-semibold text-muted-ink">{formatMonth(rows[0]!.at, { tz: timezone, style: 'long' })}</h3>
          <ul className="flex flex-col gap-1">
            {rows.map((it) =>
              it.kind === 'move' ? (
                <li key={`m-${it.id}`}>
                  <Link href={movesHref(clientId, { status: 'all', move: it.id })} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted-surface">
                    <span aria-hidden="true" className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-amber/20 text-amber-text">
                      <TrendingUp className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {it.label} · {it.title}
                    </span>
                    <span className="text-xs text-muted-ink">{formatDate(it.at, { tz: timezone })}</span>
                    {it.status && <StatusChip tone={labelFor(MOVE_STATUS, it.status).tone}>{labelFor(MOVE_STATUS, it.status).label}</StatusChip>}
                  </Link>
                </li>
              ) : (
                <li key={`e-${it.id}`}>
                  <Link href={changesHref(clientId, { route: 'all', days: 365, event: it.id })} className="flex items-center gap-3 rounded-md p-2 hover:bg-muted-surface">
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {it.label} · {it.title}
                    </span>
                    <span className="text-xs text-muted-ink">{formatDate(it.at, { tz: timezone })}</span>
                    {it.route && it.score !== null && (
                      <>
                        <span className="text-xs font-semibold tabular-nums text-ink">{it.score}</span>
                        <RoutePill route={it.route} score={it.score} />
                      </>
                    )}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The Timeline's own read, streamed behind a Suspense boundary (P3); it runs after the page's access-checking reads. */
export async function TimelineCard({ clientId, competitorId, days, timezone }: { clientId: string; competitorId: string; days: number; timezone: string }) {
  const { ctx } = await requireContext();
  const timeline = await callTool<{ items: TimelineItem[] }>(ctx, 'get_competitor_timeline', { clientId, competitorId, days });
  return <Timeline clientId={clientId} items={timeline.items} timezone={timezone} />;
}
