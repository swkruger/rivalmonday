import { and, gte, inArray, notInArray, sql } from 'drizzle-orm';
import type { Db, Tx } from './client';
import { llmCall, vendorCall } from './schema';

/** Decision 6: usage months are calendar months in UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Providers whose llm_call rows stay in the ledger but never count towards client spend or the spike guard (7b1). The one place.
 * Empty since jev-openrouter: Jev cost is real OpenRouter cost, so it counts like any provider.
 */
export const SPEND_GUARD_EXCLUDED_PROVIDERS: readonly string[] = [];

/** `llm_call.provider NOT IN (excluded)`; undefined (filters nothing) when the list is empty, so `and()` skips it. */
export function llmProviderCounted(excluded: readonly string[] = SPEND_GUARD_EXCLUDED_PROVIDERS) {
  return excluded.length === 0 ? undefined : notInArray(llmCall.provider, [...excluded]);
}

const sqlArray = (items: readonly string[], type: 'uuid' | 'text') =>
  sql`ARRAY[${sql.join(items.map((x) => sql`${x}`), sql`, `)}]::${sql.raw(type)}[]`;

/**
 * The clients that currently "track" a competitor and so share its collection cost (O11): `client_competitor` rows plus a
 * client's own self competitor, for active/prospect, non-archived, non-paused clients. A spend pause does not remove a tracker.
 * Exported as `trackers (competitor_id, client_id)` for use as a CTE body.
 */
export const TRACKERS_CTE = sql`
  SELECT cc.competitor_id, cc.client_id FROM client_competitor cc JOIN client c ON c.id = cc.client_id
   WHERE c.archived_at IS NULL AND c.status IN ('active','prospect') AND c.paused_at IS NULL
  UNION
  SELECT c.self_competitor_id, c.id FROM client c
   WHERE c.self_competitor_id IS NOT NULL AND c.archived_at IS NULL AND c.status IN ('active','prospect') AND c.paused_at IS NULL`;

const rowsOf = async <T>(db: Db | Tx, q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];

/** competitor id -> ids of the clients currently tracking it (competitors nobody tracks are absent). */
export async function competitorTrackers(db: Db | Tx, competitorIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (competitorIds.length === 0) return out;
  const rows = await rowsOf<{ competitor_id: string; client_id: string }>(
    db,
    sql`WITH trackers AS (${TRACKERS_CTE}) SELECT competitor_id, client_id FROM trackers WHERE competitor_id = ANY(${sqlArray(competitorIds, 'uuid')})`,
  );
  for (const r of rows) out.set(r.competitor_id, [...(out.get(r.competitor_id) ?? []), r.client_id]);
  return out;
}

/**
 * Sum of this period's llm_call + vendor_call cost per client (null cost counts as 0): the client-attributed rows
 * (any excluded provider skipped on llm_call; none today) plus an equal share of every shared competitor row per current tracker (O11).
 */
export async function spendByClient(db: Db | Tx, clientIds: string[], since: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (clientIds.length === 0) return out;
  for (const table of [llmCall, vendorCall]) {
    const where = [inArray(table.clientId, clientIds), gte(table.createdAt, since)];
    const counted = table === llmCall ? llmProviderCounted() : undefined;
    if (counted) where.push(counted);
    const rows = await db
      .select({ id: table.clientId, usd: sql<number>`coalesce(sum(${table.costUsd}), 0)::float8` })
      .from(table)
      .where(and(...where))
      .groupBy(table.clientId);
    for (const r of rows) if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + Number(r.usd));
  }
  const sinceTs = sql`${since.toISOString()}::timestamptz`;
  const excluded = sqlArray(SPEND_GUARD_EXCLUDED_PROVIDERS, 'text');
  const shares = await rowsOf<{ client_id: string; usd: number }>(
    db,
    sql`WITH trackers AS (${TRACKERS_CTE}),
n AS (SELECT competitor_id, count(*)::numeric AS k FROM trackers GROUP BY competitor_id),
shared AS (
  SELECT competitor_id, sum(cost_usd) AS usd FROM llm_call
   WHERE client_id IS NULL AND competitor_id IS NOT NULL AND created_at >= ${sinceTs} AND provider <> ALL(${excluded}) GROUP BY competitor_id
  UNION ALL
  SELECT competitor_id, sum(cost_usd) FROM vendor_call
   WHERE client_id IS NULL AND competitor_id IS NOT NULL AND created_at >= ${sinceTs} GROUP BY competitor_id)
SELECT t.client_id, coalesce(sum(s.usd / n.k), 0)::float8 AS usd
  FROM shared s JOIN n USING (competitor_id) JOIN trackers t USING (competitor_id)
 WHERE t.client_id = ANY(${sqlArray(clientIds, 'uuid')}) GROUP BY t.client_id`,
  );
  for (const r of shares) out.set(r.client_id, (out.get(r.client_id) ?? 0) + Number(r.usd));
  return out;
}
