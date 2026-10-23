/** Phase 7b1: what tenants see of spend — integer credits and a calm level, never dollars. */
export type SpendLevel = 'ok' | 'near' | 'reached' | 'paused';

/** Badge-only "near" threshold (80 % of the client's monthly limit). */
export const SPEND_NEAR_RATIO = 0.8;

export function usdToCredits(usd: number, creditsPerUsd: number): number {
  return Math.round(usd * creditsPerUsd);
}

/** paused > reached (spend ≥ limit) > near (≥ 80 %) > ok. */
export function spendLevel(spentUsd: number, limitUsd: number, spendPausedAt: Date | string | null): SpendLevel {
  if (spendPausedAt) return 'paused';
  if (spentUsd >= limitUsd) return 'reached';
  return spentUsd >= limitUsd * SPEND_NEAR_RATIO ? 'near' : 'ok';
}
