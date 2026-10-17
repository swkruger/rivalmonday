/** Phase 13b: shared types and copy for the Rank settings sheet and the Scan now button (no runtime imports, so client components can use it). */
export type RankScanState = 'available' | 'weekly_limit' | 'agency_daily_limit' | 'cap' | 'running' | 'not_ready';
export type RankScanInfo = { state: RankScanState; nextAvailableAt: string | null; label: string | null };
/** `get_rank_settings` output. */
export type RankSettingsView = { keywords: string[]; allKeywords: string[]; gridSize: 5 | 7; radiusKm: number | null; scan: RankScanInfo };
export type RankScanRefusal = 'weekly_limit' | 'agency_daily_limit' | 'cap' | 'not_ready';

export const MAX_RANK_KEYWORDS = 5;
export const SCAN_RUNNING = 'Scan running…';
export const SETTINGS_SAVED = 'Saved. The next scan uses these settings.';
export const SCAN_NOT_QUEUED = 'The scan could not be started. Try again in a few minutes.';
export const scanQueuedMessage = (minutes: number) => `Scan queued — results in about ${minutes} minutes.`;
