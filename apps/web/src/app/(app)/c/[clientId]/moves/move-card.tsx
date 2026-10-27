/**
 * One competitor move, as a link card (Task 11 brief). No hooks, no `'use client'` — a server component, so it may
 * freely import `@cs/tools` types (HANDOVER §6 only restricts client components). Reused as-is by the Overview
 * (Task 17), which is why it takes `href` rather than building one itself.
 */
import type { MoveRow } from '@cs/tools';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { labelFor, MOVE_STATUS } from '@/lib/labels';

const ROW = 'flex items-start gap-3 p-3 hover:bg-muted-surface first:rounded-t-[5px] last:rounded-b-[5px]';

const DAY = 24 * 60 * 60 * 1000;

/** Pre-flight F12: colour by status — active → accent (amber), emerging → primary, fading/closed → muted. */
const TILE: Record<MoveRow['status'], string> = {
  active: 'bg-amber/20 text-amber-text',
  emerging: 'bg-primary/15 text-primary',
  fading: 'bg-muted-surface-2 text-muted-ink',
  closed: 'bg-muted-surface-2 text-muted-ink',
};

/**
 * Pre-flight F12: first detection to its latest evidence (or close date, for a closed move) — pure, never
 * `Date.now()`, so the card renders the same thing every time.
 */
function moveDays(move: MoveRow): number {
  const end = Date.parse(move.lastEvidenceAt ?? move.closedAt ?? move.firstDetectedAt);
  const start = Date.parse(move.firstDetectedAt);
  return Math.max(1, Math.round((end - start) / DAY));
}

/** Builds a `/c/<clientId>/moves` URL; `status` is omitted when it's the default ('open'). */
export function movesHref(clientId: string, p: { status?: 'open' | 'closed' | 'all'; move?: string } = {}): string {
  const qs = new URLSearchParams();
  if (p.status && p.status !== 'open') qs.set('status', p.status);
  if (p.move) qs.set('move', p.move);
  const s = qs.toString();
  return `/c/${clientId}/moves${s ? `?${s}` : ''}`;
}

/**
 * `selected` is the visual highlight (the first card is auto-selected); `current` is true only when the URL names this
 * move (`?move=`) and drives `aria-current` (P2). The highlight shows on `lg:` and up, where the detail pane is visible.
 */
export function MoveCard({ move, selected, current, href }: { move: MoveRow; selected: boolean; current: boolean; href: string }) {
  const days = moveDays(move);
  const pct = Math.round(move.confidence * 100);
  const changes = `${move.eventCount} change${move.eventCount === 1 ? '' : 's'}`;
  return (
    <Link
      href={href}
      aria-current={current ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      className={
        selected
          ? `${ROW} lg:bg-primary-soft`
          : ROW
      }
    >
      <span aria-hidden="true" className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${TILE[move.status]}`}>
        <TrendingUp className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h4 className={`truncate text-ink ${selected ? 'font-semibold' : 'font-medium'}`}>
          {move.label} · {move.competitorName}
        </h4>
        {/* Selected (lg): ink text — the brand-derived primary-soft tint drops muted-ink below 4.5:1 for some agency primaries. */}
        <p className={`mt-0.5 text-xs ${selected ? 'text-muted-ink lg:text-ink' : 'text-muted-ink'}`}>
          {labelFor(MOVE_STATUS, move.status).label} · {changes} over {days} days · confidence {pct}%
        </p>
      </div>
    </Link>
  );
}
