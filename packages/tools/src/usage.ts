import { type Db, llmCall, type Tx, vendorCall } from '@cs/db';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { SPEND_WARNING_RATIO } from './limits';

export type SpendLevel = 'ok' | 'warning' | 'over';

/** Decision 6: usage months are calendar months in UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function spendLevel(spent: number, cap: number): SpendLevel {
  if (spent >= cap) return 'over';
  return spent >= cap * SPEND_WARNING_RATIO ? 'warning' : 'ok';
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

/** Calls attributed to the agency but no client (e.g. agency notices); platform-level rows (agency_id NULL) are not included. */
export async function agencyLevelSpend(db: Db, agencyId: string, since: Date): Promise<number> {
  let total = 0;
  for (const table of [llmCall, vendorCall]) {
    const [r] = await db
      .select({ usd: sql<number>`coalesce(sum(${table.costUsd}), 0)::float8` })
      .from(table)
      .where(and(eq(table.agencyId, agencyId), isNull(table.clientId), gte(table.createdAt, since)));
    total += Number(r?.usd ?? 0);
  }
  return total;
}
