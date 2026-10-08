import { changeEvent, client, clientCompetitor, EMBEDDING_DIMENSIONS, eventScore, scoreFailure, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { day } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { MAX_STAGE_ATTEMPTS } from '../stage';
import { findEngineWork } from '../sweep';
import { createPackLoader } from '../tag/tag-stage';
import { detailsSignature, factsSignature, scoreEvent } from './score-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const unit = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, k) => (k === i ? 1 : 0));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner); // A1 (hvac) and B1 (hvac) track X; A2 (dental) tracks Y
  await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.update(client).set({ services: ['furnace_repair'] }).where(eq(client.id, IDS.clientB1));
});

async function event(over: Partial<typeof changeEvent.$inferInsert> = {}) {
  const [ev] = await dbs.service
    .insert(changeEvent)
    .values({
      competitorId: IDS.competitorX, changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up', dental: null },
      summary: 's', facts: diffFacts(extractNumericFacts('$100'), extractNumericFacts('$80')), confidence: 0.95, occurredAt: day(5), embedding: unit(0), ...over,
    })
    .returning({ id: changeEvent.id });
  return ev!.id;
}

describe('scoreEvent', () => {
  it('scores each tracking client separately, and keeps each agency to its own score', async () => {
    const id = await event();
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toEqual({ scored: 2, failed: 0, routes: { alert: 1, brief: 0, archive: 1 } });
    const rows = await dbs.owner.select().from(eventScore).orderBy(asc(eventScore.score));
    expect(rows.map((r) => [r.clientId, r.route, r.factors.serviceOverlap])).toEqual([[IDS.clientB1, 'archive', 0.2], [IDS.clientA1, 'alert', 1]]);
    expect(rows[0]?.packVersion).toBe((await loadVerticalPack('hvac_plumbing')).version);
    const seenByB = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select().from(eventScore));
    expect(seenByB.map((r) => r.clientId)).toEqual([IDS.clientB1]);
  });

  it('uses each client vertical\'s own service mapping', async () => {
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    await dbs.owner.update(client).set({ services: ['whitening'] }).where(eq(client.id, IDS.clientA2));
    const id = await event();
    await scoreEvent({ db: dbs.service, packs }, id);
    const [a2] = await dbs.owner.select().from(eventScore).where(eq(eventScore.clientId, IDS.clientA2));
    expect(a2?.factors.serviceOverlap).toBe(0.6); // dental mapping is null → unmapped
  });

  it('discounts an event that repeats an earlier one from the same competitor', async () => {
    await event({ occurredAt: day(1) });
    const id = await event({ occurredAt: day(5) });
    await scoreEvent({ db: dbs.service, packs }, id);
    const [a1] = await dbs.owner.select().from(eventScore).where(eq(eventScore.clientId, IDS.clientA1));
    expect(a1?.factors).toMatchObject({ maxSimilarity: 1, novelty: 0 });
    expect(a1?.route).toBe('archive');
  });

  it('does not archive a second, different price cut on the same block', async () => {
    await event({ occurredAt: day(1), facts: diffFacts(extractNumericFacts('$100'), extractNumericFacts('$80')) });
    const id = await event({ occurredAt: day(30), facts: diffFacts(extractNumericFacts('$80'), extractNumericFacts('$60')) });
    await scoreEvent({ db: dbs.service, packs }, id);
    const [a1] = await dbs.owner.select().from(eventScore).where(eq(eventScore.clientId, IDS.clientA1));
    expect(a1?.factors).toMatchObject({ maxSimilarity: null, novelty: 1 });
    expect(a1?.route).not.toBe('archive');
  });

  it('does not archive a second, different rating drop, but still discounts an identical repeat', async () => {
    const rating = (at: number, before: number, after: number) =>
      event({ occurredAt: day(at), changeType: 'rating_change', channels: ['google_business_profile'], services: {}, facts: [], summary: 'Google rating changed', details: { changeType: 'rating_change', ratingBefore: before, ratingAfter: after } });
    await rating(1, 4.6, 4.5);
    const second = await rating(8, 4.5, 4.4);
    await scoreEvent({ db: dbs.service, packs }, second);
    const factorsOf = async (id: string) => (await dbs.owner.select().from(eventScore).where(eq(eventScore.eventId, id))).find((r) => r.clientId === IDS.clientA1)?.factors;
    expect(await factorsOf(second)).toMatchObject({ maxSimilarity: null, novelty: 1 });
    const repeat = await rating(9, 4.5, 4.4);
    await scoreEvent({ db: dbs.service, packs }, repeat);
    expect(await factorsOf(repeat)).toMatchObject({ maxSimilarity: 1, novelty: 0 });
  });

  it('is idempotent, and scores a client that starts tracking the competitor later', async () => {
    const id = await event();
    await scoreEvent({ db: dbs.service, packs }, id);
    expect((await scoreEvent({ db: dbs.service, packs }, id)).scored).toBe(0);
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    expect((await scoreEvent({ db: dbs.service, packs }, id)).scored).toBe(1);
  });

  it('isolates a failing client: the others are still scored', async () => {
    const id = await event();
    const broken = createPackLoader(async (vid) => {
      if (vid === 'hvac_plumbing') return loadVerticalPack(vid);
      throw new Error('no pack');
    });
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    expect(await scoreEvent({ db: dbs.service, packs: broken }, id)).toMatchObject({ scored: 2, failed: 1 });
  });

  it('never scores a complaint-theme spike for a client whose vertical differs from details.verticalId', async () => {
    // A2 (dental) also tracks competitor X (e.g. a franchise competitor spanning HVAC + dental).
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    const id = await event({
      changeType: 'review_spike',
      services: {},
      facts: [],
      details: { changeType: 'review_spike', verticalId: 'hvac_plumbing', theme: 'price_transparency', themeName: 'Price transparency', count: 4, windowDays: 30, baselineMean: 0.5 },
    });
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toMatchObject({ scored: 2 }); // A1 and B1 (both hvac_plumbing), not A2 (dental)
    const clientIds = (await dbs.owner.select().from(eventScore).where(eq(eventScore.eventId, id))).map((r) => r.clientId).sort();
    expect(clientIds).toEqual([IDS.clientA1, IDS.clientB1].sort());
  });

  it('backs off a failing (event, client) pair and forgets the failure after a success', async () => {
    const id = await event();
    const broken = async (v: string) => {
      if (v === 'hvac_plumbing') throw new Error('pack unavailable');
      return loadVerticalPack(v);
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await scoreEvent({ db: dbs.service, packs: createPackLoader(broken) }, id)).toMatchObject({ scored: 0, failed: 2 });
    const failures = await dbs.owner.select().from(scoreFailure);
    expect(failures.map((f) => f.attempts)).toEqual([1, 1]);
    // Inside the backoff window neither the sweep nor scoreEvent retries the pair.
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(id);
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toMatchObject({ scored: 0, failed: 0 });
    // Once the window has passed it is retried, scored, and the failure row is gone.
    await dbs.owner.execute(sql`UPDATE score_failure SET failed_at = now() - interval '2 hours'`);
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).toContain(id);
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toMatchObject({ scored: 2, failed: 0 });
    expect(await dbs.owner.select().from(scoreFailure)).toEqual([]);
    err.mockRestore();
  });

  it('gives up on a pair after MAX_STAGE_ATTEMPTS failures', async () => {
    const id = await event();
    await dbs.service.insert(scoreFailure).values([
      { eventId: id, clientId: IDS.clientA1, agencyId: IDS.agencyA, attempts: MAX_STAGE_ATTEMPTS, failedAt: day(-30) },
      { eventId: id, clientId: IDS.clientB1, agencyId: IDS.agencyB, attempts: MAX_STAGE_ATTEMPTS, failedAt: day(-30) },
    ]);
    expect((await findEngineWork(dbs.service, { limit: 10 })).score).not.toContain(id);
  });
});

