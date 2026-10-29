import type { MetadataRoute } from 'next';
import { PAGES } from '../../content/pages';
import { SITE_URL } from '../../content/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.filter((p) => p.sitemap).map((p) => ({
    url: SITE_URL + p.path,
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
