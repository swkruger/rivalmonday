import 'server-only';
import type { HelpAudience } from '@cs/core';
import { ACCOUNT_COPY } from './account';
import { AGENCY_COPY } from './agency';
import { CLIENT_COPY } from './client';
import { PLATFORM_COPY } from './platform';

export { type CopyNames, OPEN_PAGE_GUIDE_EVENT, renderCopy } from '../render';

export interface Tip { title: string; body: string; audience?: HelpAudience; guideAnchor?: string }
export interface EmptyCopy { title: string; body: string; audience?: HelpAudience }
export interface PageCopy { description: string; tips?: Record<string, Tip>; empty?: Record<string, EmptyCopy> }

/**
 * Every page's short copy, merged from the per-context files (the literal types keep `PageKey` and `TipKey` narrow).
 * Server-only (final review I1): server components read it to render text for the current viewer; client components get
 * only the viewer's audience-filtered slice through `HelpProvider` (`helpCopyFor`, `./payload`). Client modules may
 * `import type` from here, never a value (`copy-bundle.test.ts`).
 */
export const PAGE_COPY = { ...CLIENT_COPY, ...AGENCY_COPY, ...PLATFORM_COPY, ...ACCOUNT_COPY } as const satisfies Record<string, PageCopy>;
export type PageKey = keyof typeof PAGE_COPY;

export type TipKey = { [K in PageKey]: `${K}.${Extract<keyof NonNullable<(typeof PAGE_COPY)[K]['tips']>, string>}` }[PageKey];
type EmptyOf<K extends PageKey> = (typeof PAGE_COPY)[K] extends { empty: infer E } ? Extract<keyof E, string> : never;
export type EmptyKey = { [K in PageKey]: `${K}.${EmptyOf<K>}` }[PageKey];

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
