import type { SpendCredits } from '@cs/tools';

const STYLE: Record<SpendCredits['level'], string> = {
  ok: 'bg-muted-surface text-ink',
  near: 'bg-muted-surface text-secondary',
  reached: 'bg-muted-surface text-secondary',
  paused: 'bg-muted-surface text-secondary',
};
const LABEL: Record<SpendCredits['level'], string> = { ok: '', near: ' · near limit', reached: ' · limit reached', paused: ' · paused' };

/** 7b1: month-to-date credits as a share of the client's limit; calm colours only (the full read-only UI is Task 11). */
export function SpendBadge({ credits }: { credits: SpendCredits }) {
  const pct = Math.round(credits.ratio * 100);
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STYLE[credits.level]}`}>{`${pct}%${LABEL[credits.level]}`}</span>;
}
