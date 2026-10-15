import { createAccessContext } from '@cs/core';
import { brief, briefItem, capture, client, competitor, competitorSignal, evidence, notification, observation, playbookOverride, recommendation, review } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAi, noul } from '../../test/fake-ai';
import { addContact } from '../delivery/contacts';
import type { DeliveryConfig } from '../delivery/outbox';
import { createPackLoader } from '../tag/tag-stage';
import { deliverDueBriefs } from './deliver';
import { generateBrief } from './generate';
import { approveBrief } from './review';
import { Scorecard } from './scorecard';
import { BASELINE_BODY, BASELINE_HEADLINE, generateStartingPoint, SELF_WHY_IT_MATTERS } from './starting-point';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const delivery: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'b@agency.example' };
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am-1', role: 'account_manager', clientScope: 'all', features: [] });
// Thursday 2026-10-15 07:00 in Chicago.
const NOW = new Date('2026-10-15T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const ACTIVATED = ago(3);
const supportAll = (_s: unknown, qs: Record<string, unknown>) => ({ answers: Object.fromEntries(Object.keys(qs).map((k) => [k, noul(true)])), needsReview: [] });
const writer = () => JSON.stringify({ items: [{ ref: 'F1', why_it_matters: 'Fresh reviews help you show up first.' }, { ref: 'F2', why_it_matters: 'Rivals got 99 reviews.' }] });
const run = (ai = createFakeAi({ chat: writer, decide: supportAll }), now = NOW) => generateStartingPoint({ db: dbs.service, ai, packs, now: () => now }, IDS.clientA1);
let selfId: string;

async function evidenceFor(competitorId: string, source: string, capturedAt?: Date): Promise<{ captureId: string; evidenceId: string }> {
  const [c] = await dbs.owner.insert(capture).values({ competitorId, source, status: 'ok', collectorVersion: 't', ...(capturedAt ? { capturedAt } : {}) }).returning();
  const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind: 'vendor_json', objectKey: randomUUID(), sha256: 'x', bytes: 1, contentType: 'application/json' }).returning();
  return { captureId: c!.id, evidenceId: e!.id };
}
async function reviews(competitorId: string, n: number) {
  const { captureId } = await evidenceFor(competitorId, 'google_reviews');
  for (let i = 0; i < n; i++) await dbs.owner.insert(review).values({ competitorId, dedupeKey: randomUUID(), rating: 5, text: 't', postedAt: ago(5 + i), firstCaptureId: captureId });
}
/** The self profile is unclaimed (profile_gap) and the client got 1 review in 90 days against Smith HVAC's 6 (review_velocity_gap). */
async function seedFindings() {
  const gbp = await evidenceFor(selfId, 'google_business_profile');
  await dbs.owner.insert(observation).values({
    competitorId: selfId, captureId: gbp.captureId, kind: 'gbp_profile', key: 'profile',
    data: { rating: 4.5, isClaimed: false, category: 'HVAC contractor', additionalCategories: ['Plumber'], workHours: { work_hours: { timetable: { monday: [] } } } },
  });
  await reviews(selfId, 1);
  await reviews(IDS.competitorX, 6);
  return gbp;
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [s] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC', placeId: 'PSELF' }).returning({ id: competitor.id });
  selfId = s!.id;
  await dbs.owner.update(client).set({ selfCompetitorId: selfId, activatedAt: ACTIVATED }).where(eq(client.id, IDS.clientA1));
  await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example', name: 'Pat Lee' });
  await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
});

const items = () => dbs.owner.select().from(briefItem).orderBy(asc(briefItem.ord));

