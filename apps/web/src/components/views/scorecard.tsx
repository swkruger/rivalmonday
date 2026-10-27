import type { ScorecardModel } from '@cs/email';
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { StatStrip } from '@/components/stat-strip';
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
      <StatStrip items={model.tiles.map((t) => ({ title: t.label, value: t.value, hint: t.sub, pill: pillOf(t) }))} />
      <TableFrame>
        <Table density="compact">
          <caption className="sr-only">Scorecard: you against the rivals we watch</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {model.table.headers.map((h, i) => (
                <TableHead key={h} scope="col" numeric={i !== 0}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.table.rows.map((r, ri) => (
              <TableRow key={ri} className={r.self ? 'bg-primary-soft font-semibold' : ''}>
                {r.cells.map((c, i) => (
                  <TableCell key={i} numeric={i !== 0}>
                    {i === 0 ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {c}
                        {r.tier && <TierChip tier={r.tier} />}
                      </span>
                    ) : (
                      c
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
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
