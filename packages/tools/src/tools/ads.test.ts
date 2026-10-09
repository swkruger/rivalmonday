import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { libraryUrl } from './ads';
import type { AdList } from './schemas';
import { ago, ctx, registry, resetWorkspace, seedAds } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(async () => {
  await resetWorkspace();
  await seedAds({
    ads: [
      { platform: 'meta', externalId: 'm1', title: '$49 tune-up', text: 'Book now', landingUrl: 'https://smithhvac.example/tuneup', isActive: true, firstSeenAt: ago(20), lastSeenAt: ago(1) },
      { platform: 'google', externalId: 'g1', advertiserId: 'AR123', title: 'Furnace repair', isActive: false, firstSeenAt: ago(60), lastSeenAt: ago(30), endedAt: ago(30) },
      { platform: 'google', externalId: 'g2', title: 'No advertiser id', isActive: true, firstSeenAt: ago(5), lastSeenAt: ago(2) },
    ],
  });
  await seedAds({ competitorId: IDS.competitorY, ads: [{ platform: 'meta', externalId: 'y1', isActive: true }] });
});

describe('list_ads', () => {
  it('lists active ads of tracked competitors by default, newest first (decision 5)', async () => {
    const r = (await registry.invoke(owner, 'list_ads', { clientId: IDS.clientA1 })) as AdList;
    expect(r.items.map((a) => a.title)).toEqual(['$49 tune-up', 'No advertiser id']);
    expect(r.items[0]).toMatchObject({ competitorName: 'Smith HVAC', platform: 'meta', active: true, endedAt: null, libraryUrl: 'https://www.facebook.com/ads/library/?id=m1' });
    expect(r.hasMore).toBe(false);
  });

  it('filters by status and platform, active first under "all", and pages', async () => {
    const all = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'all' })) as AdList;
    expect(all.items.map((a) => a.title)).toEqual(['$49 tune-up', 'No advertiser id', 'Furnace repair']);
    const ended = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'ended', platform: 'google' })) as AdList;
    expect(ended.items.map((a) => [a.title, a.libraryUrl])).toEqual([['Furnace repair', 'https://adstransparency.google.com/advertiser/AR123/creative/g1']]);
    const page = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'all', limit: 2, offset: 1 })) as AdList;
    expect([page.items.map((a) => a.title), page.hasMore]).toEqual([['No advertiser id', 'Furnace repair'], false]);
    const first = (await registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, status: 'all', limit: 2 })) as AdList;
    expect(first.hasMore).toBe(true);
  });

  it('refuses an untracked competitor, another agency and a client without dashboard', async () => {
    await expect(registry.invoke(am, 'list_ads', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'list_ads', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'list_ads', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('libraryUrl', () => {
  it('escapes ids and has no Google link without an advertiser id', () => {
    expect(libraryUrl({ platform: 'meta', externalId: 'a b', advertiserId: null })).toBe('https://www.facebook.com/ads/library/?id=a%20b');
    expect(libraryUrl({ platform: 'google', externalId: 'g', advertiserId: null })).toBeNull();
  });
});
