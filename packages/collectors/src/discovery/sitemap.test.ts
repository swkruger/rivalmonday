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
    expect((await collectSitemapUrls(fetchText, ['https://s.example/sitemap.xml', 'https://s.example/broken.xml'])).urls).toEqual([
      'https://s.example/', 'https://s.example/pricing',
    ]);
    expect((await collectSitemapUrls(fetchText, ['https://s.example/sitemap.xml'], { maxUrls: 1 })).urls).toHaveLength(1);
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

  it('reports a complete read as not truncated, and a 404/410 seed as no sitemap (not truncated)', async () => {
    const fetchText = vi.fn(async (u: string) => (u.endsWith('/sitemap.xml') ? { status: 200, body: pages } : { status: 404, body: '' }));
    expect(await collectSitemapUrls(fetchText, ['https://s.example/sitemap.xml', 'https://s.example/missing.xml'])).toEqual({
      urls: ['https://s.example/', 'https://s.example/pricing'], truncated: false,
    });
    expect(await collectSitemapUrls(async () => ({ status: 410, body: '' }), ['https://s.example/sitemap.xml'])).toEqual({ urls: [], truncated: false });
  });

  it('is truncated when the url cap drops urls', async () => {
    const r = await collectSitemapUrls(async () => ({ status: 200, body: pages }), ['https://s.example/sitemap.xml'], { maxUrls: 1 });
    expect(r).toEqual({ urls: ['https://s.example/'], truncated: true });
    expect((await collectSitemapUrls(async () => ({ status: 200, body: pages }), ['https://s.example/sitemap.xml'], { maxUrls: 2 })).truncated).toBe(false);
  });

  it('is truncated when the file cap or depth cap leaves sitemaps unread', async () => {
    const many = Array.from({ length: 4 }, (_, i) => `https://s.example/sitemap-${i}.xml`);
    expect((await collectSitemapUrls(async () => ({ status: 200, body: single }), many, { maxFiles: 3 })).truncated).toBe(true);
    expect((await collectSitemapUrls(async () => ({ status: 200, body: single }), many, { maxFiles: 4 })).truncated).toBe(false);
    const deep = vi.fn(async (u: string) => (u.endsWith('/sitemap.xml') ? { status: 200, body: index } : { status: 200, body: pages }));
    expect((await collectSitemapUrls(deep, ['https://s.example/sitemap.xml'], { maxDepth: 0 })).truncated).toBe(true);
    expect((await collectSitemapUrls(deep, ['https://s.example/sitemap.xml'], { maxDepth: 1 })).truncated).toBe(false);
  });

  it('is truncated when a sitemap file fails (thrown, 5xx or other non-2xx except 404/410)', async () => {
    expect((await collectSitemapUrls(async () => { throw new Error('robots disallowed'); }, ['https://s.example/sitemap.xml'])).truncated).toBe(true);
    expect((await collectSitemapUrls(async () => ({ status: 503, body: '' }), ['https://s.example/sitemap.xml'])).truncated).toBe(true);
    expect((await collectSitemapUrls(async () => ({ status: 403, body: '' }), ['https://s.example/sitemap.xml'])).truncated).toBe(true);
  });
});
