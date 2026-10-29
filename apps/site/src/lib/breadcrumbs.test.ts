// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SitePage } from '../../content/pages';
import { breadcrumbTrail } from './breadcrumbs';

const page = (path: SitePage['path'], extra: Partial<SitePage> = {}): SitePage => ({ path, title: `T ${path}`, description: 'd', sitemap: true, ...extra });

describe('breadcrumbTrail', () => {
  it('home has a single crumb', () => {
    expect(breadcrumbTrail('/', [page('/')])).toEqual([{ name: 'Home', path: '/' }]);
  });

  it('collection item trail is Home › Collection › Item', () => {
    const pages = [page('/'), page('/compare', { nav: { label: 'Compare', order: 30 } }), page('/compare/birdeye', { crumb: 'Birdeye' })];
    expect(breadcrumbTrail('/compare/birdeye', pages)).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Compare', path: '/compare' },
      { name: 'Birdeye', path: '/compare/birdeye' },
    ]);
  });

  it('unregistered ancestor is skipped', () => {
    const pages = [page('/'), page('/sources/google', { crumb: 'Google' })];
    expect(breadcrumbTrail('/sources/google', pages)).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Google', path: '/sources/google' },
    ]);
  });

  it('name falls back to the title', () => {
    expect(breadcrumbTrail('/privacy', [page('/'), page('/privacy')]).at(-1)?.name).toBe('T /privacy');
  });
});
