import type { ThemeBenchmarkView } from '@cs/tools';

const INK = '#0B2540';
const WHITE = '#FFFFFF';
const LINE = '#E2E8F0';
const NEUTRAL = '#f0efec';

/** Decision 12: diverging sentiment steps (validated 2026-10-08); share null → blank cell. */
export function sentimentFill(sentiment: number | null, share: number | null): { fill: string; text: string; stroke: string | null } {
  if (share === null) return { fill: WHITE, text: '#64748B', stroke: LINE };
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
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}`;
const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Module 6 heatmap: rows = themes, columns = businesses (you first). Colour = sentiment of mentions, number = mention share. */
export function ThemeHeatmap({ title, benchmark }: { title: string; benchmark: Pick<ThemeBenchmarkView, 'themes' | 'businesses'> }) {
  const { themes, businesses } = benchmark;
  if (themes.length === 0 || businesses.length === 0) return <p className="text-sm text-muted-foreground">No reviews analysed yet.</p>;
  const LABEL_W = 200;
  const COL_W = 104;
  const ROW_H = 34;
  const HEAD_H = 40;
  const GAP = 2;
  const W = LABEL_W + businesses.length * COL_W;
  const H = HEAD_H + themes.length * ROW_H;
  const colName = (b: (typeof businesses)[number]) => (b.self ? 'You' : b.name);
  const cell = (b: (typeof businesses)[number], themeId: string) => b.themes.find((x) => x.themeId === themeId) ?? null;
  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${themes.length} themes for ${businesses.length} businesses; colour shows how positive mentions are, the number how often the theme comes up.`} style={{ minWidth: Math.round(W * 0.75) }} className="w-full">
          {businesses.map((b, j) => (
            <g key={b.competitorId}>
              <title>{b.name}</title>
              <text data-head x={LABEL_W + j * COL_W + COL_W / 2} y={HEAD_H - 14} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK}>
                {short(colName(b))}
              </text>
            </g>
          ))}
          {themes.map((th, i) => (
            <g key={th.id}>
              <text x={LABEL_W - 10} y={HEAD_H + i * ROW_H + ROW_H / 2 + 4} textAnchor="end" fontSize={12} fill={INK}>{short(th.name, 28)}</text>
              {businesses.map((b, j) => {
                const c = cell(b, th.id);
                const share = c?.share ?? null;
                const f = sentimentFill(c?.sentiment ?? null, share);
                const arrow = c?.shareDelta != null && Math.abs(c.shareDelta) >= 0.05 ? (c.shareDelta > 0 ? ' ▲' : ' ▼') : '';
                const label = share === null ? '—' : `${pct(share)}${arrow}`;
                const tip = share === null
                  ? `${b.name}: ${th.name} — not enough reviews`
                  : `${b.name}: ${th.name} — mentioned in ${pct(share)} of reviews that could mention it${c?.sentiment != null ? `, sentiment ${signed(c.sentiment)}` : ''}${c?.shareDelta != null ? ` (${signed(c.shareDelta * 100)} points vs the previous 90 days)` : ''}`;
                return (
                  <g key={b.competitorId}>
                    <rect x={LABEL_W + j * COL_W + GAP / 2} y={HEAD_H + i * ROW_H + GAP / 2} width={COL_W - GAP} height={ROW_H - GAP} rx={4} fill={f.fill} stroke={f.stroke ?? 'none'} strokeWidth={f.stroke ? 1 : 0}>
                      <title>{tip}</title>
                    </rect>
                    <text data-cell={`${th.id}|${b.competitorId}`} x={LABEL_W + j * COL_W + COL_W / 2} y={HEAD_H + i * ROW_H + ROW_H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={f.text} pointerEvents="none">
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
        <li className="text-muted-foreground">— not enough reviews · ▲▼ share changed by 5+ points</li>
      </ul>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Theme</th>
                {businesses.map((b) => <th key={b.competitorId} scope="col">{colName(b)}</th>)}
              </tr>
            </thead>
            <tbody>
              {themes.map((th) => (
                <tr key={th.id}>
                  <th scope="row" className="font-normal">{th.name}</th>
                  {businesses.map((b) => {
                    const c = cell(b, th.id);
                    return <td key={b.competitorId}>{c?.share == null ? '—' : `${pct(c.share)}${c.sentiment != null ? ` · ${signed(c.sentiment)}` : ''}`}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
