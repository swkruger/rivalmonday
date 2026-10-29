import { PAGES, type SitePage } from '../../content/pages';

export interface Crumb {
  name: string;
  path: SitePage['path'];
}

/** Home + each registered ancestor + the page itself. Unregistered ancestors are skipped. */
export function breadcrumbTrail(path: SitePage['path'], pages: readonly SitePage[] = PAGES): Crumb[] {
  const home: Crumb = { name: 'Home', path: '/' };
  if (path === '/') return [home];
  const segments = path.slice(1).split('/');
  const trail: Crumb[] = [home];
  for (let i = 1; i <= segments.length; i++) {
    const p = `/${segments.slice(0, i).join('/')}` as SitePage['path'];
    const page = pages.find((x) => x.path === p);
    if (page) trail.push({ name: page.crumb ?? page.nav?.label ?? page.title, path: p });
  }
  return trail;
}
