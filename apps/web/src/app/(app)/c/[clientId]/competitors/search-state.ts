/** The suggestions panel's search states. */
export type SearchState = 'idle' | 'queued' | 'running' | 'done' | 'failed';

/**
 * 12a: discovery_run stages → the panel's states (until the 12a suggestions UI replaces it). Lives outside
 * `actions.ts` because a 'use server' module may export only async functions.
 */
export const RUN_STATE: Record<string, SearchState> = { none: 'idle', queued: 'queued', searching: 'running', checking: 'running', finalising: 'running', done: 'done', failed: 'failed' };
