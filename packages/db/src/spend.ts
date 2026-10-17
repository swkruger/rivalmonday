import { and, gte, inArray, sql } from 'drizzle-orm';
import type { Db, Tx } from './client';
import { llmCall, vendorCall } from './schema';

/** Decision 6: usage months are calendar months in UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Sum of this period's attributed llm_call + vendor_call cost per client (rows with a null cost count as 0). */
export async function spendByClient(db: Db | Tx, clientIds: string[], since: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (clientIds.length === 0) return out;
  for (const table of [llmCall, vendorCall]) {
    const rows = await db
      .select({ id: table.clientId, usd: sql<number>`coalesce(sum(${table.costUsd}), 0)::float8` })
      .from(table)
      .where(and(inArray(table.clientId, clientIds), gte(table.createdAt, since)))
      .groupBy(table.clientId);
    for (const r of rows) if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + Number(r.usd));
  }
  return out;
}
