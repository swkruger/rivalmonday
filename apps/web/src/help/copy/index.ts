import { PAGE_COPY, type PageKey, type Tip } from './client';

export { PAGE_COPY } from './client';
export type { EmptyCopy, PageCopy, PageKey, Tip } from './client';

export type TipKey = { [K in PageKey]: `${K}.${Extract<keyof NonNullable<(typeof PAGE_COPY)[K]['tips']>, string>}` }[PageKey];

/** The `window` CustomEvent (`detail: { anchor?: string }`) that asks the page guide drawer to open. */
export const OPEN_PAGE_GUIDE_EVENT = 'open-page-guide';

export interface CopyNames { agency: string; assistant: string; client?: string }

/** Fills `{agency}`, `{assistant}`, `{client}` (single braces; the KB uses double). A missing client reads "your business". */
export function renderCopy(text: string, names: CopyNames): string {
  const map: Record<string, string> = { agency: names.agency, assistant: names.assistant, client: names.client ?? 'your business' };
  return text.replace(/\{(agency|assistant|client)\}/g, (_, k: string) => map[k]!);
}

/** Resolve a `TipKey` (`<page key>.<tip id>`; page keys contain a dot) to its tip, or null when unknown. */
export function resolveTip(key: string): Tip | null {
  for (const page of Object.keys(PAGE_COPY) as PageKey[]) {
    if (!key.startsWith(`${page}.`)) continue;
    const tips: Record<string, Tip> | undefined = PAGE_COPY[page].tips;
    return tips?.[key.slice(page.length + 1)] ?? null;
  }
  return null;
}
