import { type Db, llmCall, monthStart, SPEND_GUARD_EXCLUDED_PROVIDERS, spendByClient, vendorCall } from '@cs/db';
import { and, eq, gte, isNull, notInArray, sql } from 'drizzle-orm';

export { monthStart, spendByClient };

/** Calls attributed to the agency but no client (e.g. agency notices); platform-level rows (agency_id NULL) are not included. Excluded providers (Jev) never count. */
export async function agencyLevelSpend(db: Db, agencyId: string, since: Date): Promise<number> {
  let total = 0;
  for (const table of [llmCall, vendorCall]) {
    const where = [eq(table.agencyId, agencyId), isNull(table.clientId), gte(table.createdAt, since)];
    if (table === llmCall) where.push(notInArray(llmCall.provider, [...SPEND_GUARD_EXCLUDED_PROVIDERS]));
    const [r] = await db
      .select({ usd: sql<number>`coalesce(sum(${table.costUsd}), 0)::float8` })
      .from(table)
      .where(and(...where));
    total += Number(r?.usd ?? 0);
  }
  return total;
}
