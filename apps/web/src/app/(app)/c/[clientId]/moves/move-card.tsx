/**
 * One competitor move, as a link card (Task 11 brief). No hooks, no `'use client'` — a server component, so it may
 * freely import `@cs/tools` types (HANDOVER §6 only restricts client components). Reused as-is by the Overview
 * (Task 17), which is why it takes `href` rather than building one itself.
 */
import type { MoveRow } from '@cs/tools';
import { TrendingUp } from 'lucide-react';
import Link from 'next/link';

const DAY = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<MoveRow['status'], string> = { emerging: 'Emerging', active: 'Active', fading: 'Fading', closed: 'Closed' };

/** Pre-flight F12: colour by status — active → accent (amber), emerging → primary, fading/closed → muted. */
const TILE: Record<MoveRow['status'], string> = {
  active: 'bg-amber/20 text-amber-text',
  emerging: 'bg-primary/15 text-primary',
  fading: 'bg-muted-surface-2 text-muted-foreground',
  closed: 'bg-muted-surface-2 text-muted-foreground',
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

export function MoveCard({ move, selected, href }: { move: MoveRow; selected: boolean; href: string }) {
  const days = moveDays(move);
  const pct = Math.round(move.confidence * 100);
  const signals = `${move.eventCount} signal${move.eventCount === 1 ? '' : 's'}`;
  return (
    <Link
      href={href}
      aria-current={selected ? 'true' : undefined}
      className={
        selected
          ? 'flex items-start gap-3 rounded-[14px] bg-primary-soft p-3 shadow-[inset_3px_0_0_var(--color-primary)]'
          : 'flex items-start gap-3 rounded-[14px] p-3 hover:bg-muted-surface'
      }
    >
      <span aria-hidden="true" className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${TILE[move.status]}`}>
        <TrendingUp className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h4 className="truncate font-semibold text-ink">
          {move.label} · {move.competitorName}
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {STATUS_LABEL[move.status]} · {signals} over {days} days · confidence {pct}%
        </p>
      </div>
    </Link>
  );
}
