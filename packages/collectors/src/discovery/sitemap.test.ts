import { describe, expect, it, vi } from 'vitest';
import { collectSitemapUrls, parseSitemap } from './sitemap';

const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://s.example/pages.xml</loc></sitemap></sitemapindex>`;
const pages = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://s.example/</loc></url><url><loc>https://s.example/pricing</loc></url></urlset>`;
const single = `<urlset><url><loc>https://s.example/only</loc></url></urlset>`;

describe('parseSitemap', () => {
  it('parses url sets (single and multiple) and indexes', () => {
    expect(parseSitemap(pages)).toEqual({ urls: ['https://s.example/', 'https://s.example/pricing'], sitemaps: [] });
    expect(parseSitemap(single).urls).toEqual(['https://s.example/only']);
    expect(parseSitemap(index)).toEqual({ urls: [], sitemaps: ['https://s.example/pages.xml'] });
    expect(parseSitemap('garbage')).toEqual({ urls: [], sitemaps: [] });
  });
});

describe('collectSitemapUrls', () => {
  it('follows indexes, caps results and tolerates failures', async () => {
    const fetchText = vi.fn(async (u: string) => {
      if (u.endsWith('/sitemap.xml')) return { status: 200, body: index };
      if (u.endsWith('/pages.xml')) return { status: 200, body: pages };
      throw new Error('down');
    });
    expect(await collectSitemapUrls(fetchText, ['https://s.example/sitemap.xml', 'https://s.example/broken.xml'])).toEqual([
      'https://s.example/', 'https://s.example/pricing',
    ]);
    expect(await collectSitemapUrls(fetchText, ['https://s.example/sitemap.xml'], { maxUrls: 1 })).toHaveLength(1);
  });

  it('caps the number of sitemap files fetched per call (default 10)', async () => {
    const fetchText = vi.fn(async () => ({ status: 200, body: single }));
    const many = Array.from({ length: 20 }, (_, i) => `https://s.example/sitemap-${i}.xml`);
    await collectSitemapUrls(fetchText, many);
    expect(fetchText).toHaveBeenCalledTimes(10);
  });

  it('honours an explicit maxFiles option', async () => {
    const fetchText = vi.fn(async () => ({ status: 200, body: single }));
    const many = Array.from({ length: 20 }, (_, i) => `https://s.example/sitemap-${i}.xml`);
    await collectSitemapUrls(fetchText, many, { maxFiles: 3 });
    expect(fetchText).toHaveBeenCalledTimes(3);
  });
});
