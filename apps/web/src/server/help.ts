import 'server-only';
import type { AccessContext } from '@cs/core';
import { cache } from 'react';
import { tryCallTool } from './tools';

export type HelpContext = 'platform' | 'agency' | 'client';

/**
 * 15b-1: the help keys that have a guide for this viewer in this context (one `list_help_guides` read per render).
 * A failed read, or a refused context, is the empty set: the Guide button simply doesn't show. Pages pass
 * `guide={guides.has(helpKey)}` to `PageHeader`.
 */
export const helpGuides = cache(async (ctx: AccessContext, context: HelpContext, clientId?: string): Promise<Set<string>> => {
  try {
    const r = await tryCallTool<{ guides: { helpKey: string }[] }>(ctx, 'list_help_guides', { context, ...(clientId ? { clientId } : {}) });
    return new Set((r?.guides ?? []).map((g) => g.helpKey));
  } catch {
    return new Set();
  }
});

/** The client's name for the help copy (`{client}`), or null when unreadable. Never refuses: pages do their own access checks. */
export const helpClientName = cache(async (ctx: AccessContext, clientId: string): Promise<string | null> => {
  try {
    return (await tryCallTool<{ name: string }>(ctx, 'get_client_profile', { clientId }))?.name ?? null;
  } catch {
    return null;
  }
});
