import { client, type Db, effectiveLimitUsd, monthStart, pauseThresholdUsd, readSpendGuardSettings, spendByClient, type Tx } from '@cs/db';
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
): Promise<{ ok: true } | { ok: false; reason: 'cap' }> {
  const [row] = await db.select({ limit: client.spendLimitUsd }).from(client).where(eq(client.id, clientId));
  if (!row) return { ok: true };
  const settings = await readSpendGuardSettings(db);
  // A scan may run until it would cross the pause threshold (limit x pause percent), not the limit itself (spec d15).
  const threshold = pauseThresholdUsd(effectiveLimitUsd(row.limit, settings), settings);
  const spentUsd = (await spendByClient(db, [clientId], monthStart(now))).get(clientId) ?? 0;
  // Compare in micro-dollars so float noise cannot refuse a scan that lands exactly on the threshold.
  if (Math.round((spentUsd + estimateUsd) * 1e6) <= Math.round(threshold * 1e6)) return { ok: true };
  return { ok: false, reason: 'cap' };
}
