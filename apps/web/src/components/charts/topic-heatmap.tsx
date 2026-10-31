import type { TopicBenchmarkView } from '@cs/tools';

const INK = 'var(--ink)';
const WHITE = 'var(--surface)';
const LINE = 'var(--chart-grid)';
const NEUTRAL = '#f0efec';

/** Decision 12: diverging sentiment steps (validated 2026-10-08); share null → blank cell. */
export function sentimentFill(sentiment: number | null, share: number | null): { fill: string; text: string; stroke: string | null } {
  if (share === null) return { fill: WHITE, text: 'var(--chart-axis)', stroke: LINE };
  if (sentiment === null) return { fill: NEUTRAL, text: INK, stroke: LINE };
  if (sentiment <= -0.5) return { fill: '#d03b3b', text: WHITE, stroke: null };
  if (sentiment < -0.15) return { fill: '#f19c99', text: INK, stroke: null };
  if (sentiment <= 0.15) return { fill: NEUTRAL, text: INK, stroke: LINE };
  if (sentiment < 0.5) return { fill: '#86b6ef', text: INK, stroke: null };
  return { fill: '#256abf', text: WHITE, stroke: null };
}

const LEGEND: { label: string; s: number }[] = [
  { label: 'Very negative', s: -1 }, { label: 'Negative', s: -0.3 }, { label: 'Neutral', s: 0 }, { label: 'Positive', s: 0.3 }, { label: 'Very positive', s: 1 },
];
/** Legend label of the step a sentiment falls in (same fills as the chart). */
function sentimentWord(sentiment: number | null): string {
  if (sentiment === null) return 'No sentiment';
  const fill = sentimentFill(sentiment, 1).fill;
  return LEGEND.find((l) => sentimentFill(l.s, 1).fill === fill)!.label;
}
type HeatCell = { share: number | null; sentiment: number | null; shareDelta: number | null } | null;
/** One text for a cell, shared by the SVG tooltip and the table: "34% · Positive · ▲ 8 pts", "—" without data. */
export function cellText(c: HeatCell): string {
  if (c?.share == null) return '—';
  const d = c.shareDelta != null && Math.abs(c.shareDelta) >= 0.05 ? ` · ${c.shareDelta > 0 ? '▲' : '▼'} ${Math.round(Math.abs(c.shareDelta) * 100)} pts` : '';
  return `${pct(c.share)} · ${sentimentWord(c.sentiment)}${d}`;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Module 6 heatmap: rows = topics, columns = businesses (you first). Colour = sentiment of mentions, number = mention share. */
export function TopicHeatmap({ title, benchmark }: { title: string; benchmark: Pick<TopicBenchmarkView, 'topics' | 'businesses'> }) {
  const { topics, businesses } = benchmark;
  if (topics.length === 0 || businesses.length === 0) return <p className="text-sm text-muted-foreground">No reviews analysed yet.</p>;
  const LABEL_W = 200;
  const COL_W = 104;
  const ROW_H = 34;
  const HEAD_H = 40;
  const GAP = 2;
  const W = LABEL_W + businesses.length * COL_W;
  const H = HEAD_H + topics.length * ROW_H;
  const colName = (b: (typeof businesses)[number]) => (b.self ? 'You' : b.name);
  const cell = (b: (typeof businesses)[number], topicId: string) => b.topics.find((x) => x.topicId === topicId) ?? null;
  return (
    <figure className="flex flex-col gap-2">
      <div tabIndex={0} role="region" aria-label={title} className="overflow-x-auto focus-visible:outline-2 outline-offset-2 outline-ring">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${topics.length} topics for ${businesses.length} businesses; colour shows how positive mentions are, the number how often the topic comes up.`} style={{ width: W, minWidth: W }} className="max-w-none">
          {businesses.map((b, j) => (
            <g key={b.competitorId}>
              <title>{b.name}</title>
              <text data-head x={LABEL_W + j * COL_W + COL_W / 2} y={HEAD_H - 14} textAnchor="middle" fontSize={12} fontWeight={600} fill={b.self ? 'var(--you)' : INK}>
                {short(colName(b))}
              </text>
            </g>
          ))}
          {topics.map((tp, i) => (
            <g key={tp.id}>
              <text x={LABEL_W - 10} y={HEAD_H + i * ROW_H + ROW_H / 2 + 4} textAnchor="end" fontSize={12} fill={INK}>{short(tp.name, 28)}</text>
              {businesses.map((b, j) => {
                const c = cell(b, tp.id);
                const share = c?.share ?? null;
                const f = sentimentFill(c?.sentiment ?? null, share);
                const arrow = c?.shareDelta != null && Math.abs(c.shareDelta) >= 0.05 ? (c.shareDelta > 0 ? ' ▲' : ' ▼') : '';
                const label = share === null ? '—' : `${pct(share)}${arrow}`;
                const tip = `${b.name}, ${tp.name}: ${cellText(c)}${share === null ? ' (not enough reviews)' : ''}`;
                return (
                  <g key={b.competitorId}>
                    <rect x={LABEL_W + j * COL_W + GAP / 2} y={HEAD_H + i * ROW_H + GAP / 2} width={COL_W - GAP} height={ROW_H - GAP} rx={4} fill={f.fill} stroke={f.stroke ?? 'none'} strokeWidth={f.stroke ? 1 : 0}>
                      <title>{tip}</title>
                    </rect>
                    <text data-cell={`${tp.id}|${b.competitorId}`} x={LABEL_W + j * COL_W + COL_W / 2} y={HEAD_H + i * ROW_H + ROW_H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={f.text} pointerEvents="none">
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink">
        {LEGEND.map((l) => {
          const f = sentimentFill(l.s, 1);
          return (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-4 rounded-sm" style={{ background: f.fill, outline: f.stroke ? `1px solid ${f.stroke}` : undefined }} />
              <span>{l.label}</span>
            </li>
          );
        })}
        <li className="text-muted-foreground">— not enough reviews</li>
      </ul>
      {/* source: packages/engine/src/reviews/benchmark.ts (BENCHMARK_WINDOW_DAYS = 90; shareDelta = share − previous-window share) and the arrow rule above (|shareDelta| >= 0.05) */}
      <p data-testid="heatmap-legend" className="text-xs text-muted-ink">
        Color shows how positive the mentions are. The number is the share of reviews checked for the topic that mention it. ▲▼ the share moved by 5 or more points compared with the previous 90 days.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-muted-surface-2">
                <th scope="col" className="px-3 py-2 font-semibold text-ink">Topic</th>
                {businesses.map((b) => <th key={b.competitorId} scope="col" className={`px-3 py-2 text-right font-semibold ${b.self ? 'text-you' : 'text-ink'}`}>{colName(b)}</th>)}
              </tr>
            </thead>
            <tbody>
              {topics.map((tp) => (
                <tr key={tp.id} className="border-b border-muted-surface-2 last:border-0">
                  <th scope="row" className="px-3 py-2 font-normal text-ink">{tp.name}</th>
                  {businesses.map((b) => <td key={b.competitorId} className="px-3 py-2 text-right tabular-nums">{cellText(cell(b, tp.id))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
