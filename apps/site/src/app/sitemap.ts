import type { MetadataRoute } from 'next';
import { PAGES } from '../../content/pages';
import { SITE_URL } from '../../content/site';

export const dynamic = 'force-static';

/**
 * No `lastmod`: the only date available is the build time, which would mark every page as changed on every deploy.
 * Google ignores `lastmod` from sites where it proves unreliable, so a missing date is better than a false one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.filter((p) => p.sitemap && !p.noindex).map((p) => ({
    url: SITE_URL + p.path,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
