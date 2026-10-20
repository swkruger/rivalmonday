import type { MetadataRoute } from 'next';

/** Phase 7a1 §3.5: the app is private; only the public crawler-information page is crawlable. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/bot'], disallow: ['/'] }] };
}
