import { alert, alertEvent, brief, briefItem, changeEvent, client, eventScore, type ScoreFactors } from '@cs/db';
import { IDS, openTestDbs, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { sweepAlerts } from '../alerts/create';
import { createPackLoader } from '../tag/tag-stage';
import { rescoreRecent, type RescoreOptions } from './rescore';

const generic = () => loadVerticalPack('generic');
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const NOW = day(6);
const deps = () => ({ db: dbs.service, packs, generic });
const run = (over: Partial<RescoreOptions> = {}) => rescoreRecent(deps(), { sinceDays: 14, dryRun: false, now: NOW, ...over });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner); // A1 (hvac) and B1 (hvac) track X
  await dbs.owner.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.update(client).set({ services: ['furnace_repair'] }).where(eq(client.id, IDS.clientB1));
});

/** A GBP rating change (whole-business type, no service): v3 scored it with `unmapped` 0.6, v4 with `whole_business` 1.0. */
async function ratingEvent(delta: number, over: Partial<typeof changeEvent.$inferInsert> = {}) {
  const [ev] = await dbs.service
    .insert(changeEvent)
    .values({
      competitorId: IDS.competitorX, changeType: 'rating_change', channels: ['google_business_profile'], services: {}, facts: [], summary: 'Google rating changed',
      details: { changeType: 'rating_change', ratingBefore: 4.6, ratingAfter: Math.round((4.6 - delta) * 100) / 100 }, confidence: 0.95, occurredAt: day(4), ...over,
    })
    .returning({ id: changeEvent.id });
  return ev!.id;
}

const OLD_FACTORS: ScoreFactors = {
  typeWeight: 0.7, size: 0.667, serviceOverlap: 0.6, territoryOverlap: 1, relevance: 0.6, novelty: 1, maxSimilarity: null, needsReviewCap: false,
  thresholds: { alert: 70, brief: 40 }, scoringVersion: 3,
};

async function scored(eventId: string, over: { clientId?: string; route?: string; score?: number; scoredAt?: Date; factors?: Partial<ScoreFactors> } = {}) {
  const clientId = over.clientId ?? IDS.clientA1;
  await dbs.service.insert(eventScore).values({
    agencyId: clientId === IDS.clientB1 ? IDS.agencyB : IDS.agencyA, clientId, eventId, score: over.score ?? 28, route: over.route ?? 'archive',
    factors: { ...OLD_FACTORS, ...over.factors }, packVersion: 1, scoredAt: over.scoredAt ?? day(5),
  });
}

const rowOf = async (eventId: string, clientId: string = IDS.clientA1) =>
  (await dbs.owner.select().from(eventScore).where(and(eq(eventScore.eventId, eventId), eq(eventScore.clientId, clientId))))[0]!;

async function feature(eventId: string, status: string) {
  const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-09-28', periodStart: day(-7), periodEnd: day(0), status }).returning({ id: brief.id });
  await dbs.service.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord: 0, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'M', impact: 'M', eventIds: [eventId] });
}

