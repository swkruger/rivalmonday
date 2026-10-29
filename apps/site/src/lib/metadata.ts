import type { Metadata } from 'next';
import { PAGES, type SitePage } from '../../content/pages';
import { SITE_NAME, SITE_URL } from '../../content/site';

export function pageMetadata(path: SitePage['path']): Metadata {
  const page = PAGES.find((p) => p.path === path);
  if (!page) throw new Error(`pageMetadata: ${path} is not registered in content/pages.ts`);
  const url = SITE_URL + page.path;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: page.title, description: page.description, url, siteName: SITE_NAME, type: 'website' },
  };
}
