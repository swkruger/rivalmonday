import type { MetadataRoute } from 'next';
import { SITE_URL } from '../../content/site';
import { siteEnv } from '../lib/env';

export const dynamic = 'force-static';

/** Only production is indexable; preview deploys disallow everything. */
export default function robots(): MetadataRoute.Robots {
  if (!siteEnv.isProduction) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return { rules: [{ userAgent: '*', allow: '/' }], sitemap: SITE_URL + '/sitemap.xml', host: SITE_URL };
}
