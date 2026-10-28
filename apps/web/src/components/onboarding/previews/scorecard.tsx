/** Chart roles (dataviz skill, validated): you (secondary), rival 1, rival 2, context grey: the chart tokens in `@cs/ui` styles. */
export const SCORE_COLORS = { you: 'var(--secondary)', rival1: 'var(--chart-rival-1)', rival2: 'var(--chart-rival-2)', context: 'var(--chart-context)' } as const;

export interface ScoreRow {
  name: string;
  rating: number | null;
  reviews: number | null;
  /** `you`, `rival1`, `rival2`; `empty` draws a dashed placeholder row. */
  role: 'you' | 'rival1' | 'rival2' | 'empty';
}

function Bars({ title, rows, value, max, format }: { title: string; rows: ScoreRow[]; value: (r: ScoreRow) => number | null; max: number; format: (v: number) => string }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2.5 mt-5 text-11 font-medium text-muted-ink">{title}</h3>
      {rows.map((r, i) => {
        const v = r.role === 'empty' ? null : value(r);
        return (
          <div key={`${r.role}-${i}`} data-role={r.role} className="mb-2 grid grid-cols-[170px_1fr_60px] items-center gap-3 text-13">
            <span className={r.role === 'empty' ? 'text-muted-ink' : 'truncate'}>{r.role === 'empty' ? 'Rival' : r.role === 'you' ? `${r.name} (you)` : r.name}</span>
            <span className="block">
              {v === null ? (
                <span className="block h-3.5 rounded border border-dashed border-line-control" />
              ) : (
                <span className="block h-3.5 rounded-r" style={{ width: `${Math.max(2, Math.min(100, (v / max) * 100))}%`, background: SCORE_COLORS[r.role === 'empty' ? 'context' : r.role] }} />
              )}
            </span>
            <span className={`text-right font-semibold tabular-nums ${v === null ? 'text-muted-ink' : ''}`}>{v === null ? '–' : format(v)}</span>
          </div>
        );
      })}
    </section>
  );
}

/**
 * Client step 4 preview, "Where you stand": Google rating and review count for the business and, as they are ticked, up
 * to two rivals (the first two ticked; the rest only show in the brief). Values sit beside every bar, so colour is never
 * the only carrier. Drawn in the chart-role colours, not the agency's.
 */
export function Scorecard({ you, rivals }: { you: { name: string; rating: number | null; reviews: number | null }; rivals: { name: string; rating: number | null; reviews: number | null }[] }) {
  const picked = rivals.slice(0, 2);
  const rows: ScoreRow[] = [
    { ...you, role: 'you' },
    ...picked.map((r, i): ScoreRow => ({ ...r, role: i === 0 ? 'rival1' : 'rival2' })),
    ...Array.from({ length: 2 - picked.length }, (): ScoreRow => ({ name: '', rating: null, reviews: null, role: 'empty' })),
  ];
  const maxReviews = Math.max(1, ...rows.map((r) => r.reviews ?? 0));
  return (
    <div className="px-7 py-6">
      <div className="text-base font-semibold">Where you stand</div>
      <div className="mt-1 text-xs text-muted-ink">Google rating and reviews</div>
      <div className="mt-3.5 flex flex-wrap gap-4 text-xs text-muted-ink">
        {rows.filter((r) => r.role !== 'empty').map((r) => (
          <span key={r.role} className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className="size-2 rounded-full" style={{ background: SCORE_COLORS[r.role as 'you'] }} />
            {r.role === 'you' ? `${r.name} (you)` : r.name}
          </span>
        ))}
        {picked.length === 0 && (
          <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2 rounded-full" style={{ background: SCORE_COLORS.context }} />Rivals you tick</span>
        )}
      </div>
      <Bars title="Rating" rows={rows} value={(r) => r.rating} max={5} format={(v) => v.toFixed(1)} />
      <Bars title="Reviews" rows={rows} value={(r) => r.reviews} max={maxReviews} format={(v) => String(v)} />
    </div>
  );
}
