import { ad, capture, competitorSource, observation } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CompetitorProfile, TimelineItem } from './schemas';
import { ctx, dbs, pageId, registry, resetWorkspace, seedEvent, seedMove } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

describe('get_competitor_profile', () => {
  it('summarises GBP, ads, pressure, moves and collection status', async () => {
    const [gc] = await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_business_profile', status: 'ok', collectorVersion: 't', capturedAt: new Date() }).returning();
    await dbs.owner.insert(observation).values({ competitorId: IDS.competitorX, captureId: gc!.id, kind: 'gbp_profile', key: 'profile', data: { rating: 4.6, votes: 212, category: 'HVAC contractor' }, observedAt: new Date() });
    await dbs.owner.insert(ad).values([
      { competitorId: IDS.competitorX, platform: 'google', externalId: 'g1', isActive: true, firstSeenAt: new Date(), lastSeenAt: new Date() },
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm1', isActive: true, firstSeenAt: new Date(), lastSeenAt: new Date() },
      { competitorId: IDS.competitorX, platform: 'meta', externalId: 'm2', isActive: false, firstSeenAt: new Date(), lastSeenAt: new Date() },
    ]);
    await dbs.owner.insert(competitorSource).values({ competitorId: IDS.competitorX, source: 'gbp', active: true, nextDueAt: new Date(), lastRunAt: new Date(), lastStatus: 'ok' });
    await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, trackedPageId: pageId, source: 'web', status: 'blocked', collectorVersion: 't', capturedAt: new Date() });
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await seedMove([e.eventId], { status: 'active' });
    const p = (await registry.invoke(owner, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as CompetitorProfile;
    expect(p).toMatchObject({
      name: 'Smith HVAC', gbp: { rating: 4.6, reviews: 212, category: 'HVAC contractor' }, activeAds: { google: 1, meta: 1 }, openMoves: 1,
      sources: [{ source: 'gbp', label: 'Google Business Profile', active: true, lastStatus: 'ok' }], pages: { active: 1, blocked: 1 },
    });
    expect(p.pressure.level).toBe('high');
  });

  it('is not found for an untracked or foreign competitor (Review Focus 1)', async () => {
    await expect(registry.invoke(owner, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorY })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ownerNoDash, 'get_competitor_profile', { clientId: IDS.clientA1, competitorId: IDS.competitorX })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('get_competitor_timeline', () => {
  it('merges live events and move starts newest first, within the period', async () => {
    const old = await seedEvent({ score: 60, route: 'brief', ageDays: 120 });
    const recent = await seedEvent({ score: 86, route: 'alert', ageDays: 2 });
    await seedEvent({ score: 70, route: 'alert', ageDays: 1, retracted: true });
    const m = await seedMove([recent.eventId]);
    const t = (await registry.invoke(am, 'get_competitor_timeline', { clientId: IDS.clientA1, competitorId: IDS.competitorX })) as { items: TimelineItem[] };
    expect(t.items.map((i) => [i.kind, i.id])).toEqual([['move', m], ['event', recent.eventId]]);
    const year = (await registry.invoke(am, 'get_competitor_timeline', { clientId: IDS.clientA1, competitorId: IDS.competitorX, days: 365 })) as { items: TimelineItem[] };
    expect(year.items.map((i) => i.id)).toContain(old.eventId);
  });
});