describe('prospects (5b-2 decision 9)', () => {
  it('never scores an event for a prospect and the sweep never offers it', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2)); // the only client tracking Y
    const [ev] = await dbs.service
      .insert(changeEvent)
      .values({ competitorId: IDS.competitorY, changeType: 'promo', channels: ['web'], summary: 'Bright Smiles started a promo', confidence: 0.9, occurredAt: new Date() })
      .returning();
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).not.toContain(ev!.id);
    expect((await scoreEvent({ db: dbs.service, packs }, ev!.id)).scored).toBe(0);
    expect(await dbs.owner.select().from(eventScore)).toEqual([]);
  });

  it('still scores a shared competitor for its active client, never for the prospect sharing it', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientB1)); // B1 and A1 both track X
    const id = await event({ occurredAt: new Date() });
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).toContain(id);
    expect((await scoreEvent({ db: dbs.service, packs }, id)).scored).toBe(1);
    expect((await dbs.owner.select({ c: eventScore.clientId }).from(eventScore)).map((r) => r.c)).toEqual([IDS.clientA1]);
    expect((await findEngineWork(dbs.service, { limit: 50 })).score).not.toContain(id); // B1 lacks a score but is never offered
  });
});

describe('tenant-private events and event age (Phase 3b)', () => {
  it('scores a tenant event only for its own client, never for another agency tracking the competitor', async () => {
    const id = await event({ changeType: 'rank_change', agencyId: IDS.agencyA, clientId: IDS.clientA1, facts: [], details: { avgRankBefore: 9, avgRankAfter: 3 } });
    expect(await scoreEvent({ db: dbs.service, packs }, id)).toMatchObject({ scored: 1 });
    expect((await dbs.owner.select().from(eventScore)).map((s) => s.clientId)).toEqual([IDS.clientA1]);
  });

  it('keeps novelty within the tenant scope: a global event ignores a tenant event with the same embedding', async () => {
    await event({ changeType: 'promo', agencyId: IDS.agencyA, clientId: IDS.clientA1, facts: [], occurredAt: day(1) });
    const id = await event({ changeType: 'promo', facts: [], occurredAt: day(5) });
    await scoreEvent({ db: dbs.service, packs }, id);
    const [b1] = await dbs.owner.select().from(eventScore).where(eq(eventScore.clientId, IDS.clientB1));
    expect(b1?.factors.maxSimilarity).toBeNull();
  });

  it('caps a backlog event to brief when it is scored long after it happened', async () => {
    const id = await event({ occurredAt: day(1) });
    await scoreEvent({ db: dbs.service, packs }, id, { now: day(20) });
    const [a1] = await dbs.owner.select().from(eventScore).where(eq(eventScore.clientId, IDS.clientA1));
    expect(a1).toMatchObject({ route: 'brief', factors: { staleCap: true } });
  });
});

