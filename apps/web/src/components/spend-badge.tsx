import type { SpendView } from '@cs/tools';

const STYLE: Record<SpendView['level'], string> = {
  ok: 'bg-muted-surface text-ink',
  warning: 'bg-amber/20 text-amber-text',
  over: 'bg-destructive/15 text-destructive',
};
const LABEL: Record<SpendView['level'], string> = { ok: '', warning: ' · near cap', over: ' · over cap' };

/** Decision 6: month-to-date spend as a share of the client's cap; amber from 80 %, red from 100 %. */
export function SpendBadge({ spend }: { spend: SpendView }) {
  const pct = Math.round(spend.ratio * 100);
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STYLE[spend.level]}`}>{`${pct}%${LABEL[spend.level]}`}</span>;
}