describe('generateStartingPoint', () => {
  it('generates items + scorecard', async () => {
    const gbp = await seedFindings();
    await dbs.owner.insert(playbookOverride).values({ agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', playbookId: 'ask_for_reviews', title: 'Get more Google reviews', updatedBy: 'am-1' });
    const ai = createFakeAi({ chat: writer, decide: supportAll });
    const r = await run(ai);
    expect(r).toMatchObject({ status: 'ready', kind: 'starting_point', items: 2, dropped: { items: 0, sentences: 1 } });
    const [b] = await dbs.owner.select().from(brief);
    expect(b).toMatchObject({ status: 'ready', kind: 'starting_point', deliveryDate: '2026-10-15', attempts: 1, trend: null });
    expect(b!.summary).toBe('Where A1 HVAC stands against the 1 rival we now watch. Weekly briefs from here show what changes.');
    expect(b!.periodStart.toISOString()).toBe(ACTIVATED.toISOString());
    expect(b!.periodEnd.toISOString()).toBe(NOW.toISOString());
    const sc = Scorecard.parse(b!.scorecard);
    expect(sc.rows.map((x) => x.name)).toEqual(['A1 HVAC', 'Smith HVAC']);
    expect(sc.evidenceIds).toContain(gbp.evidenceId);

    const [velocity, profile] = await items();
    expect(velocity).toMatchObject({
      subject: 'self', competitorId: null, headline: 'Get more Google reviews', whatChanged: 'You got 1 new reviews in 90 days; Smith HVAC got 6.',
      whyItMatters: 'Fresh reviews help you show up first.', confidence: 1, effort: 'L', impact: 'H', eventIds: [], moveId: null, upsellTag: null, playbookId: 'ask_for_reviews',
      recommendedAction: 'Text every customer a Google review link right after the job is done, and aim for a few new reviews each week.',
    });
    expect(velocity!.evidenceIds.length).toBeGreaterThan(0);
    // The model's sentence states a number the evidence lacks: the verifier drops it and the deterministic text stands in.
    expect(profile).toMatchObject({ subject: 'self', headline: 'Complete your Google profile', whatChanged: 'Your Google profile is missing: ownership claim.', whyItMatters: SELF_WHY_IT_MATTERS.profile_gap, playbookId: 'complete_profile' });
    expect(profile!.evidenceIds).toContain(gbp.evidenceId);
    // Writer input went through redaction and names only the facts.
    expect(ai.calls.chat).toHaveLength(1);
    expect(ai.calls.chat[0]!.task).toBe('brief_writer');
    expect(ai.calls.chat[0]!.content).toContain('You got 1 new reviews in 90 days; Smith HVAC got 6.');
  });

  it('keeps deterministic text when the writer fails', async () => {
    await seedFindings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ai = createFakeAi({ chat: () => 'not json', decide: supportAll });
    expect(await run(ai)).toMatchObject({ status: 'ready', items: 2 });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/writer pass skipped/));
    warn.mockRestore();
    expect((await items()).map((i) => i.whyItMatters)).toEqual([SELF_WHY_IT_MATTERS.review_velocity_gap, SELF_WHY_IT_MATTERS.profile_gap]);
  });

  it('counts dropped sentences only when the whole writer pass completes', async () => {
    await seedFindings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = () => JSON.stringify({ items: [{ ref: 'F1', why_it_matters: 'Rivals got 99 reviews.' }, { ref: 'F2', why_it_matters: 'A complete profile gets you found.' }] });
    const ai = createFakeAi({ chat: w, decide: () => { throw new Error('verifier down'); } });
    expect(await run(ai)).toMatchObject({ status: 'ready', items: 2, dropped: { items: 0, sentences: 0 } });
    warn.mockRestore();
  });

  it('rival_only_advertiser cites the latest ad captures of you and the advertiser, not GBP or review evidence', async () => {
    const gbp = await seedFindings();
    await evidenceFor(selfId, 'google_ads', ago(2)); // an older self check: only the latest one is cited
    const selfAds = await evidenceFor(selfId, 'google_ads');
    const rivalAds = await evidenceFor(IDS.competitorX, 'google_ads');
    await dbs.owner.insert(competitorSignal).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, tier: 'top', signals: { googleAdsActive: 2 } });
    expect(await run(createFakeAi({ chat: () => 'not json', decide: supportAll }))).toMatchObject({ status: 'ready' });
    const ads = (await items()).find((i) => i.playbookId === 'consider_search_ads')!;
    expect(ads.whatChanged).toBe('Smith HVAC run ads; you run none.');
    expect(ads.evidenceIds.sort()).toEqual([selfAds.evidenceId, rivalAds.evidenceId].sort());
    expect(ads.evidenceIds).not.toContain(gbp.evidenceId);
  });

  it('fallback item when no rule fires', async () => {
    const ai = createFakeAi({ chat: writer, decide: supportAll });
    expect(await run(ai)).toMatchObject({ status: 'ready', kind: 'starting_point', items: 1 });
    expect(ai.calls.chat).toHaveLength(0);
    const [i, ...rest] = await items();
    expect(rest).toHaveLength(0);
    expect(i).toMatchObject({ subject: 'self', competitorId: null, headline: BASELINE_HEADLINE, whatChanged: BASELINE_BODY, whyItMatters: '', recommendedAction: '', effort: 'L', impact: 'L', playbookId: null, eventIds: [] });
    expect(BASELINE_HEADLINE).toBe('Your baseline is set');
    expect(BASELINE_BODY).toBe('We now track your profile, reviews and map rankings. Weekly briefs will show what changes.');
  });

  it('second run is a no-op', async () => {
    await run();
    expect(await run(undefined, new Date(NOW.getTime() + 86_400_000))).toEqual({ status: 'skipped', reason: expect.stringMatching(/already/) });
    expect(await dbs.owner.select().from(brief)).toHaveLength(1);
  });

  it('retries a failed starting point on its own row, up to three attempts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Break generation: the pack loader throws.
    const broken = () => generateStartingPoint({ db: dbs.service, ai: createFakeAi({ decide: supportAll }), packs: async () => { throw new Error('pack down'); }, now: () => NOW }, IDS.clientA1);
    expect(await broken()).toMatchObject({ status: 'failed', error: expect.stringMatching(/pack down/) });
    await broken();
    await broken();
    expect(await broken()).toEqual({ status: 'skipped', reason: expect.stringMatching(/attempts/) });
    expect(await dbs.owner.select({ status: brief.status, attempts: brief.attempts }).from(brief)).toEqual([{ status: 'failed', attempts: 3 }]);
    warn.mockRestore();
  });

  it('skips prospects', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect(await run()).toMatchObject({ status: 'skipped' });
  });

  it('weekly brief on same date skipped', async () => {
    // Monday 2026-10-19 10:00 Chicago: the starting point takes that date; Thursday 2026-10-15 22:30's weekly brief is for the same Monday.
    expect(await run(undefined, new Date('2026-10-19T15:00:00Z'))).toMatchObject({ status: 'ready' });
    const weekly = () => generateBrief({ db: dbs.service, ai: createFakeAi({ decide: supportAll }), packs }, IDS.clientA1, { now: new Date('2026-10-16T03:30:00Z') });
    expect(await weekly()).toMatchObject({ status: 'skipped' });
    // A failed starting point is never reclaimed by the weekly run.
    await dbs.owner.update(brief).set({ status: 'failed', attempts: 1 });
    expect(await weekly()).toMatchObject({ status: 'skipped' });
    expect(await dbs.owner.select({ kind: brief.kind, status: brief.status }).from(brief)).toEqual([{ kind: 'starting_point', status: 'failed' }]);
  });

  it('previous-period query ignores starting point', async () => {
    await run();
    // Next weekly brief (Thursday 2026-10-22 22:30 Chicago): its period is the default first week, not "since the starting point".
    const thu = new Date('2026-10-23T03:30:00Z');
    expect(await generateBrief({ db: dbs.service, ai: createFakeAi({ decide: supportAll }), packs }, IDS.clientA1, { now: thu })).toMatchObject({ status: 'ready', kind: 'quiet' });
    const [weekly] = await dbs.owner.select().from(brief).where(eq(brief.kind, 'quiet'));
    expect(weekly!.periodStart.toISOString()).toBe(new Date(thu.getTime() - 7 * 86_400_000).toISOString());
  });
});

