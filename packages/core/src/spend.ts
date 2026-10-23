import type { CallScope } from './ledger';

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

/** Phase 7b1: every provider call asks the guard first; it throws `AiPausedError` while the platform or the call's client is spend-paused. */
export interface AiGuard { assertAllowed(scope: CallScope): Promise<void> }

export class AiPausedError extends Error {
  constructor(readonly reason: 'platform' | 'client') {
    super(`AI paused (${reason})`);
    this.name = 'AiPausedError';
  }
}

/** S1 (owner sign-off): shown to the tenant when one client's AI work is spend-paused. */
export const SPEND_PAUSED_COPY = "AI work for this client is paused for the rest of this month — it went well past this month's credits.";
/** C5 (owner text): shown when the platform-wide guard is paused. */
export const SYSTEM_BUSY_COPY = 'The system is currently experiencing heavy load — please try again later.';
