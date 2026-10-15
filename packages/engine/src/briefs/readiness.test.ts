import { brief, capture, client, competitor, discoveryRun, evidence, observation, rankScan, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listStartingPointDue, startingPointReadiness } from './readiness';

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
