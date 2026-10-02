import { ad, capture, changeEvent, client, eventScore, move, moveEvent, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader } from '../tag/tag-stage';
import { adActivity, listMoveClients, nextStatus, updateMovesForClient } from './moves-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const factors = { typeWeight: 1, size: 1, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: null, needsReviewCap: false, thresholds: { alert: 70, brief: 40 }, scoringVersion: 2 };
let cuts: string[];

async function cut(at: number, from: string, to: string) {
  const [e] = await dbs.service
    .insert(changeEvent)
    .values({
      competitorId: IDS.competitorX, changeType: 'price_change', channels: ['web'], services: { hvac_plumbing: 'ac_tune_up' }, summary: `cut ${from}→${to}`,
      facts: diffFacts(extractNumericFacts(from), extractNumericFacts(to)), confidence: 0.95, occurredAt: day(at),
    })
    .returning({ id: changeEvent.id });
  await dbs.service.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score: 80, route: 'alert', factors, packVersion: 1 });
  return e!.id;
}

const moves = () => dbs.owner.select().from(move);
const run = (at: number, clientId: string = IDS.clientA1) => updateMovesForClient({ db: dbs.service, packs }, clientId, { now: day(at) });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
  cuts = [await cut(90, '$100', '$80'), await cut(95, '$80', '$70')];
});

describe('updateMovesForClient', () => {
  it('opens an emerging move with its evidence chain', async () => {
    expect(await run(100)).toEqual({ opened: 1, updated: 0, fading: 0, closed: 0 });
    const [m] = await moves();
    expect(m).toMatchObject({ moveType: 'price_war', status: 'emerging', confidence: 0.4, agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, lastEvidenceAt: day(95), closedAt: null });
    expect(m?.details).toEqual({ eventCount: 2, channels: ['web'], facts: { cuts: 2 } });
    expect((await dbs.owner.select().from(moveEvent)).map((l) => l.eventId).sort()).toEqual([...cuts].sort());
  });

  it('becomes active once it has held for a week, and is idempotent per run', async () => {
    await run(100);
    expect(await run(108)).toEqual({ opened: 0, updated: 1, fading: 0, closed: 0 });
    await run(108);
    expect((await moves()).map((m) => m.status)).toEqual(['active']);
    expect(await dbs.owner.select().from(moveEvent)).toHaveLength(2);
  });

  it('fades when its newest evidence is over 30 days old', async () => {
    await run(100);
    await run(130);
    expect((await moves())[0]?.status).toBe('fading');
  });

  it('fades when the rule stops holding, and closes 30 days later', async () => {
    await run(100);
    await dbs.owner.delete(eventScore).where(eq(eventScore.eventId, cuts[1]!));
    expect(await run(101)).toMatchObject({ fading: 1, closed: 0 });
    expect((await moves())[0]).toMatchObject({ status: 'fading', closedAt: null });
    expect(await run(131)).toMatchObject({ closed: 1 });
    expect((await moves())[0]?.closedAt).toEqual(day(131));
  });

  it('names the service in a new-service-line summary from the client pack', async () => {
    const [e] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorX, changeType: 'new_service', channels: ['google_business_profile', 'web'], services: { hvac_plumbing: 'water_heater' }, summary: 'added water heaters', confidence: 0.9, occurredAt: day(96) })
      .returning({ id: changeEvent.id });
    await dbs.service.insert(eventScore).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: e!.id, score: 80, route: 'alert', factors, packVersion: 1 });
    await run(100);
    expect((await moves()).find((m) => m.moveType === 'new_service_line')?.summary).toBe('Launched a new service line: Water heater repair & install');
  });

  it('only uses events the client was scored for, and keeps moves private to the tenant', async () => {
    expect(await run(100, IDS.clientB1)).toEqual({ opened: 0, updated: 0, fading: 0, closed: 0 }); // B1 tracks X but has no scores
    await run(100);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(move))).toEqual([]);
    expect(await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(move))).toHaveLength(1);
  });
});

describe('nextStatus', () => {
  it('is emerging at first, active after a week or at high confidence, fading on stale evidence', () => {
    expect(nextStatus(day(100), { confidence: 0.4, lastEvidenceAt: day(99) }, day(100))).toBe('emerging');
    expect(nextStatus(day(100), { confidence: 0.7, lastEvidenceAt: day(99) }, day(100))).toBe('active');
    expect(nextStatus(day(100), { confidence: 0.4, lastEvidenceAt: day(99) }, day(107))).toBe('active');
    expect(nextStatus(day(100), { confidence: 0.9, lastEvidenceAt: day(60) }, day(100))).toBe('fading');
  });
});

describe('adActivity and listMoveClients', () => {
  it('compares active ads now with the 90-day baseline', async () => {
    const base = { competitorId: IDS.competitorX, platform: 'meta', isActive: true };
    await dbs.service.insert(ad).values([
      ...[1, 2, 3].map((i) => ({ ...base, externalId: `old${i}`, firstSeenAt: day(0) })),
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ ...base, externalId: `new${i}`, firstSeenAt: day(98) })),
      { ...base, externalId: 'ended', isActive: false, firstSeenAt: day(0), endedAt: day(10), lastSeenAt: day(10) },
    ]);
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(0) });
    expect(await adActivity(dbs.service, IDS.competitorX, day(100))).toEqual({ activeNow: 9, baseline: 3, historyWeeks: 12 });
  });

  it('averages only the weeks since our first ok ad capture (weeks before onboarding are not zero ads)', async () => {
    const base = { competitorId: IDS.competitorX, platform: 'google', isActive: true };
    await dbs.service.insert(ad).values([1, 2, 3].map((i) => ({ ...base, externalId: `a${i}`, firstSeenAt: day(70) })));
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_business_profile', capturedAt: day(0) }); // not an ad capture
    await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_ads', status: 'vendor_error', collectorVersion: 'test/1', capturedAt: day(10) });
    expect(await adActivity(dbs.service, IDS.competitorX, day(100))).toEqual({ activeNow: 3, baseline: 0, historyWeeks: 0 }); // no ok ad capture yet
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_ads', capturedAt: day(70) });
    // Sample points day(93), day(86), day(79), day(72) are on/after day(70): 4 weeks of 3 ads each.
    expect(await adActivity(dbs.service, IDS.competitorX, day(100))).toEqual({ activeNow: 3, baseline: 3, historyWeeks: 4 });
  });

  it('lists every client that tracks a competitor', async () => {
    expect((await listMoveClients(dbs.service)).sort()).toEqual([IDS.clientA1, IDS.clientA2, IDS.clientB1].sort());
  });
});
