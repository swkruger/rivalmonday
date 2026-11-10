import type { VerticalPack } from './schema';

export const CITATION_GROUPS = ['general', 'home_services', 'dental_health'] as const;
export type CitationGroup = (typeof CITATION_GROUPS)[number];

/** Review-hosting or booking directories we never audit or recommend (spec 18c § Pack, §2.2 spirit). */
export const BANNED_CITATION_HOSTS = ['yelp.com', 'healthgrades.com', 'zocdoc.com', 'nextdoor.com'] as const;
export const CITATION_CATALOGUE_MAX = 15;

export const onHost = (h: string, host: string): boolean => h === host || h.endsWith(`.${host}`);
export const isBannedHost = (h: string): boolean => BANNED_CITATION_HOSTS.some((b) => onHost(h, b));

export interface Directory {
  host: string;
  label: string;
  add_listing_url: string;
  claim_url?: string;
}

/** Union of the pack's picked groups in `CITATION_GROUPS` order, the first occurrence of a host wins; `[]` when `directory_groups` is absent. */
export function citationCatalogue(pack: Pick<VerticalPack, 'citations'>): Directory[] {
  const { directory_groups: defs, groups } = pack.citations;
  if (!defs) return [];
  const seen = new Set<string>();
  const out: Directory[] = [];
  for (const g of CITATION_GROUPS) {
    if (!groups.includes(g)) continue;
    for (const d of defs[g] ?? []) {
      if (seen.has(d.host)) continue;
      seen.add(d.host);
      out.push(d);
    }
  }
  return out;
}
