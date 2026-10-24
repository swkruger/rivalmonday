import type { SpendCredits } from '@cs/tools';

const STYLE: Record<SpendCredits['level'], string> = {
  ok: 'bg-muted-surface text-ink',
  near: 'bg-muted-surface text-secondary',
  reached: 'bg-muted-surface text-secondary',
  paused: 'bg-muted-surface text-secondary',
};
const LABEL: Record<Exclude<SpendCredits['level'], 'ok'>, string> = { near: 'Near limit', reached: 'Limit reached', paused: 'Paused' };

/** 7b1: month-to-date credits against the client's limit. Calm colours only (owner preference): ok shows the percentage, the other levels their label. */
export function SpendBadge({ credits }: { credits: SpendCredits }) {
  const text = credits.level === 'ok' ? `${Math.round(credits.ratio * 100)}%` : LABEL[credits.level];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STYLE[credits.level]}`}>{text}</span>;
}
