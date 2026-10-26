import { type Db, llmCall, llmProviderCounted, monthStart, spendByClient, vendorCall } from '@cs/db';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';

export { monthStart, spendByClient };

/** Calls attributed to the agency but no client (e.g. agency notices); platform-level rows (agency_id NULL) are not included. Every provider counts (Jev too, since jev-openrouter) except any in `SPEND_GUARD_EXCLUDED_PROVIDERS`. */
export async function agencyLevelSpend(db: Db, agencyId: string, since: Date): Promise<number> {
  let total = 0;
  for (const table of [llmCall, vendorCall]) {
    const where = [eq(table.agencyId, agencyId), isNull(table.clientId), gte(table.createdAt, since)];
    const counted = table === llmCall ? llmProviderCounted() : undefined;
    if (counted) where.push(counted);
    const [r] = await db
      .select({ usd: sql<number>`coalesce(sum(${table.costUsd}), 0)::float8` })
      .from(table)
      .where(and(...where));
    total += Number(r?.usd ?? 0);
  }
  return total;
}
