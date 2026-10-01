import type { Cadence, PageType } from '@cs/core';

const PRIORITY: PageType[] = ['home', 'pricing', 'promo', 'service_area', 'service', 'careers', 'team', 'about', 'contact', 'blog'];
const DAILY: ReadonlySet<PageType> = new Set(['home', 'pricing', 'promo']);
const MAX_BLOG = 2;

export interface CandidatePage {
  url: string;
  pageType: PageType;
  source: 'sitemap' | 'nav';
}

export function selectPages(pages: CandidatePage[], max = 25): (CandidatePage & { cadence: Cadence })[] {
  const byUrl = new Map<string, CandidatePage>();
  for (const p of pages) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
  const out: (CandidatePage & { cadence: Cadence })[] = [];
  for (const type of PRIORITY) {
    const ofType = [...byUrl.values()].filter((p) => p.pageType === type);
    const limit = type === 'blog' ? MAX_BLOG : ofType.length;
    for (const p of ofType.slice(0, limit)) {
      if (out.length >= max) return out;
      out.push({ ...p, cadence: DAILY.has(type) ? 'daily' : 'weekly' });
    }
  }
  return out;
}
