import 'server-only';
import type { AccessContext } from '@cs/core';
import { cache } from 'react';
import { tryCallTool } from './tools';

/**
 * The client's name for the help copy (`{client}`), or null when unreadable. Never refuses: pages do their own access checks.
 * Kept apart from `help.ts` so the demo coverage scan sees `get_client_profile` only where a page really reads it.
 */
export const helpClientName = cache(async (ctx: AccessContext, clientId: string): Promise<string | null> => {
  try {
    return (await tryCallTool<{ name: string }>(ctx, 'get_client_profile', { clientId }))?.name ?? null;
  } catch {
    return null;
  }
});
