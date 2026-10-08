import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/**
 * Decision 13: weekly active-ad counts per competitor, oldest → newest, the last point at `now`; `null` before the
 * competitor's first ok ad capture ("not looking yet", never 0).
 *
 * Twin of the engine's `adActivity` (`packages/engine/src/moves/moves-stage.ts`): same ad-at-time predicate and the
 * same first-capture rule. A change to either rule must be made in both (preflight D3).
 */
export async function adWeeklySeries(db: Db, competitorIds: string[], now: Date, weeks: number): Promise<Map<string, (number | null)[]>> {
  const out = new Map<string, (number | null)[]>(competitorIds.map((id) => [id, Array<number | null>(weeks).fill(null)]));
  if (competitorIds.length === 0) return out;
  const ids = sql`ARRAY[${sql.join(competitorIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;
  const at = now.toISOString();
  const rows = (await db.execute(sql`
    WITH weeks AS (SELECT w.i, ${at}::timestamptz - make_interval(days => 7 * w.i) AS at FROM generate_series(0, ${weeks - 1}::int) AS w(i)),
    firsts AS (SELECT competitor_id, min(captured_at) AS t FROM capture
               WHERE competitor_id = ANY(${ids}) AND source IN ('google_ads', 'meta_ads') AND status = 'ok' GROUP BY competitor_id)
    SELECT c.id::text AS competitor_id, w.i,
      CASE WHEN f.t IS NULL OR w.at < f.t THEN NULL ELSE (
        SELECT count(*)::int FROM ad a WHERE a.competitor_id = c.id AND a.first_seen_at <= w.at AND (a.is_active OR coalesce(a.ended_at, a.last_seen_at) > w.at)
      ) END AS n
    FROM unnest(${ids}) AS c(id) CROSS JOIN weeks w LEFT JOIN firsts f ON f.competitor_id = c.id`)) as unknown as { competitor_id: string; i: number; n: number | null }[];
  for (const r of rows) out.get(r.competitor_id)![weeks - 1 - Number(r.i)] = r.n === null ? null : Number(r.n);
  return out;
}
