// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PAGES } from '../../content/pages';
import { SITE_URL } from '../../content/site';
import sitemap from './sitemap';

describe('sitemap', () => {
  it('lists only registered sitemap pages as absolute urls', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual(PAGES.filter((p) => p.sitemap).map((p) => SITE_URL + p.path));
    for (const u of urls) expect(u).toMatch(/^https:\/\//);
  });

  it('includes collection pages and only enabled rivals', () => {
    const urls = sitemap().map((e) => e.url);
    for (const p of ['/integrations', '/sources', '/compare', '/pricing', '/partners']) expect(urls).toContain(SITE_URL + p);
    const rivalUrls = urls.filter((u) => u.startsWith(SITE_URL + '/compare/'));
    expect(rivalUrls).toEqual(PAGES.filter((p) => p.path.startsWith('/compare/')).map((p) => SITE_URL + p.path));
  });

  it('never stamps a build-time lastmod on every page', () => {
    for (const e of sitemap()) expect(e.lastModified, e.url).toBeUndefined();
  });
});
