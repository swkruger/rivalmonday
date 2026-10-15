import { brief, briefItem, capture, client, clientCompetitor, competitor, discoveryRun, evidence, observation, rankScan, recommendation, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listStartingPointDue, resetStartingPoint, startingPointReadiness } from './readiness';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-15T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
let selfId: string;

async function seedProfile() {
  const [c] = await dbs.owner.insert(capture).values({ competitorId: selfId, source: 'google_business_profile', status: 'ok', collectorVersion: 't' }).returning();
  await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' });
  await dbs.owner.insert(observation).values({ competitorId: selfId, captureId: c!.id, kind: 'gbp_profile', key: 'profile', data: { rating: 4.5 } });
}
const seedReviewsDone = () => dbs.owner.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: randomUUID(), competitorId: selfId, status: 'done' });
const activate = (at: Date, o: Partial<typeof client.$inferInsert> = {}) => dbs.owner.update(client).set({ activatedAt: at, ...o }).where(eq(client.id, IDS.clientA1));
async function trackRival() {
  const [r] = await dbs.owner.insert(competitor).values({ name: 'Rival HVAC', placeId: 'PRIVAL' }).returning({ id: competitor.id });
  await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: r!.id });
}
const AREA = { center: { lat: 1, lng: 1 }, radiusKm: 10, zips: ['76048'] };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [s] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC', placeId: 'PSELF' }).returning({ id: competitor.id });
  selfId = s!.id;
  await dbs.owner.update(client).set({ selfCompetitorId: selfId });
  // Only A1 is under test: the other seeded clients got their starting point long ago.
  for (const id of [IDS.clientA2, IDS.clientB1]) {
    const agencyId = id === IDS.clientB1 ? IDS.agencyB : IDS.agencyA;
    await dbs.owner.insert(brief).values({ agencyId, clientId: id, deliveryDate: '2026-01-01', periodStart: hoursAgo(9000), periodEnd: hoursAgo(9000), status: 'sent', kind: 'starting_point', summary: 's' });
  }
});

describe('startingPointReadiness', () => {
  it('rankings and competitors are null (not applicable) without keywords, service area or place id', async () => {
    await activate(hoursAgo(1));
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toEqual({
      ready: false, timedOut: false, checks: { profile: false, reviews: false, rankings: null, competitors: null },
    });
    await seedProfile();
    await seedReviewsDone();
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: true, checks: { profile: true, reviews: true, rankings: null, competitors: null } });
  });

  it('waits for the first finished rank scan and the latest discovery run when they apply', async () => {
    await activate(hoursAgo(1), { keywords: ['ac repair'], serviceArea: AREA, placeId: 'PSELF' });
    await seedProfile();
    await seedReviewsDone();
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, checks: { rankings: false, competitors: false } });
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', finishedAt: hoursAgo(0.5) });
    await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status: 'checking' });
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, checks: { rankings: true, competitors: false } });
    await dbs.owner.update(discoveryRun).set({ status: 'done', finishedAt: hoursAgo(0.2) });
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: true, checks: { rankings: true, competitors: true } });
  });

  it('a done discovery run with no tracked rival is not ready (waits for Track selected, else the 48 h timeout)', async () => {
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.clientId, IDS.clientA1)); // seedTenancy tracks X for A1
    await activate(hoursAgo(1), { keywords: ['ac repair'], serviceArea: AREA, placeId: 'PSELF' });
    await seedProfile();
    await seedReviewsDone();
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', finishedAt: hoursAgo(0.5) });
    await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status: 'done', finishedAt: hoursAgo(0.2) });
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, timedOut: false, checks: { competitors: false } });
    await activate(hoursAgo(49));
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, timedOut: true, checks: { competitors: false } });
    await trackRival();
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: true, checks: { competitors: true } });
  });
});

describe('startingPointReadiness: failed discovery', () => {
  it('treats a failed latest discovery run as not applicable, not as unready', async () => {
    await activate(hoursAgo(1), { keywords: ['ac repair'], serviceArea: AREA, placeId: 'PSELF' });
    await seedProfile();
    await seedReviewsDone();
    await dbs.owner.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', finishedAt: hoursAgo(0.5) });
    await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status: 'failed' });
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: true, checks: { competitors: null } });
  });
});

describe('listStartingPointDue', () => {
  it('not ready and < 48 h → not due', async () => {
    await activate(hoursAgo(47));
    await seedProfile();
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([]);
  });

  it('48 h passed → due with partial data', async () => {
    await activate(hoursAgo(49));
    await seedProfile();
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([IDS.clientA1]);
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, timedOut: true, checks: { profile: true, reviews: false } });
  });

  it('falls back to created_at when activated_at is unset', async () => {
    await activate(null as unknown as Date, { createdAt: hoursAgo(72) });
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([IDS.clientA1]);
  });

  it('ready → due before 48 h', async () => {
    await activate(hoursAgo(2));
    await seedProfile();
    await seedReviewsDone();
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([IDS.clientA1]);
  });

  it('prospects and clients that already have a starting point are not due; a retryable failure is', async () => {
    await activate(hoursAgo(72), { status: 'prospect' });
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([]);
    await activate(hoursAgo(72), { status: 'active' });
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-14', periodStart: hoursAgo(72), periodEnd: hoursAgo(20), status: 'ready', kind: 'starting_point', summary: 's' }).returning();
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([]);
    await dbs.owner.update(brief).set({ status: 'failed', attempts: 1 }).where(eq(brief.id, b!.id));
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([IDS.clientA1]);
    await dbs.owner.update(brief).set({ attempts: 3 }).where(eq(brief.id, b!.id));
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([]);
  });
});

describe('resetStartingPoint', () => {
  const seedSp = async (status: string) => {
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-14', periodStart: hoursAgo(72), periodEnd: hoursAgo(20), status, kind: 'starting_point', summary: 's' }).returning();
    const [i] = await dbs.owner.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, subject: 'self', headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 1, effort: 'L', impact: 'M' }).returning();
    await dbs.owner.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', briefItemId: i!.id, effort: 'L', impact: 'M', owner: 'client', source: 'brief' });
    return b!.id;
  };
  const a1Sp = () => dbs.owner.select().from(brief).where(eq(brief.clientId, IDS.clientA1));

  it.each(['ready', 'failed', 'generating'])('deletes a %s starting point with its items and recommendations', async (status) => {
    const id = await seedSp(status);
    expect(await resetStartingPoint(dbs.service, IDS.clientA1)).toEqual({ deleted: true });
    expect(await a1Sp()).toEqual([]);
    expect(await dbs.owner.select().from(briefItem).where(eq(briefItem.briefId, id))).toEqual([]);
    expect(await dbs.owner.select().from(recommendation).where(eq(recommendation.clientId, IDS.clientA1))).toEqual([]);
  });

  it.each(['approved', 'sent'])('refuses an %s starting point and leaves it alone', async (status) => {
    await seedSp(status);
    expect(await resetStartingPoint(dbs.service, IDS.clientA1)).toEqual({ refused: expect.stringMatching(new RegExp(`already ${status}`)) });
    expect(await a1Sp()).toHaveLength(1);
  });

  it('nothing to delete → deleted: false; another client is untouched', async () => {
    expect(await resetStartingPoint(dbs.service, IDS.clientA1)).toEqual({ deleted: false });
    expect(await dbs.owner.select().from(brief).where(eq(brief.clientId, IDS.clientA2))).toHaveLength(1);
  });
});
