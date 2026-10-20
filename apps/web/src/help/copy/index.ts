import { clientFallbackFor, type HelpAudience, type ViewerAudience } from '@cs/core';
import { ACCOUNT_COPY } from './account';
import { AGENCY_COPY } from './agency';
import { CLIENT_COPY } from './client';
import { PLATFORM_COPY } from './platform';

export interface Tip { title: string; body: string; audience?: HelpAudience; guideAnchor?: string }
export interface EmptyCopy { title: string; body: string; audience?: HelpAudience }
export interface PageCopy { description: string; tips?: Record<string, Tip>; empty?: Record<string, EmptyCopy> }

/** Every page's short copy, merged from the per-context files (the literal types keep `PageKey` and `TipKey` narrow). */
export const PAGE_COPY = { ...CLIENT_COPY, ...AGENCY_COPY, ...PLATFORM_COPY, ...ACCOUNT_COPY } as const satisfies Record<string, PageCopy>;
export type PageKey = keyof typeof PAGE_COPY;

export type TipKey = { [K in PageKey]: `${K}.${Extract<keyof NonNullable<(typeof PAGE_COPY)[K]['tips']>, string>}` }[PageKey];

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

/** Resolve a `TipKey` (`<page key>.<tip id>`; page keys contain a dot) to its tip, or null when unknown. */
export function resolveTip(key: string): Tip | null {
  for (const page of Object.keys(PAGE_COPY) as PageKey[]) {
    if (!key.startsWith(`${page}.`)) continue;
    const tips: Record<string, Tip> | undefined = PAGE_COPY[page].tips;
    // A page key can be the prefix of another (`client.competitors` and `client.competitors.detail`): keep looking.
    const tip = tips?.[key.slice(page.length + 1)];
    if (tip) return tip;
  }
  return null;
}
