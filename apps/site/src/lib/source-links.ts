import { SOURCES, type Source } from '../../content/sources';
import type { SampleItem } from '../sample/schema';

/** Which public source page explains each kind of brief item. */
const KIND_SOURCE: Record<SampleItem['kind'], Source['slug']> = {
  website: 'competitor-websites',
  reviews: 'google-reviews',
  ads: 'ads',
  rank: 'local-map-rankings',
  listing: 'google-business-profile',
};

export type SourceLinks = Partial<Record<SampleItem['kind'], string>>;

/**
 * Server-side only (it reads the source registry): hrefs from a brief item's kind to the page that explains how that
 * evidence is collected. Client components receive the plain map as a prop, never the registry.
 */
export function sourceLinks(): SourceLinks {
  const out: SourceLinks = {};
  for (const [kind, slug] of Object.entries(KIND_SOURCE) as [SampleItem['kind'], Source['slug']][]) {
    if (SOURCES.some((s) => s.slug === slug)) out[kind] = `/sources/${slug}`;
  }
  return out;
}
