import { client, competitor, prospectReport } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdActivityView, WorkspaceOverview } from './schemas';
import { ctx, day, dbs, registry, resetWorkspace, seedAds, seedEvent, seedGbpRating } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

/** First ok ad capture at −15d; ad a live throughout, b ended at −10d, c first seen at −3d. */
async function seedAdHistory(): Promise<void> {
  const now = Date.now();
  await seedAds({
    firstCheckAt: new Date(now - 15 * day),
    ads: [
      { platform: 'google', externalId: 'a', isActive: true, firstSeenAt: new Date(now - 15 * day), lastSeenAt: new Date(now) },
      { platform: 'google', externalId: 'b', isActive: false, firstSeenAt: new Date(now - 15 * day), lastSeenAt: new Date(now - 10 * day), endedAt: new Date(now - 10 * day) },
      { platform: 'meta', externalId: 'c', isActive: true, firstSeenAt: new Date(now - 3 * day), lastSeenAt: new Date(now) },
    ],
  });
}

const prospectData = { generatedAt: new Date().toISOString(), keywords: [], points: 9, scanId: null, businesses: [], notes: [] };

describe('get_ad_activity', () => {
  it('counts active ads per week and leaves points before the first ad check empty (decision 13)', async () => {
    await seedAdHistory();
    const r = (await registry.invoke(am, 'get_ad_activity', { clientId: IDS.clientA1, weeks: 4 })) as AdActivityView;
    expect(r.weeks).toHaveLength(4);
    expect(r.weeks[3]).toBe(new Date().toISOString().slice(0, 10));
    // Preflight F9: the −14d point is after the first check (−15d); a counts and b (ended −10d) still counts → 2.
    expect(r.series).toEqual([{ competitorId: IDS.competitorX, name: 'Smith HVAC', points: [null, 2, 1, 2] }]);
  });

  it('gives an empty series list for an untracked competitor, not an error', async () => {
    const r = (await registry.invoke(owner, 'get_ad_activity', { clientId: IDS.clientA1, competitorId: IDS.competitorY })) as AdActivityView;
    expect(r.weeks).toHaveLength(12);
    expect(r.series).toEqual([]);
  });

  it('is not found for another agency and needs dashboard for clients', async () => {
    await expect(registry.invoke(otherAgency, 'get_ad_activity', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_ad_activity', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('get_workspace_overview', () => {
  it('computes the KPIs from live events only (Review Focus 3)', async () => {
    const priceFacts = [{ kind: 'price', before: { kind: 'price', value: 99, unit: 'USD', raw: '$99', context: '' }, after: { kind: 'price', value: 79, unit: 'USD', raw: '$79', context: '' }, pct: -20.2 }];
    await seedEvent({ score: 86, route: 'alert', ageDays: 1, facts: priceFacts as never });
    await seedEvent({ score: 50, route: 'brief', ageDays: 2, type: 'promo' });
    await seedEvent({ score: 90, route: 'alert', ageDays: 1, retracted: true });
    // Preflight F10: priceMoves7d counts every route (decision 12), so the archive event is not a price change.
    await seedEvent({ score: 20, route: 'archive', ageDays: 1, type: 'content' });
    await seedEvent({ score: 60, route: 'brief', ageDays: 9 });
    await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
    const o = (await registry.invoke(owner, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview;
    expect(o).toMatchObject({ clientId: IDS.clientA1, trackedCompetitors: 1, changes7d: 2, alerts7d: 1, priceMoves7d: 1, priceCuts7d: 1, activeAds: null, activeAds7dAgo: null, pitchSnapshot: false });
    expect(o.pressure[0]).toMatchObject({ competitorId: IDS.competitorX, name: 'Smith HVAC' });
  });

  it('sums active ads now and a week ago from the weekly series', async () => {
    await seedAdHistory();
    const o = (await registry.invoke(am, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview;
    expect(o).toMatchObject({ activeAds: 2, activeAds7dAgo: 1 });
  });

  it('compares the self business rating with the competitor average', async () => {
    const [self] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC (self)', placeId: 'ChIJselfA1xxxxx' }).returning();
    await dbs.owner.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, IDS.clientA1));
    await seedGbpRating(self!.id, 4.8);
    await seedGbpRating(IDS.competitorX, 4.1, new Date(Date.now() - day));
    await seedGbpRating(IDS.competitorX, 4.5);
    const o = (await registry.invoke(am, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview;
    expect(o.rating).toEqual({ self: 4.8, competitorAverage: 4.5 });
  });

  it('flags the pitch snapshot for agency roles only, and needs dashboard for clients', async () => {
    await dbs.owner.insert(prospectReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'ready', finishedAt: new Date(), data: prospectData });
    expect(((await registry.invoke(am, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview).pitchSnapshot).toBe(true);
    expect(((await registry.invoke(owner, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview).pitchSnapshot).toBe(false);
    await expect(registry.invoke(ownerNoDash, 'get_workspace_overview', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(otherAgency, 'get_workspace_overview', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not flag the pitch snapshot when the latest report failed (preflight F11)', async () => {
    const now = Date.now();
    await dbs.owner.insert(prospectReport).values([
      { agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'ready', createdAt: new Date(now - 2 * day), finishedAt: new Date(now - 2 * day), data: prospectData },
      { agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'failed', createdAt: new Date(now - day), finishedAt: new Date(now - day), error: 'boom' },
    ]);
    expect(((await registry.invoke(am, 'get_workspace_overview', { clientId: IDS.clientA1 })) as WorkspaceOverview).pitchSnapshot).toBe(false);
  });
});
