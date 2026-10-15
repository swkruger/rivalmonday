import type { ScorecardModel } from '@cs/email';
import { StatCard } from '@/components/stat-card';
import { TierChip } from '@/components/rival/tier-chip';

/** "▲ 4 since your starting point" → glyph + spoken label + plain text, so colour never carries the meaning alone. */
function pillOf(t: ScorecardModel['tiles'][number]) {
  if (!t.trendText) return null;
  if (!t.trend) return { text: t.trendText, tone: 'info' as const };
  return { glyph: t.trend === 'up' ? '▲' : '▼', srLabel: t.trend === 'up' ? 'Up' : 'Down', text: t.trendText.slice(2), tone: t.trend === 'up' ? ('up' as const) : ('down' as const) };
}

/** Four stat tiles then the compact scorecard table; shared by the starting-point and quiet-week briefs. */
export function Scorecard({ model }: { model: ScorecardModel }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {model.tiles.map((t) => (
          <StatCard key={t.label} title={t.label} value={t.value} hint={t.sub} pill={pillOf(t)} />
        ))}
      </div>
      <div className="overflow-x-auto rounded-[10px] bg-muted-surface">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Scorecard: you against the rivals we watch</caption>
          <thead>
            <tr className="text-left text-xs font-semibold text-muted-foreground">
              {model.table.headers.map((h, i) => (
                <th key={h} scope="col" className={`px-3 py-2 ${i === 0 ? '' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.table.rows.map((r, ri) => (
              <tr key={ri} className={r.self ? 'bg-primary-soft font-bold' : ''}>
                {r.cells.map((c, i) => (
                  <td key={i} className={`px-3 py-2 ${i === 0 ? '' : 'text-right tabular-nums'}`}>
                    {i === 0 ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {c}
                        {r.tier && <TierChip tier={r.tier} />}
                      </span>
                    ) : (
                      c
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OpenFirstMoves({ moves }: { moves: string[] }) {
  if (moves.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1.5 text-[15px] font-bold">First moves still open</h3>
      <ul className="list-disc pl-5">
        {moves.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </section>
  );
}
