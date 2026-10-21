import 'server-only';
import { type AccessContext, NEUTRAL_AGENCY_NAME } from '@cs/core';
import { cache } from 'react';
import { tryCallTool } from './tools';

export type HelpContext = 'platform' | 'agency' | 'client';

/**
 * The agency name the help copy (`{agency}`) shows: the agency's display name, but "your agency" in the platform zone and
 * when the agency has no white-label name (the "Rival Monday" default) — help never names Rival Monday as the agency.
 * Used by the shell's `HelpProvider` and the Help pages so both read the same name.
 */
export function helpAgencyName(platform: boolean, displayName: string | null | undefined): string {
  const name = displayName?.trim() ?? '';
  return platform || name === '' || name === 'Rival Monday' ? NEUTRAL_AGENCY_NAME : name;
}

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

export { helpClientName } from './help-client-name';
