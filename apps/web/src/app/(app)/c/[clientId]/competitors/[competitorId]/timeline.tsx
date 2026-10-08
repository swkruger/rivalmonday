/**
 * Competitor timeline (Task 13): events and moves grouped by month. No hooks — a server component, so it may
 * import `@cs/tools` types. Items arrive newest-first; grouping preserves that order.
 */
import type { TimelineItem } from '@cs/tools';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { RoutePill } from '../../changes/feed';
import { changesHref } from '../../changes/params';
import { movesHref } from '../../moves/move-card';

const monthLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function Timeline({ clientId, items }: { clientId: string; items: TimelineItem[] }) {
  if (items.length === 0) return <p className="text-muted-foreground">No changes from this competitor in this period.</p>;
  const groups = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const key = it.at.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...groups.values()].map((rows) => (
        <section key={rows[0]!.at.slice(0, 7)}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{monthLabel(rows[0]!.at)}</h3>
          <ul className="flex flex-col gap-1">
            {rows.map((it) =>
              it.kind === 'move' ? (
                <li key={`m-${it.id}`}>
                  <Link href={movesHref(clientId, { status: 'all', move: it.id })} className="flex items-center gap-3 rounded-[14px] p-2 hover:bg-muted-surface">
                    <span aria-hidden="true" className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-amber/20 text-amber-text">
                      <TrendingUp className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {it.label} · {it.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{shortDate(it.at)}</span>
                    {it.status && <span className="text-xs font-semibold capitalize text-muted-foreground">{it.status}</span>}
                  </Link>
                </li>
              ) : (
                <li key={`e-${it.id}`}>
                  <Link href={changesHref(clientId, { route: 'all', days: 365, event: it.id })} className="flex items-center gap-3 rounded-[14px] p-2 hover:bg-muted-surface">
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {it.label} · {it.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{shortDate(it.at)}</span>
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
