/** Decision 6 (5b-2): defaults for the per-client columns `client.competitor_limit` / `client.monthly_cap_usd` (spec §4.1, §11). */
export const DEFAULT_COMPETITOR_LIMIT = 5;
export const MAX_COMPETITOR_LIMIT = 10;
export const DEFAULT_MONTHLY_CAP_USD = 15;
export const MAX_MONTHLY_CAP_USD = 10000;
/** Spec §11: warn at 80 % of the monthly cap (enforcement is Phase 7). */
export const SPEND_WARNING_RATIO = 0.8;
/** Spec §4.1: cap ≈ 25 tracked pages per competitor. */
export const MAX_ACTIVE_PAGES = 25;
/** Decision 17 (5b-2): a new paid competitor search waits this long after the client's last one finished. */
export const RIVAL_SEARCH_COOLDOWN_MINUTES = 10;
/** Phase 12a D7: competitor searches (discovery runs) per agency per UTC day, any trigger and status. */
export const RIVAL_SEARCHES_PER_AGENCY_DAY = 5;
/** Phase 12a D4 (P7): converting a prospect reuses its last finished search when it is at most this old. */
export const RIVAL_SEARCH_REUSE_DAYS = 30;
/** Phase 13b: manual "Scan now" — one per client per 7 days, and at most 10 per agency per UTC day. */
export const RANK_MANUAL_PER_CLIENT_DAYS = 7;
export const RANK_MANUAL_PER_AGENCY_DAY = 10;
