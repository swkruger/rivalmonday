import type { Ai } from '@cs/ai';
import { capture, siteDiscovery, siteUrl, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostRateLimiter } from '../web/rate-limit';
import type { RenderedPage, Renderer } from '../web/renderer';
import { RobotsPolicy } from '../web/robots';
import { type DiscoveryDeps, discoverPages, REDISCOVERY_MAX_CLASSIFY } from './discover';
import { pageKey } from './page-key';

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
    chatWithTools: async () => { throw new Error('not used'); },
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
    expect(result).toEqual({ mode: 'initial', selected: 0, candidates: 0, newPages: 0, deactivated: 0, truncated: false, homepageStatus: 'blocked' });
    const rows = await dbs.service.select().from(trackedPage);
    expect(rows.map((r) => [r.url, r.pageType, r.cadence])).toEqual([['https://smithhvac.example/', 'home', 'weekly']]);
    expect((await dbs.service.select().from(capture).where(eq(capture.trackedPageId, rows[0]!.id))).map((c) => c.status)).toEqual(['blocked']);
    // The run is still recorded (no site_url writes) and pushes the next scheduled run out by REDISCOVERY_DAYS.
    expect(await dbs.service.select().from(siteUrl)).toEqual([]);
    const [sd] = await dbs.service
      .select({
        runs: siteDiscovery.runs, homepageStatus: siteDiscovery.homepageStatus, lastRunAt: siteDiscovery.lastRunAt,
        inWindow: sql<boolean>`${siteDiscovery.nextDueAt} > now() + interval '27 days' AND ${siteDiscovery.nextDueAt} < now() + interval '29 days'`,
      })
      .from(siteDiscovery).where(eq(siteDiscovery.competitorId, IDS.competitorX));
    expect(sd).toMatchObject({ runs: 1, homepageStatus: 'blocked', inWindow: true });
    expect(sd?.lastRunAt).not.toBeNull();
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
      chatWithTools: async () => { throw new Error('not used'); },
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

// ---- Re-discovery (spec D6) ----

const SITE = 'https://smithhvac.example';
const COMP = { id: IDS.competitorX, domain: 'smithhvac.example', name: 'Smith HVAC' };
const BASE_LINKS = [
  { href: `${SITE}/pricing`, text: 'Pricing' },
  { href: `${SITE}/ac-repair`, text: 'AC Repair' },
];
const BASE_TYPES: Record<string, string> = { [`${SITE}/`]: 'home', [`${SITE}/pricing`]: 'pricing', [`${SITE}/ac-repair`]: 'service' };

/** A discovery world: nav links on the home page, sitemap files by URL (status, locs), and classifier answers. */
function world(opts: { links?: { href: string; text: string }[]; sitemaps?: Record<string, { status: number; locs?: string[] }>; types?: Record<string, string> } = {}) {
  const links = opts.links ?? BASE_LINKS;
  const sitemaps = opts.sitemaps ?? {};
  const seeds = Object.keys(sitemaps);
  const renderer: Renderer = { render: vi.fn(async () => ({ ...home, links })), close: async () => {} };
  const robots = new RobotsPolicy(async () => ({ status: 200, body: `User-agent: *\n${seeds.map((s) => `Sitemap: ${s}`).join('\n')}` }));
  const fetchText = vi.fn(async (u: string) => {
    const sm = sitemaps[u];
    if (!sm) return { status: 404, body: '' };
    return { status: sm.status, body: `<urlset>${(sm.locs ?? []).map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>` };
  });
  const ai = fakeAi({ ...BASE_TYPES, ...(opts.types ?? {}) });
  const deps: DiscoveryDeps = { db: dbs.service, store: createMemoryStore(), renderer, robots, fetchText, limiter: noopLimiter(), ai };
  return { deps, ai, run: () => discoverPages(deps, COMP) };
}

const pages = () => dbs.service.select().from(trackedPage).where(eq(trackedPage.competitorId, IDS.competitorX));
const page = async (url: string) => (await pages()).find((r) => r.url === url);
const siteKeys = async () => (await dbs.service.select({ k: siteUrl.urlKey }).from(siteUrl).where(eq(siteUrl.competitorId, IDS.competitorX))).map((r) => r.k).sort();
const decidedUrls = (ai: Ai) => (ai.decide as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as { url: string }).url);

