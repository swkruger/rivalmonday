import 'server-only';
import { GLOSSARY, type GlossaryTerm, type ViewerAudience, visibleAudiences } from '@cs/core';
import { AGENCY_ONLY_CLIENT_KEYS } from '../reach';
import { type EmptyCopy, PAGE_COPY, type PageCopy, type Tip } from '.';

/** The short help copy one viewer audience may read, flat-keyed `<page key>.<id>` (a `TipKey` / `EmptyKey`). */
export interface HelpCopy { tips: Record<string, Tip>; empty: Record<string, EmptyCopy>; terms: GlossaryTerm[] }

/**
 * Which page-key prefixes a viewer audience can reach: client roles and guests only `client.*` (less the agency-only
 * client pages, `AGENCY_ONLY_CLIENT_KEYS`) and `account.*` pages, agency staff no `platform.*` page, operators every page.
 */
const PAGES: Record<ViewerAudience, readonly string[]> = {
  client: ['client.', 'account.'],
  agency: ['client.', 'agency.', 'account.'],
  operator: ['client.', 'agency.', 'account.', 'platform.'],
};

/**
 * Final review I1 (spec 15b §3): the server resolves the help copy for the viewer's audience and the shell hands it to
 * client components through `HelpProvider`, so a browser only ever downloads copy it may show. Entries outside the
 * audience's `visibleAudiences`, and pages the audience can't reach, are left out. Page descriptions stay on the server
 * (pages render them in `PageHeader`).
 */
export function helpCopyFor(audience: ViewerAudience): HelpCopy {
  const ok = visibleAudiences(audience);
  const prefixes = PAGES[audience];
  const out: HelpCopy = { tips: {}, empty: {}, terms: GLOSSARY.filter((t) => ok.includes(t.audience)) };
  for (const [page, copy] of Object.entries(PAGE_COPY) as [string, PageCopy][]) {
    if (!prefixes.some((p) => page.startsWith(p))) continue;
    if (audience === 'client' && AGENCY_ONLY_CLIENT_KEYS.has(page)) continue;
    for (const [id, t] of Object.entries(copy.tips ?? {})) if (ok.includes(t.audience ?? 'all')) out.tips[`${page}.${id}`] = t;
    for (const [id, e] of Object.entries(copy.empty ?? {})) if (ok.includes(e.audience ?? 'all')) out.empty[`${page}.${id}`] = e;
  }
  return out;
}
