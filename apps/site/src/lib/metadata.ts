import type { Metadata } from 'next';
import { PAGES, type SitePage } from '../../content/pages';
import { SITE_NAME, SITE_URL } from '../../content/site';

/** Mirrors the layout's `%s · Rival Monday` title template. */
export const TITLE_SUFFIX = ` · ${SITE_NAME}`;

/** A title that already names the brand is rendered as-is (no template suffix). */
export function titleIsAbsolute(title: string): boolean {
  return title.includes(SITE_NAME);
}

/** The title the browser shows for a page: template applied where it applies. */
export function effectiveTitle(page: Pick<SitePage, 'title'>): string {
  return titleIsAbsolute(page.title) ? page.title : page.title + TITLE_SUFFIX;
}

export function pageMetadata(path: SitePage['path']): Metadata {
  const page = PAGES.find((p) => p.path === path);
  if (!page) throw new Error(`pageMetadata: ${path} is not registered in content/pages.ts`);
  const url = SITE_URL + page.path;
  return {
    title: titleIsAbsolute(page.title) ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: effectiveTitle(page), description: page.description, url, siteName: SITE_NAME, type: 'website' },
  };
}
