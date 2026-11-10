import { client, type Db, effectiveLimitUsd, monthStart, pauseThresholdUsd, readSpendGuardSettings, spendByClient, type Tx } from '@cs/db';
import { eq } from 'drizzle-orm';
import { DISCOVERY_CALL_COST_USD } from '../rivals/cost';
import { SERP_CALL_USD } from './serp';
import { rankKeywordsFor, type RankClient } from './settings';

/** calls = keywords × gridSize² (one maps call each); usd adds one Google search per keyword (18b-2). */
export function estimateRankScanUsd(c: RankClient): { calls: number; usd: number } {
  const keywords = rankKeywordsFor(c).length;
  const calls = keywords * c.rankGridSize ** 2;
  return { calls, usd: calls * DISCOVERY_CALL_COST_USD.maps + keywords * SERP_CALL_USD };
}

export async function checkRankScanBudget(
  db: Db | Tx,
  clientId: string,
  estimateUsd: number,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'cap' }> {
  // Launch-gate 6b: the limit, the guard settings and this month's spend are read together.
  const [[row], settings, spend] = await Promise.all([
    db.select({ limit: client.spendLimitUsd }).from(client).where(eq(client.id, clientId)),
    readSpendGuardSettings(db),
    spendByClient(db, [clientId], monthStart(now)),
  ]);
  if (!row) return { ok: true };
  // A scan may run until it would cross the pause threshold (limit x pause percent), not the limit itself (spec d15).
  const threshold = pauseThresholdUsd(effectiveLimitUsd(row.limit, settings), settings);
  const spentUsd = spend.get(clientId) ?? 0;
  // Compare in micro-dollars so float noise cannot refuse a scan that lands exactly on the threshold.
  if (Math.round((spentUsd + estimateUsd) * 1e6) <= Math.round(threshold * 1e6)) return { ok: true };
  return { ok: false, reason: 'cap' };
}