describe('factsSignature', () => {
  const cut = (from: string, to: string) => diffFacts(extractNumericFacts(from), extractNumericFacts(to));

  it('is order-insensitive', () => {
    const a = [...cut('$100', '$80'), ...cut('AC tune-up for 10%', 'AC tune-up for 15%')];
    const b = [...cut('AC tune-up for 10%', 'AC tune-up for 15%'), ...cut('$100', '$80')];
    expect(factsSignature(a)).toBe(factsSignature(b));
  });

  it('distinguishes different after-values', () => {
    expect(factsSignature(cut('$100', '$80'))).not.toBe(factsSignature(cut('$100', '$60')));
  });
});

describe('detailsSignature', () => {
  it('fingerprints the numbers behind structured events, and is null for everything else', () => {
    expect(detailsSignature('rating_change', { ratingBefore: 4.6, ratingAfter: 4.5 })).toBe('rating|4.6|4.5');
    expect(detailsSignature('rank_change', { keyword: 'ac repair', avgRankBefore: 3.2, avgRankAfter: 7 })).toBe('rank|ac repair|3.2|7');
    expect(detailsSignature('review_spike', { count: 12, windowDays: 7, baselineMean: 2.5 })).toBe('reviews||12|7|2.5');
    expect(detailsSignature('review_spike', { theme: 'price_transparency', count: 4, windowDays: 30, baselineMean: 0.67 })).toBe('reviews|price_transparency|4|30|0.67');
    expect(detailsSignature('ad_started', { items: [{ id: 'B', label: 'b' }, { id: 'A', label: 'a' }] })).toBe('ad_started|A,B');
    expect(detailsSignature('hiring', { items: [{ id: 'J1', label: 'Tech' }] })).toBe('hiring|J1');
    expect(detailsSignature('price_change', {})).toBeNull();
  });
});
