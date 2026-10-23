import { client, type Db, effectiveLimitUsd, monthStart, readSpendGuardSettings, spendByClient, type Tx } from '@cs/db';
import { eq } from 'drizzle-orm';
import { DISCOVERY_CALL_COST_USD } from '../rivals/cost';
import { rankKeywordsFor, type RankClient } from './settings';

/** calls = keywords × gridSize²; one maps call each. */
export function estimateRankScanUsd(c: RankClient): { calls: number; usd: number } {
  const calls = rankKeywordsFor(c).length * c.rankGridSize ** 2;
  return { calls, usd: calls * DISCOVERY_CALL_COST_USD.maps };
}

export async function checkRankScanBudget(
  db: Db | Tx,
  clientId: string,
  estimateUsd: number,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'cap'; spentUsd: number; capUsd: number }> {
  const [row] = await db.select({ limit: client.spendLimitUsd }).from(client).where(eq(client.id, clientId));
  if (!row) return { ok: true };
  const cap = effectiveLimitUsd(row.limit, await readSpendGuardSettings(db));
  const spentUsd = (await spendByClient(db, [clientId], monthStart(now))).get(clientId) ?? 0;
  // Compare in micro-dollars so float noise cannot refuse a scan that lands exactly on the cap.
  if (Math.round((spentUsd + estimateUsd) * 1e6) <= Math.round(cap * 1e6)) return { ok: true };
  return { ok: false, reason: 'cap', spentUsd, capUsd: cap };
}
