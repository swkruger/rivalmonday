import { agency, agencyServiceable, brief, briefItem, capture, client, clientWorkAllowed, clientSetup, clientCompetitor, competitor, discoveryRun, evidence, observation, rankScan, recommendation, vendorTask } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIEF_MAX_ATTEMPTS, BRIEF_STALE_MINUTES } from './generate';
import { listStartingPointDue, resetStartingPoint, startingPointReadiness } from './readiness';

const AGENCY_C = randomUUID();
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
      ready: false, timedOut: false, setupHold: false, checks: { profile: false, reviews: false, rankings: null, competitors: null },
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

describe('setup clock', () => {
  const openSetup = (o: Partial<typeof clientSetup.$inferInsert> = {}) => dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, ...o });

  it('readiness holds an open setup and times out 48 h after competitors_done_at', async () => {
    await activate(hoursAgo(24 * 5));
    await openSetup();
    await seedProfile();
    await seedReviewsDone();
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, timedOut: false, setupHold: true });
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([]);
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: hoursAgo(10) });
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: true, setupHold: false });
    await dbs.owner.update(brief).set({ status: 'sent' }).where(eq(brief.clientId, IDS.clientA2));
    await dbs.owner.delete(vendorTask);
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, timedOut: false });
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: hoursAgo(49) });
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ ready: false, timedOut: true });
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([IDS.clientA1]);
  });

  it('an open setup nobody finished is due 14 days after activation', async () => {
    await activate(hoursAgo(24 * 14 + 1));
    await openSetup();
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual([IDS.clientA1]);
  });

  it('existing client without a row keeps the activated_at clock', async () => {
    await activate(hoursAgo(49));
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ timedOut: true, setupHold: false });
    await openSetup({ completedAt: hoursAgo(1) });
    expect(await startingPointReadiness(dbs.service, IDS.clientA1, NOW)).toMatchObject({ timedOut: true, setupHold: false });
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

  describe('billing state (9a/9b)', () => {
    // Every seeded client is active, past the 48 h wait and without a starting point (beforeEach gave A2/B1 one).
    const due72h = async () => {
      await dbs.owner.delete(brief);
      await dbs.owner.update(client).set({ activatedAt: hoursAgo(72), status: 'active' });
    };
    const sorted = async () => (await listStartingPointDue(dbs.service, NOW)).sort();

    it('skips every client of a read_only or suspended agency; another agency still runs', async () => {
      await due72h();
      await pauseAgency(dbs.owner, IDS.agencyA);
      expect(await sorted()).toEqual([IDS.clientB1]);
      await pauseAgency(dbs.owner, IDS.agencyA, 'suspended');
      expect(await sorted()).toEqual([IDS.clientB1]);
    });

    it('skips a paused client; its unpaused sibling still runs', async () => {
      await due72h();
      await pauseClient(dbs.owner, IDS.clientA1);
      expect(await sorted()).toEqual([IDS.clientA2, IDS.clientB1].sort());
    });

    it('spend-paused client is not offered starting-point work; its sibling still runs (7b1)', async () => {
      await due72h();
      await spendPauseClient(dbs.owner, IDS.clientA1);
      expect(await sorted()).toEqual([IDS.clientA2, IDS.clientB1].sort());
    });
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

/** Today's per-client implementation, kept verbatim as the oracle for the set-based prefilter (7c2 T4). */
async function legacyListStartingPointDue(db: typeof dbs.service, now: Date): Promise<string[]> {
  const clients = await db.select({ id: client.id }).from(client).where(and(clientWorkAllowed(client), agencyServiceable(client.agencyId))).orderBy(client.createdAt);
  const due: string[] = [];
  for (const c of clients) {
    const [b] = await db
      .select({ status: brief.status, attempts: brief.attempts, updatedAt: brief.updatedAt })
      .from(brief).where(and(eq(brief.clientId, c.id), sql`${brief.kind} = 'starting_point'`)).limit(1);
    const stale = b?.status === 'generating' && now.getTime() - b.updatedAt.getTime() > BRIEF_STALE_MINUTES * 60_000;
    if (b && !(b.status === 'failed' && b.attempts < BRIEF_MAX_ATTEMPTS) && !stale) continue;
    const r = await startingPointReadiness(db, c.id, now);
    if (r.ready || r.timedOut) due.push(c.id);
  }
  return due;
}

describe('listStartingPointDue set-based prefilter (7c2 T4)', () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
  const SP: { name: string; row?: Partial<typeof brief.$inferInsert> }[] = [
    { name: 'none' },
    { name: 'failed-2', row: { status: 'failed', attempts: 2 } },
    { name: 'failed-3', row: { status: 'failed', attempts: 3 } },
    { name: 'generating-29', row: { status: 'generating', updatedAt: minutesAgo(29) } },
    { name: 'generating-31', row: { status: 'generating', updatedAt: minutesAgo(31) } },
    { name: 'ready', row: { status: 'ready' } },
    { name: 'sent', row: { status: 'sent' } },
  ];

  it('set-based scan equals legacy', async () => {
    await dbs.owner.insert(agency).values({ id: AGENCY_C, name: 'Agency C' });
    await dbs.owner.delete(brief);
    await dbs.owner.delete(client);
    const values: (typeof client.$inferInsert)[] = [];
    // Distinct creation times (a second apart): both scans order by created_at, so ties would make the order comparison flaky.
    let seq = 0;
    const created = (h: number) => new Date(hoursAgo(h).getTime() - ++seq * 1000);
    // Created 1 h / 72 h ago: the old ones are past the 48 h wait (due when their brief state allows), the young ones are not ready.
    for (const age of [1, 72]) for (const sp of SP) values.push({ agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', name: `${age}h/${sp.name}`, createdAt: created(age) });
    values.push(
      { agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', name: 'paused', createdAt: created(72), pausedAt: NOW },
      { agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', name: 'prospect', createdAt: created(72), status: 'prospect' },
      { agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', name: 'archived', createdAt: created(72), archivedAt: NOW },
      { agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', name: 'spend-paused', createdAt: created(72), spendPausedAt: NOW },
      { agencyId: AGENCY_C, verticalId: 'hvac_plumbing', name: 'suspended-agency', createdAt: created(72) },
    );
    const ins = await dbs.owner.insert(client).values(values).returning({ id: client.id });
    await pauseAgency(dbs.owner, AGENCY_C, 'suspended');
    const briefs: (typeof brief.$inferInsert)[] = [];
    ins.forEach((c, i) => {
      const sp = SP[i % SP.length]!;
      if (i < 2 * SP.length && sp.row) briefs.push({ agencyId: IDS.agencyA, clientId: c.id, deliveryDate: '2026-10-14', periodStart: hoursAgo(72), periodEnd: hoursAgo(20), status: 'ready', kind: 'starting_point', summary: 's', ...sp.row });
    });
    // One weekly (non-starting-point) brief must not count as a starting point.
    briefs.push({ agencyId: IDS.agencyA, clientId: ins[0]!.id, deliveryDate: '2026-10-12', periodStart: hoursAgo(72), periodEnd: hoursAgo(20), status: 'sent', kind: 'standard', summary: 's' });
    await dbs.owner.insert(brief).values(briefs);
    const want = await legacyListStartingPointDue(dbs.service, NOW);
    expect(want.length).toBeGreaterThanOrEqual(3); // non-vacuous
    expect(await listStartingPointDue(dbs.service, NOW)).toEqual(want);
  });

  it('listStartingPointDue skips readiness for a client with a sent starting point', async () => {
    // beforeEach gave A2/B1 a sent starting point; A1 has none and is past the wait → readiness runs for it (several selects).
    await activate(hoursAgo(72));
    const spy = vi.spyOn(dbs.service, 'select');
    try {
      expect(await listStartingPointDue(dbs.service, NOW)).toEqual([IDS.clientA1]);
      expect(spy.mock.calls.length).toBeGreaterThan(1);
      spy.mockClear();
      await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-14', periodStart: hoursAgo(72), periodEnd: hoursAgo(20), status: 'sent', kind: 'starting_point', summary: 's' });
      expect(await listStartingPointDue(dbs.service, NOW)).toEqual([]);
      expect(spy.mock.calls.length).toBe(1); // only the candidate query: no per-client brief lookup, no readiness reads
    } finally {
      spy.mockRestore();
    }
  });
});