describe('starting point approval', () => {
  it('approval sends immediately', async () => {
    await seedFindings();
    const r = await run();
    if (r.status !== 'ready') throw new Error('not ready');
    expect(await approveBrief({ service: dbs.service, app: dbs.app, packs, delivery }, am, r.briefId)).toEqual({ recommendations: 2 });
    const [b] = await dbs.owner.select().from(brief);
    expect(b).toMatchObject({ status: 'sent', kind: 'starting_point' });
    expect(b!.summary).toMatch(/^Where A1 HVAC stands/);
    const sent = await dbs.owner.select().from(notification).where(eq(notification.kind, 'brief'));
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((n) => n.title === 'Your starting point with Agency A')).toBe(true);
    expect((await dbs.owner.select().from(recommendation)).every((x) => x.source === 'brief')).toBe(true);
  });

  it('the baseline item becomes no recommendation, and deliverDueBriefs leaves starting points alone', async () => {
    const r = await run();
    if (r.status !== 'ready') throw new Error('not ready');
    // Without delivery configured, approval only approves.
    expect(await approveBrief({ service: dbs.service, app: dbs.app, packs }, am, r.briefId)).toEqual({ recommendations: 0 });
    expect(await dbs.owner.select().from(recommendation)).toHaveLength(0);
    expect((await deliverDueBriefs({ db: dbs.service, delivery }, new Date('2026-10-19T15:00:00Z'))).sent).toEqual([]);
    expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ status: 'approved', kind: 'starting_point' });
  });
});