describe('discoverPages — re-discovery', () => {
  it('initial run = selection + site_url baseline, no appeared_at', async () => {
    const r = await world({
      sitemaps: { [`${SITE}/sitemap.xml`]: { status: 200, locs: [`${SITE}/specials`, `${SITE}/blog/tips`] } },
      types: { [`${SITE}/specials`]: 'promo', [`${SITE}/blog/tips`]: 'blog' },
    }).run();
    expect(r).toEqual({ mode: 'initial', selected: 5, candidates: 5, newPages: 0, deactivated: 0, truncated: false, homepageStatus: 'ok' });
    const rows = await pages();
    expect(rows).toHaveLength(5);
    expect(rows.every((p) => p.appearedAt === null && p.active && p.inactiveReason === null)).toBe(true);
    expect(await siteKeys()).toEqual([
      'smithhvac.example', 'smithhvac.example/ac-repair', 'smithhvac.example/blog/tips', 'smithhvac.example/pricing', 'smithhvac.example/specials',
    ]);
    const [sd] = await dbs.service.select().from(siteDiscovery).where(eq(siteDiscovery.competitorId, IDS.competitorX));
    expect(sd).toMatchObject({ runs: 1, urls: 5, truncated: false, homepageStatus: 'ok' });
  });

  it('next_due_at never moves earlier (greatest of existing and now + REDISCOVERY_DAYS) and runs counts up', async () => {
    await dbs.service.insert(siteDiscovery).values({ competitorId: IDS.competitorX, nextDueAt: sql`now() + interval '60 days'`, runs: 3 });
    await world().run();
    const [sd] = await dbs.service.select({ runs: siteDiscovery.runs, far: sql<boolean>`${siteDiscovery.nextDueAt} > now() + interval '59 days'` }).from(siteDiscovery);
    expect(sd).toEqual({ runs: 4, far: true });
  });

  it('refresh with one new nav service URL tracks it with appeared_at; a new blog URL is remembered, not tracked', async () => {
    await world().run();
    const links = [...BASE_LINKS, { href: `${SITE}/furnace-repair`, text: 'Furnace Repair' }, { href: `${SITE}/blog/winter`, text: 'Winter tips' }];
    const w = world({ links, types: { [`${SITE}/furnace-repair`]: 'service', [`${SITE}/blog/winter`]: 'blog' } });
    const r = await w.run();
    expect(r).toMatchObject({ mode: 'refresh', newPages: 1, selected: 1, deactivated: 0, truncated: false });
    // Only the two new URLs are classified on a refresh.
    expect(decidedUrls(w.ai).sort()).toEqual([`${SITE}/blog/winter`, `${SITE}/furnace-repair`]);
    const fresh = await page(`${SITE}/furnace-repair`);
    expect(fresh).toMatchObject({ active: true, pageType: 'service', cadence: 'weekly', source: 'nav' });
    expect(fresh?.appearedAt).not.toBeNull();
    expect(await page(`${SITE}/blog/winter`)).toBeUndefined();
    expect(await siteKeys()).toContain('smithhvac.example/blog/winter');
    // Existing pages never get appeared_at.
    expect((await page(`${SITE}/pricing`))?.appearedAt).toBeNull();
  });

  it('a refresh with no site_url rows yet (pre-18a-2 discovery) only records the baseline', async () => {
    await world().run();
    await dbs.service.delete(siteUrl);
    const r = await world({ links: [...BASE_LINKS, { href: `${SITE}/furnace-repair`, text: 'Furnace Repair' }], types: { [`${SITE}/furnace-repair`]: 'service' } }).run();
    expect(r).toMatchObject({ mode: 'refresh', newPages: 0 });
    expect(await page(`${SITE}/furnace-repair`)).toBeUndefined();
    expect(await siteKeys()).toContain('smithhvac.example/furnace-repair');
  });

  it('a truncated run ignores sitemap-only new URLs (remembered) but keeps new nav ones', async () => {
    await world({ sitemaps: { [`${SITE}/sitemap.xml`]: { status: 200, locs: [] } } }).run();
    const r = await world({
      links: [...BASE_LINKS, { href: `${SITE}/drain-cleaning`, text: 'Drain Cleaning' }],
      sitemaps: { [`${SITE}/sitemap.xml`]: { status: 200, locs: [`${SITE}/water-heaters`] }, [`${SITE}/sitemap-2.xml`]: { status: 503 } },
      types: { [`${SITE}/drain-cleaning`]: 'service', [`${SITE}/water-heaters`]: 'service' },
    }).run();
    expect(r).toMatchObject({ mode: 'refresh', truncated: true, newPages: 1 });
    expect((await page(`${SITE}/drain-cleaning`))?.active).toBe(true);
    expect(await page(`${SITE}/water-heaters`)).toBeUndefined();
    expect(await siteKeys()).toContain('smithhvac.example/water-heaters');
    expect((await dbs.service.select().from(siteDiscovery))[0]?.truncated).toBe(true);
  });

  it('a run after a truncated run also ignores sitemap-only new URLs', async () => {
    await world().run();
    await dbs.service.update(siteDiscovery).set({ truncated: true });
    const r = await world({ sitemaps: { [`${SITE}/sitemap.xml`]: { status: 200, locs: [`${SITE}/water-heaters`] } }, types: { [`${SITE}/water-heaters`]: 'service' } }).run();
    expect(r).toMatchObject({ truncated: false, newPages: 0 });
    expect(await page(`${SITE}/water-heaters`)).toBeUndefined();
    // Complete now and before → a sitemap-only new URL counts.
    const again = await world({
      sitemaps: { [`${SITE}/sitemap.xml`]: { status: 200, locs: [`${SITE}/water-heaters`, `${SITE}/boilers`] } },
      types: { [`${SITE}/boilers`]: 'service' },
    }).run();
    expect(again).toMatchObject({ newPages: 1 });
    expect((await page(`${SITE}/boilers`))?.source).toBe('sitemap');
  });

  it(`classifies at most ${REDISCOVERY_MAX_CLASSIFY} new URLs per run, nav first; the rest wait for the next run`, async () => {
    await world({ sitemaps: { [`${SITE}/sitemap.xml`]: { status: 200, locs: [] } } }).run();
    const navNew = Array.from({ length: 20 }, (_, i) => ({ href: `${SITE}/post-${i}`, text: `Post ${i}` }));
    const sitemaps = { [`${SITE}/sitemap.xml`]: { status: 200, locs: [`${SITE}/zz-sitemap-only`] } };
    const w = world({ links: [...BASE_LINKS, ...navNew], sitemaps });
    await w.run();
    expect(decidedUrls(w.ai)).toHaveLength(20);
    expect(decidedUrls(w.ai)).not.toContain(`${SITE}/zz-sitemap-only`);
    expect(await siteKeys()).not.toContain('smithhvac.example/zz-sitemap-only');
    const next = world({ links: [...BASE_LINKS, ...navNew], sitemaps });
    await next.run();
    expect(decidedUrls(next.ai)).toEqual([`${SITE}/zz-sitemap-only`]);
  });

  it('when full, a new page replaces the lowest-priority non-pinned, non-manual page; never a pinned/manual one', async () => {
    const base = { competitorId: IDS.competitorX, cadence: 'weekly' };
    await dbs.service.insert(trackedPage).values([
      { ...base, url: `${SITE}/`, pageType: 'home', source: 'nav', cadence: 'daily' },
      ...Array.from({ length: 21 }, (_, i) => ({ ...base, url: `${SITE}/svc-${i}`, pageType: 'service', source: 'nav', pinned: true })),
      { ...base, url: `${SITE}/blog/pinned`, pageType: 'blog', source: 'nav', pinned: true },
      { ...base, url: `${SITE}/blog/manual`, pageType: 'blog', source: 'manual' },
      { ...base, url: `${SITE}/blog/nav`, pageType: 'blog', source: 'nav' },
    ]);
    await dbs.service.insert(siteUrl).values({ competitorId: IDS.competitorX, urlKey: 'smithhvac.example', url: `${SITE}/`, source: 'nav' });
    const existing = (await pages()).filter((p) => p.pageType !== 'home').map((p) => ({ href: p.url, text: p.url }));
    const r = await world({ links: [...existing, { href: `${SITE}/rates`, text: 'Rates' }], types: { [`${SITE}/rates`]: 'pricing' } }).run();
    expect(r).toMatchObject({ mode: 'refresh', newPages: 1, deactivated: 1 });
    expect(await page(`${SITE}/blog/nav`)).toMatchObject({ active: false, inactiveReason: 'replaced' });
    expect(await page(`${SITE}/rates`)).toMatchObject({ active: true, pageType: 'pricing', cadence: 'daily' });
    expect((await pages()).filter((p) => p.active)).toHaveLength(25);

    // Full again, and every lower-priority page is pinned or manual: the new page is skipped.
    const r2 = await world({
      links: [...existing, { href: `${SITE}/rates`, text: 'Rates' }, { href: `${SITE}/coupons`, text: 'Coupons' }],
      types: { [`${SITE}/coupons`]: 'promo' },
    }).run();
    expect(r2).toMatchObject({ newPages: 0, deactivated: 0 });
    expect(await page(`${SITE}/coupons`)).toBeUndefined();
    expect(await page(`${SITE}/blog/pinned`)).toMatchObject({ active: true });
    expect(await page(`${SITE}/blog/manual`)).toMatchObject({ active: true });
    // The replaced page is never re-activated by discovery although it is still linked.
    expect(await page(`${SITE}/blog/nav`)).toMatchObject({ active: false, inactiveReason: 'replaced' });
  });

  it('over the cap (more than 25 active), a new page neither replaces a page nor gets added', async () => {
    const base = { competitorId: IDS.competitorX, cadence: 'weekly' };
    await dbs.service.insert(trackedPage).values([
      { ...base, url: `${SITE}/`, pageType: 'home', source: 'nav', cadence: 'daily' },
      ...Array.from({ length: 24 }, (_, i) => ({ ...base, url: `${SITE}/svc-${i}`, pageType: 'service', source: 'nav', pinned: true })),
      { ...base, url: `${SITE}/blog/nav`, pageType: 'blog', source: 'nav' },
    ]);
    await dbs.service.insert(siteUrl).values({ competitorId: IDS.competitorX, urlKey: 'smithhvac.example', url: `${SITE}/`, source: 'nav' });
    const existing = (await pages()).filter((p) => p.pageType !== 'home').map((p) => ({ href: p.url, text: p.url }));
    const r = await world({ links: [...existing, { href: `${SITE}/rates`, text: 'Rates' }], types: { [`${SITE}/rates`]: 'pricing' } }).run();
    expect(r).toMatchObject({ mode: 'refresh', newPages: 0, deactivated: 0 });
    expect(await page(`${SITE}/blog/nav`)).toMatchObject({ active: true, inactiveReason: null });
    expect(await page(`${SITE}/rates`)).toBeUndefined();
    expect((await pages()).filter((p) => p.active)).toHaveLength(26);
  });

  it('a 404/410 page missing from a complete run goes inactive gone and re-activates when it is back', async () => {
    await world().run();
    const ac = (await page(`${SITE}/ac-repair`))!;
    const pricing = (await page(`${SITE}/pricing`))!;
    const cap = { competitorId: IDS.competitorX, source: 'web', collectorVersion: 'web/2' };
    await dbs.service.insert(capture).values([
      { ...cap, trackedPageId: ac.id, url: ac.url, status: 'ok', httpStatus: 200, capturedAt: sql`now() - interval '2 days'` },
      { ...cap, trackedPageId: ac.id, url: ac.url, status: 'error', httpStatus: 404, capturedAt: sql`now() - interval '1 day'` },
      { ...cap, trackedPageId: pricing.id, url: pricing.url, status: 'ok', httpStatus: 200 },
    ]);
    // Neither page is linked any more; only the 404 one is gone — a merely unselected page stays active.
    const r = await world({ links: [] }).run();
    expect(r).toMatchObject({ deactivated: 1 });
    expect(await page(ac.url)).toMatchObject({ active: false, inactiveReason: 'gone' });
    expect(await page(pricing.url)).toMatchObject({ active: true, inactiveReason: null });

    const back = await world().run();
    expect(back).toMatchObject({ mode: 'refresh', selected: 1, newPages: 0 });
    expect(await page(ac.url)).toMatchObject({ active: true, inactiveReason: null, appearedAt: null });
  });

  it('never marks pages gone on a truncated run', async () => {
    await world().run();
    const ac = (await page(`${SITE}/ac-repair`))!;
    await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, trackedPageId: ac.id, source: 'web', url: ac.url, status: 'error', httpStatus: 410, collectorVersion: 'web/2' });
    const r = await world({ links: [], sitemaps: { [`${SITE}/sitemap.xml`]: { status: 500 } } }).run();
    expect(r).toMatchObject({ truncated: true, deactivated: 0 });
    expect((await page(ac.url))?.active).toBe(true);
  });

  it('never re-activates a manual row (refresh and initial mode)', async () => {
    await world().run();
    await dbs.service.update(trackedPage).set({ active: false, inactiveReason: 'manual' }).where(eq(trackedPage.url, `${SITE}/ac-repair`));
    await world().run();
    expect(await page(`${SITE}/ac-repair`)).toMatchObject({ active: false, inactiveReason: 'manual' });
    // All non-home pages off → initial mode re-selects, still skipping the manual ones (and an http/www twin of one).
    await dbs.service.update(trackedPage).set({ active: false, inactiveReason: 'manual' }).where(eq(trackedPage.url, `${SITE}/pricing`));
    const r = await world({ links: [{ href: 'http://www.smithhvac.example/pricing/', text: 'Pricing' }, ...BASE_LINKS] }).run();
    expect(r.mode).toBe('initial');
    expect(await page(`${SITE}/ac-repair`)).toMatchObject({ active: false, inactiveReason: 'manual' });
    expect(await page(`${SITE}/pricing`)).toMatchObject({ active: false, inactiveReason: 'manual' });
    expect((await pages()).filter((p) => p.active).map((p) => p.url)).toEqual([`${SITE}/`]);
  });

  it('duplicate rows by page key: one stays active (pinned, else most recently captured), the others go inactive duplicate', async () => {
    const base = { competitorId: IDS.competitorX, pageType: 'pricing', source: 'nav', cadence: 'daily' };
    await dbs.service.insert(trackedPage).values([
      { ...base, url: `${SITE}/`, pageType: 'home' },
      { ...base, url: `${SITE}/pricing`, lastCapturedAt: sql`now() - interval '3 days'` },
      { ...base, url: 'http://smithhvac.example/pricing', lastCapturedAt: sql`now() - interval '1 day'` },
      { ...base, url: 'https://www.smithhvac.example/ac-repair', pageType: 'service', pinned: true },
      { ...base, url: `${SITE}/ac-repair`, pageType: 'service', lastCapturedAt: sql`now()` },
    ]);
    const r = await world().run();
    expect(r).toMatchObject({ mode: 'refresh', deactivated: 2, newPages: 0 });
    expect(await page(`${SITE}/pricing`)).toMatchObject({ active: false, inactiveReason: 'duplicate' });
    expect(await page('http://smithhvac.example/pricing')).toMatchObject({ active: true });
    expect(await page('https://www.smithhvac.example/ac-repair')).toMatchObject({ active: true });
    expect(await page(`${SITE}/ac-repair`)).toMatchObject({ active: false, inactiveReason: 'duplicate' });
    const activeKeys = (await pages()).filter((x) => x.active).map((p) => pageKey(p.url));
    expect(new Set(activeKeys).size).toBe(activeKeys.length);
    // A duplicate is never re-activated by a later run.
    await world().run();
    expect(await page(`${SITE}/pricing`)).toMatchObject({ active: false, inactiveReason: 'duplicate' });
  });

  it('keeps one candidate URL per page key, preferring https', async () => {
    await world({
      links: [{ href: 'http://www.smithhvac.example/pricing/', text: 'Pricing' }, { href: `${SITE}/pricing?utm_source=nav`, text: 'Pricing' }, { href: `${SITE}/ac-repair`, text: 'AC' }],
    }).run();
    expect((await pages()).map((p) => p.url).sort()).toEqual([`${SITE}/`, `${SITE}/ac-repair`, `${SITE}/pricing`]);
  });
});