describe('rescoreRecent', () => {
  it('archive vendor event re-scored to brief and scored_at moves to now', async () => {
    const id = await ratingEvent(0.2);
    await scored(id);
    const r = await run();
    expect(r).toMatchObject({ considered: 1, rescored: 1, capped: 0, skipped: { featured: 0, alerted: 0, current: 0 }, transitions: { 'archive->brief': 1 } });
    const row = await rowOf(id);
    expect(row.route).toBe('brief');
    expect(row.score).toBeCloseTo(46.7, 1);
    expect(row.scoredAt.getTime()).toBe(NOW.getTime());
    expect(row.packVersion).toBe((await loadVerticalPack('hvac_plumbing')).version);
    expect(row.factors).toMatchObject({ wholeBusiness: true, serviceOverlap: 1, scoringVersion: 10, rescored: { at: NOW.toISOString(), score: 28, route: 'archive', scoringVersion: 3 } });
    expect(row.factors.rescoreCap).toBeUndefined();
  });

  it('brief stays brief and keeps scored_at', async () => {
    const id = await ratingEvent(0.2);
    await scored(id, { route: 'brief', score: 41 });
    const r = await run();
    expect(r.transitions).toEqual({ 'brief->brief': 1 });
    const row = await rowOf(id);
    expect(row.route).toBe('brief');
    expect(row.scoredAt.getTime()).toBe(day(5).getTime());
  });

  it('featured pair is skipped and unchanged', async () => {
    const id = await ratingEvent(0.2);
    await scored(id);
    await feature(id, 'sent');
    const r = await run();
    expect(r).toMatchObject({ considered: 1, rescored: 0, skipped: { featured: 1, alerted: 0, current: 0 }, transitions: {} });
    expect((await rowOf(id)).route).toBe('archive');
  });

  it('a pair featured after selection is not updated', async () => {
    const id = await ratingEvent(0.2);
    await scored(id);
    // The pack loader runs between the selection read and the guarded UPDATE: feature the pair there.
    let featuredNow = false;
    const racing: typeof packs = async (verticalId) => {
      if (!featuredNow) { featuredNow = true; await feature(id, 'ready'); }
      return packs(verticalId);
    };
    const r = await rescoreRecent({ db: dbs.service, packs: racing, generic }, { sinceDays: 14, dryRun: false, now: NOW });
    expect(r).toMatchObject({ considered: 1, rescored: 0, transitions: {} });
    const row = await rowOf(id);
    expect(row.route).toBe('archive');
    expect(row.factors.scoringVersion).toBe(3);
  });

  it('failed-brief item does not count as featured', async () => {
    const id = await ratingEvent(0.2);
    await scored(id);
    await feature(id, 'failed');
    const r = await run();
    expect(r).toMatchObject({ rescored: 1, skipped: { featured: 0, alerted: 0, current: 0 } });
  });

  it('old alert route or alert_event pair skipped', async () => {
    const a = await ratingEvent(0.3);
    await scored(a, { route: 'alert', score: 75 });
    const b = await ratingEvent(0.2, { occurredAt: day(3) });
    await scored(b, { route: 'brief', score: 41 });
    const [al] = await dbs.service.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: a, score: 75, status: 'delivered', mode: 'direct' }).returning({ id: alert.id });
    await dbs.service.insert(alertEvent).values({ alertId: al!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, eventId: b });
    const r = await run();
    expect(r).toMatchObject({ considered: 2, rescored: 0, skipped: { featured: 0, alerted: 2, current: 0 } });
    expect((await rowOf(a)).factors.scoringVersion).toBe(3);
    expect((await rowOf(b)).factors.scoringVersion).toBe(3);
  });

  it('a re-score that reaches 70 is stored brief with rescoreCap', async () => {
    const id = await ratingEvent(0.3);
    await scored(id, { score: 42, route: 'brief' });
    const r = await run();
    expect(r).toMatchObject({ rescored: 1, capped: 1, transitions: { 'brief->brief': 1 } });
    const row = await rowOf(id);
    expect(row.score).toBe(70);
    expect(row.route).toBe('brief');
    expect(row.factors.rescoreCap).toBe(true);
  });

  it('no alert row exists after a sweepAlerts run following rescore', async () => {
    const id = await ratingEvent(0.3);
    await scored(id, { score: 42, route: 'archive' });
    await run();
    expect((await rowOf(id)).route).toBe('brief');
    const sweep = await sweepAlerts(dbs.service, NOW);
    expect(sweep.created).toBe(0);
    expect(await dbs.owner.select().from(alert)).toEqual([]);
  });

  it('second run: all current, nothing updated', async () => {
    const a = await ratingEvent(0.2);
    await scored(a);
    const b = await ratingEvent(0.3, { occurredAt: day(3) });
    await scored(b, { route: 'brief', score: 42 });
    expect((await run()).rescored).toBe(2);
    const before = await dbs.owner.select().from(eventScore);
    const r = await run({ now: new Date(NOW.getTime() + 3_600_000) });
    expect(r).toMatchObject({ considered: 2, rescored: 0, capped: 0, skipped: { featured: 0, alerted: 0, current: 2 }, transitions: {} });
    expect(await dbs.owner.select().from(eventScore)).toEqual(before);
  });

  it('dryRun writes nothing but reports the same transitions', async () => {
    const a = await ratingEvent(0.2);
    await scored(a);
    const b = await ratingEvent(0.3, { occurredAt: day(3) });
    await scored(b, { route: 'brief', score: 42 });
    const before = await dbs.owner.select().from(eventScore);
    const dry = await run({ dryRun: true });
    expect(await dbs.owner.select().from(eventScore)).toEqual(before);
    const real = await run();
    expect(dry).toEqual(real);
    expect(real).toMatchObject({ rescored: 2, capped: 1, transitions: { 'archive->brief': 1, 'brief->brief': 1 } });
  });

  it('retracted event, paused client, tier_change and out-of-window rows are not considered', async () => {
    await scored(await ratingEvent(0.2, { retractedAt: day(5) }));
    await scored(await ratingEvent(0.2, { changeType: 'tier_change', details: { changeType: 'tier_change', from: 'minor', to: 'top' } }));
    await scored(await ratingEvent(0.2), { scoredAt: day(-10) });
    const paused = await ratingEvent(0.2);
    await scored(paused, { clientId: IDS.clientB1 });
    await pauseClient(dbs.owner, IDS.clientB1);
    expect(await run()).toMatchObject({ considered: 0, rescored: 0 });
  });

  it('--client limits to one client', async () => {
    const id = await ratingEvent(0.2);
    await scored(id);
    await scored(id, { clientId: IDS.clientB1 });
    const r = await run({ clientId: IDS.clientB1 });
    expect(r).toMatchObject({ considered: 1, rescored: 1 });
    expect((await rowOf(id, IDS.clientB1)).factors.scoringVersion).toBe(10);
    expect((await rowOf(id, IDS.clientA1)).factors.scoringVersion).toBe(3);
  });
  it('a citation event keeps archive (C8)', async () => {
    const id = await ratingEvent(0.2, { changeType: 'citation_added', channels: ['directories'], details: { changeType: 'citation_added', directory: 'bbb.org', label: 'Better Business Bureau' } });
    await scored(id, { score: 10 });
    await run();
    const row = await rowOf(id);
    expect(row.route).toBe('archive');
    expect(row.factors.citationMinor).toBe(true);
  });
});
