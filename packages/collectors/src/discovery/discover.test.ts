import type { Ai } from '@cs/ai';
import { capture, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostRateLimiter } from '../web/rate-limit';
import type { RenderedPage, Renderer } from '../web/renderer';
import { RobotsPolicy } from '../web/robots';
import { discoverPages } from './discover';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const noopLimiter = () => new HostRateLimiter({ sleep: async () => {} });

const home: RenderedPage = {
  requestedUrl: 'https://smithhvac.example/', finalUrl: 'https://smithhvac.example/', httpStatus: 200, status: 'ok', title: 'Smith HVAC',
  html: '', text: '', error: null,
  links: [
    { href: 'https://smithhvac.example/pricing', text: 'Pricing' },
    { href: 'https://smithhvac.example/ac-repair', text: 'AC Repair' },
    { href: 'https://facebook.com/smith', text: 'Facebook' },
  ],
  screenshot: async () => new Uint8Array(), close: async () => {},
};

function fakeAi(types: Record<string, string>): Ai {
  return {
    chat: async () => { throw new Error('not used'); },
    embed: async () => { throw new Error('not used'); },
    decide: vi.fn(async (_task: string, state: unknown) => {
      const url = (state as { url: string }).url;
      const value = types[url] ?? 'other';
      return { answers: { page_type: { type: 'choice', value, probabilities: { [value]: 0.95 }, confidence: 0.95, provider: 'jev' } }, needsReview: [] };
    }) as unknown as Ai['decide'],
    batchAvailable: () => false,
    async submitBatch() { throw new Error('not used by this test'); },
    async collectBatch() { throw new Error('not used by this test'); },
  };
}

