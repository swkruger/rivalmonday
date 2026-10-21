import { clientFallbackFor, type ViewerAudience } from '@cs/core';

/*
 * The client-safe half of the short help copy: the placeholder renderer and the guide event. It holds no copy, so
 * `'use client'` components import these from here, never from `@/help/copy` (final review I1; `copy-bundle.test.ts`).
 */

/** The `window` CustomEvent (`detail: { anchor?: string }`) that asks the page guide drawer to open. */
export const OPEN_PAGE_GUIDE_EVENT = 'open-page-guide';

export interface CopyNames { agency: string; assistant: string; client?: string }

/**
 * Fills `{agency}`, `{assistant}`, `{client}` (single braces; the KB uses double). A missing client reads "your business"
 * to client viewers (and when no `audience` is given) and "the client" to agency staff and operators.
 */
export function renderCopy(text: string, names: CopyNames, audience?: ViewerAudience): string {
  const map: Record<string, string> = { agency: names.agency, assistant: names.assistant, client: names.client ?? clientFallbackFor(audience === undefined || audience === 'client') };
  return text.replace(/\{(agency|assistant|client)\}/g, (_, k: string) => map[k]!);
}
