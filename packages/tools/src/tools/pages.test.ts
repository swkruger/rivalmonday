import { type AccessContext, createAccessContext } from '@cs/core';
import { competitor, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';
import { defaultCadence } from './pages';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const reg = (webMonitoring: boolean) => createToolRegistry({ app: dbs.app, service: dbs.service, webMonitoring }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: scope, features: [] });
const amA1 = ctx('account_manager', [IDS.clientA1]);
let pricing = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(competitor).set({ domain: 'smithhvac.com' }).where(eq(competitor.id, IDS.competitorX));
  const [p] = await dbs.owner.insert(trackedPage).values({ competitorId: IDS.competitorX, url: 'https://smithhvac.com/blog/x', pageType: 'blog', source: 'sitemap', cadence: 'weekly' }).returning();
  pricing = p!.id;
});

describe('tracked pages', () => {
  it('default cadence follows the page type', () => {
    expect(defaultCadence('pricing')).toBe('daily');
    expect(defaultCadence('blog')).toBe('weekly');
  });

  it('lists pages of a tracked competitor only', async () => {
    const { items } = (await reg(false).invoke(amA1, 'list_tracked_pages', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as { items: { url: string }[] };
    expect(items.map((i) => i.url)).toEqual(['https://smithhvac.com/blog/x']);
    await expect(reg(false).invoke(amA1, 'list_tracked_pages', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('pins to daily and unpins back to the type default', async () => {
    await reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA1, pageId: pricing, pinned: true });
    expect((await dbs.owner.select().from(trackedPage).where(eq(trackedPage.id, pricing)))[0]).toMatchObject({ pinned: true, cadence: 'daily' });
    await reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA1, pageId: pricing, pinned: false });
    expect((await dbs.owner.select().from(trackedPage).where(eq(trackedPage.id, pricing)))[0]).toMatchObject({ pinned: false, cadence: 'weekly' });
    await expect(reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA2, pageId: pricing, pinned: true })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses a missing page and an out-of-scope page with the same message (final review)', async () => {
    const missing = reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA1, pageId: '00000000-0000-4000-8000-000000000000', pinned: true });
    await expect(missing).rejects.toMatchObject({ code: 'not_found', message: 'Page not found' });
    const outOfScope = reg(false).invoke(amA1, 'set_page_pin', { clientId: IDS.clientA2, pageId: pricing, pinned: true });
    await expect(outOfScope).rejects.toMatchObject({ code: 'not_found', message: 'Page not found' });
  });

  it('adds manual pages only with monitoring on, on the competitor’s own host, under the cap (Review Focus 5)', async () => {
    const input = { clientId: IDS.clientA1, competitorId: IDS.competitorX, url: 'https://www.smithhvac.com/specials#top', pageType: 'promo' };
    await expect(reg(false).invoke(amA1, 'add_tracked_page', input)).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('monitoring') });
    const { pageId } = (await reg(true).invoke(amA1, 'add_tracked_page', input)) as { pageId: string };
    expect((await dbs.owner.select().from(trackedPage).where(eq(trackedPage.id, pageId)))[0]).toMatchObject({ url: 'https://www.smithhvac.com/specials', source: 'manual', pinned: true, cadence: 'daily', active: true });
    await expect(reg(true).invoke(amA1, 'add_tracked_page', { ...input, url: 'https://evil.example/specials' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(reg(true).invoke(amA1, 'add_tracked_page', { ...input, url: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'invalid_input' });
    for (let i = 0; i < 23; i++) await dbs.owner.insert(trackedPage).values({ competitorId: IDS.competitorX, url: `https://smithhvac.com/p${i}`, pageType: 'other', source: 'nav', cadence: 'weekly' });
    await expect(reg(true).invoke(amA1, 'add_tracked_page', { ...input, url: 'https://smithhvac.com/one-more' })).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringContaining('25') });
  });

  it('refuses to add a page for a competitor the client does not track (cross-scope, Review Focus 1)', async () => {
    const input = { clientId: IDS.clientA2, competitorId: IDS.competitorX, url: 'https://www.smithhvac.com/specials', pageType: 'promo' };
    await expect(reg(true).invoke(amA1, 'add_tracked_page', input)).rejects.toMatchObject({ code: 'not_found' });
    const rows = await dbs.owner.select().from(trackedPage).where(eq(trackedPage.url, 'https://www.smithhvac.com/specials'));
    expect(rows).toHaveLength(0);
  });
});
