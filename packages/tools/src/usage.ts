import { type Db, llmCall, monthStart, spendByClient, vendorCall } from '@cs/db';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { SPEND_WARNING_RATIO } from './limits';

export { monthStart, spendByClient };

export type SpendLevel = 'ok' | 'warning' | 'over';

export function spendLevel(spent: number, cap: number): SpendLevel {
  if (spent >= cap) return 'over';
  return spent >= cap * SPEND_WARNING_RATIO ? 'warning' : 'ok';
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
