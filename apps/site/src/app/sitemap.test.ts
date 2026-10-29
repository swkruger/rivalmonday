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
});
