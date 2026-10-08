/** Decision 6 (5b-2): defaults for the per-client columns `client.competitor_limit` / `client.monthly_cap_usd` (spec §4.1, §11). */
export const DEFAULT_COMPETITOR_LIMIT = 5;
export const MAX_COMPETITOR_LIMIT = 10;
export const DEFAULT_MONTHLY_CAP_USD = 15;
export const MAX_MONTHLY_CAP_USD = 10000;
/** Spec §11: warn at 80 % of the monthly cap (enforcement is Phase 7). */
export const SPEND_WARNING_RATIO = 0.8;
/** Spec §4.1: cap ≈ 25 tracked pages per competitor. */
export const MAX_ACTIVE_PAGES = 25;
/** Decision 17 (5b-2): a new paid competitor search waits this long after the last one finished. */
export const SUGGEST_COOLDOWN_MINUTES = 10;
