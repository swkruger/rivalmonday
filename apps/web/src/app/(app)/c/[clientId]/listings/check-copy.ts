/** 18c-2: shared types and copy for the Check listings now button (no runtime imports, so client components can use it). */
export type CheckState = 'available' | 'weekly_limit' | 'agency_daily_limit' | 'running' | 'not_ready' | 'spend_paused';
export type CheckRefusal = Exclude<CheckState, 'available'>;
export type CheckInfo = { state: CheckState; label: string | null };

export const CHECK_NOW = 'Check listings now';
export const CHECK_RUNNING = 'Check running…';
export const CHECK_QUEUED = 'Check started. Results appear here in a few minutes.';
export const CHECK_NOT_QUEUED = 'The check could not be started. Try again in a few minutes.';
export const checkDailyLimit = (n: number) => `Your agency has used today's ${n} manual listing checks.`;
export const CHECK_NOT_READY = 'Add competitors and link the Google listing (and make sure the client is active) before checking.';
export const CHECK_ALREADY_RUNNING = 'A listings check is already running for this client.';
export const checkNextAvailable = (date: string) => `Next check available ${date}`;
