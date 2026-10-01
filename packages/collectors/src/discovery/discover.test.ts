import type { Ai } from '@cs/ai';
import { trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderedPage, Renderer } from '../web/renderer';
import { RobotsPolicy } from '../web/robots';
import { discoverPages } from './discover';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

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
    decide: vi.fn(async (_task: string, state: unknown) => {
      const url = (state as { url: string }).url;
      const value = types[url] ?? 'other';
      return { answers: { page_type: { type: 'choice', value, probabilities: { [value]: 0.95 }, confidence: 0.95, provider: 'jev' } }, needsReview: [] };
    }) as unknown as Ai['decide'],
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
    const result = await discoverPages({ db: dbs.service, renderer, robots, fetchText, ai }, { id: IDS.competitorX, domain: 'smithhvac.example' });
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
    await discoverPages({ db: dbs.service, renderer, robots, fetchText, ai }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    const again = await dbs.service.select().from(trackedPage).where(eq(trackedPage.competitorId, IDS.competitorX));
    expect(again).toHaveLength(4);
    expect(again.find((r) => r.url.endsWith('/ac-repair'))?.pageType).toBe('service_area');
  });

  it('records nothing when the homepage is blocked', async () => {
    const renderer: Renderer = { render: async () => ({ ...home, status: 'blocked', links: [] }), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 404, body: '' }));
    const result = await discoverPages(
      { db: dbs.service, renderer, robots, fetchText: async () => ({ status: 404, body: '' }), ai: fakeAi({}) },
      { id: IDS.competitorX, domain: 'smithhvac.example' },
    );
    expect(result).toMatchObject({ selected: 0, homepageStatus: 'blocked' });
    expect(await dbs.service.select().from(trackedPage)).toEqual([]);
  });
});