describe('discoverPages', () => {
  it('collects nav + sitemap candidates, classifies, selects and upserts tracked pages', async () => {
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nSitemap: https://smithhvac.example/sitemap.xml' }));
    const fetchText = vi.fn(async () => ({ status: 200, body: '<urlset><url><loc>https://smithhvac.example/specials</loc></url></urlset>' }));
    const ai = fakeAi({
      'https://smithhvac.example/': 'home',
      'https://smithhvac.example/pricing': 'pricing',
      'https://smithhvac.example/ac-repair': 'service',
      'https://smithhvac.example/specials': 'promo',
    });
    const result = await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    expect(result).toMatchObject({ selected: 4, homepageStatus: 'ok' });
    const rows = await dbs.service.select().from(trackedPage).where(eq(trackedPage.competitorId, IDS.competitorX));
    expect(rows.map((r) => [r.url, r.pageType, r.cadence]).sort()).toEqual([
      ['https://smithhvac.example/', 'home', 'daily'],
      ['https://smithhvac.example/ac-repair', 'service', 'weekly'],
      ['https://smithhvac.example/pricing', 'pricing', 'daily'],
      ['https://smithhvac.example/specials', 'promo', 'daily'],
    ]);

    // Re-running does not duplicate rows and keeps pinned pages' type.
    await dbs.service.update(trackedPage).set({ pinned: true, pageType: 'service_area' }).where(eq(trackedPage.url, 'https://smithhvac.example/ac-repair'));
    await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    const again = await dbs.service.select().from(trackedPage).where(eq(trackedPage.competitorId, IDS.competitorX));
    expect(again).toHaveLength(4);
    expect(again.find((r) => r.url.endsWith('/ac-repair'))?.pageType).toBe('service_area');
  });

  it('records a blocked homepage as a weekly home page with a blocked capture (2a carry-over)', async () => {
    const renderer: Renderer = { render: async () => ({ ...home, status: 'blocked', httpStatus: 403, links: [] }), close: async () => {} };
    const result = await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots: new RobotsPolicy(async () => ({ status: 404, body: '' })), fetchText: async () => ({ status: 404, body: '' }), limiter: noopLimiter(), ai: fakeAi({}) },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    expect(result).toEqual({ selected: 0, candidates: 0, homepageStatus: 'blocked' });
    const rows = await dbs.service.select().from(trackedPage);
    expect(rows.map((r) => [r.url, r.pageType, r.cadence])).toEqual([['https://smithhvac.example/', 'home', 'weekly']]);
    expect((await dbs.service.select().from(capture).where(eq(capture.trackedPageId, rows[0]!.id))).map((c) => c.status)).toEqual(['blocked']);
  });

  it('passes the competitor name and domain to the classifier as business names', async () => {
    const renderer: Renderer = { render: vi.fn(async () => ({ ...home, links: [{ href: 'https://smithhvac.example/specials', text: 'Smith HVAC Specials' }] })), close: async () => {} };
    const ai = fakeAi({ 'https://smithhvac.example/specials': 'promo' });
    await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots: new RobotsPolicy(async () => ({ status: 404, body: '' })), fetchText: async () => ({ status: 404, body: '' }), limiter: noopLimiter(), ai },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    const linkTexts = (ai.decide as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as { link_text: string | null }).link_text);
    expect(linkTexts).toContain('Smith HVAC Specials');
  });

  it('ignores a sitemap that redirected off-site', async () => {
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nSitemap: https://smithhvac.example/sitemap.xml' }));
    const fetchText = vi.fn(async () => ({ status: 200, body: '<urlset><url><loc>https://smithhvac.example/specials</loc></url></urlset>', finalUrl: 'https://evil.example/sitemap.xml' }));
    await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai: fakeAi({ 'https://smithhvac.example/specials': 'promo' }) },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    expect((await dbs.service.select().from(trackedPage)).map((r) => r.url)).not.toContain('https://smithhvac.example/specials');
  });

  it('never fetches a cross-host sitemap named in robots.txt', async () => {
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nSitemap: https://other.example/sitemap.xml' }));
    const fetchText = vi.fn(async () => ({ status: 200, body: '<urlset></urlset>' }));
    const ai = fakeAi({ 'https://smithhvac.example/': 'home', 'https://smithhvac.example/pricing': 'pricing', 'https://smithhvac.example/ac-repair': 'service' });
    await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    expect(fetchText).not.toHaveBeenCalledWith('https://other.example/sitemap.xml');
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('never fetches a sitemap URL disallowed by robots', async () => {
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({
      status: 200,
      body: 'User-agent: *\nDisallow: /blocked-sitemap.xml\nSitemap: https://smithhvac.example/blocked-sitemap.xml',
    }));
    const fetchText = vi.fn(async () => ({ status: 200, body: '<urlset></urlset>' }));
    const ai = fakeAi({ 'https://smithhvac.example/': 'home', 'https://smithhvac.example/pricing': 'pricing', 'https://smithhvac.example/ac-repair': 'service' });
    await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    expect(fetchText).not.toHaveBeenCalledWith('https://smithhvac.example/blocked-sitemap.xml');
  });

  it('waits on the rate limiter before each sitemap fetch', async () => {
    const order: string[] = [];
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nCrawl-delay: 9\nSitemap: https://smithhvac.example/sitemap.xml' }));
    const fetchText = vi.fn(async () => {
      order.push('fetch');
      return { status: 200, body: '<urlset><url><loc>https://smithhvac.example/specials</loc></url></urlset>' };
    });
    const limiter = { wait: vi.fn(async () => { order.push('wait'); }) } as unknown as HostRateLimiter;
    const ai = fakeAi({
      'https://smithhvac.example/': 'home',
      'https://smithhvac.example/pricing': 'pricing',
      'https://smithhvac.example/ac-repair': 'service',
      'https://smithhvac.example/specials': 'promo',
    });
    await discoverPages({ db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter, ai }, { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' });
    expect(order).toEqual(['wait', 'fetch']);
    expect(limiter.wait).toHaveBeenCalledTimes(1);
    expect(limiter.wait).toHaveBeenCalledWith('https://smithhvac.example/sitemap.xml', 9);
  });

  it('tolerates a classifier failure for one candidate and still upserts the rest', async () => {
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *' }));
    const fetchText = vi.fn(async () => ({ status: 404, body: '' }));
    const ai: Ai = {
      chat: async () => { throw new Error('not used'); },
      embed: async () => { throw new Error('not used'); },
      decide: vi.fn(async (_task: string, state: unknown) => {
        const url = (state as { url: string }).url;
        if (url === 'https://smithhvac.example/pricing') throw new Error('provider down');
        const value = url === 'https://smithhvac.example/ac-repair' ? 'service' : 'home';
        return { answers: { page_type: { type: 'choice', value, probabilities: { [value]: 0.95 }, confidence: 0.95, provider: 'jev' } }, needsReview: [] };
      }) as unknown as Ai['decide'],
      batchAvailable: () => false,
      async submitBatch() { throw new Error('not used by this test'); },
      async collectBatch() { throw new Error('not used by this test'); },
    };
    const result = await discoverPages(
      { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai },
      { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' },
    );
    // The failing candidate (pricing) falls back to its keyword heuristic ('pricing') rather than aborting discovery.
    expect(result.selected).toBeGreaterThan(0);
    const rows = await dbs.service.select().from(trackedPage).where(eq(trackedPage.competitorId, IDS.competitorX));
    expect(rows.find((r) => r.url.endsWith('/ac-repair'))?.pageType).toBe('service');
    expect(rows.find((r) => r.url.endsWith('/pricing'))?.pageType).toBe('pricing');
    expect(rows.find((r) => r.url === 'https://smithhvac.example/')?.pageType).toBe('home');
  });
});
