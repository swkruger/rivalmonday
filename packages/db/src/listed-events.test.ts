import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { capture, client, competitor, listedEvent } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const SELF_A1 = '00000000-0000-4000-8000-0000000000f9';
const CAP_X = '00000000-0000-4000-8000-0000000000c1';
const CAP_Y = '00000000-0000-4000-8000-0000000000c2';
const CAP_S = '00000000-0000-4000-8000-0000000000c3';
const B1 = { agencyId: IDS.agencyB, clientScope: [IDS.clientB1] };
const A1 = { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(competitor).values({ id: SELF_A1, name: 'A1 Venue', placeId: 'place-a1' });
  await dbs.owner.update(client).set({ selfCompetitorId: SELF_A1 }).where(eq(client.id, IDS.clientA1));
  await dbs.service.insert(capture).values([
    { id: CAP_X, competitorId: IDS.competitorX, source: 'web', status: 'ok', collectorVersion: 'web/1' },
    { id: CAP_Y, competitorId: IDS.competitorY, source: 'web', status: 'ok', collectorVersion: 'web/1' },
    { id: CAP_S, competitorId: SELF_A1, source: 'web', status: 'ok', collectorVersion: 'web/1' },
  ]);
});

const ev = (competitorId: string, cap: string, over: Partial<typeof listedEvent.$inferInsert> = {}) => ({
  competitorId, eventKey: 'k1', name: 'Jazz Night', nameNorm: 'jazz night', startDate: '2026-12-01', sources: ['web' as const],
  firstCaptureId: cap, lastCaptureId: cap, firstSeenAt: new Date(), lastSeenAt: new Date(), ...over,
});

describe('listed_event', () => {
  it('client B sees a shared competitor\'s event, not one only A tracks', async () => {
    await dbs.service.insert(listedEvent).values([ev(IDS.competitorX, CAP_X), ev(IDS.competitorY, CAP_Y)]);
    const rows = await withTenant(dbs.app, B1, (tx) => tx.select().from(listedEvent));
    expect(rows.map((r) => r.competitorId)).toEqual([IDS.competitorX]);
  });

  it('a client sees its own self-business event, other clients do not', async () => {
    await dbs.service.insert(listedEvent).values(ev(SELF_A1, CAP_S));
    expect(await withTenant(dbs.app, A1, (tx) => tx.select().from(listedEvent))).toHaveLength(1);
    expect(await withTenant(dbs.app, B1, (tx) => tx.select().from(listedEvent))).toHaveLength(0);
  });

  it('app_user cannot write (permission denied)', async () => {
    expect(await errorText(withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.insert(listedEvent).values(ev(IDS.competitorX, CAP_X))))).toMatch(/permission denied/);
  });

  it('rejects empty and unknown sources', async () => {
    expect(await errorText(dbs.service.insert(listedEvent).values(ev(IDS.competitorX, CAP_X, { sources: [] })))).toMatch(/listed_event_sources_check/);
    expect(await errorText(dbs.service.insert(listedEvent).values(ev(IDS.competitorX, CAP_X, { sources: ['yelp' as 'web'] })))).toMatch(/listed_event_sources_check/);
  });

  it('rejects an unknown status', async () => {
    expect(await errorText(dbs.service.insert(listedEvent).values(ev(IDS.competitorX, CAP_X, { status: 'gone' as 'cancelled' })))).toMatch(/listed_event_status_check/);
  });

  it('rejects a duplicate (competitor, event_key)', async () => {
    await dbs.service.insert(listedEvent).values(ev(IDS.competitorX, CAP_X));
    expect(await errorText(dbs.service.insert(listedEvent).values(ev(IDS.competitorX, CAP_X)))).toMatch(/listed_event_key_unique/);
  });
});
