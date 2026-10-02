import { changeEvent, client, decisionReview, detectedChange, eventChange, rankScan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, structuredResult } from '../../test/fake-ai';
import { day, seedVendorCapture } from '../../test/seed';
import { serviceForKeyword } from './structured';
import { createPackLoader, tagChange } from './tag-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'meta_ads', capturedAt: day(7) });
});

async function change(over: Partial<typeof detectedChange.$inferInsert>) {
  const [row] = await dbs.service
    .insert(detectedChange)
    .values({ competitorId: IDS.competitorX, source: 'meta_ads', kind: 'added', beforeCaptureId: cap0, afterCaptureId: cap1, blockKey: 'ads:meta:started', stageVersion: 1, ...over })
    .returning({ id: detectedChange.id });
  return row!.id;
}

describe('tagStructuredChange (via tagChange)', () => {
  it('turns started ads into an ad_started event with service mapping, offer and money facts', async () => {
    const id = await change({
      afterText: 'AC tune-up only $79 this week, call 972-555-0100\nSpring AC check',
      details: { changeType: 'ad_started', count: 2, pageId: '99', items: [{ id: 'A1', label: 'AC tune-up only $79 this week, call 972-555-0100' }, { id: 'A2', label: 'Spring AC check' }] },
    });
    const ai = createFakeAi({ decide: structuredResult({ services: { hvac_plumbing: 'ac_tune_up' }, offer: false }) });
    const r = await tagChange({ db: dbs.service, ai, packs }, id);
    expect(r).toMatchObject({ ran: true, result: { merged: false } });
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'ad_started', channels: ['meta_ads'], services: { hvac_plumbing: 'ac_tune_up' }, occurredAt: day(7), agencyId: null, clientId: null });
    expect(ev?.details).toMatchObject({ count: 2, pageId: '99', offer: true }); // a money fact forces offer even though the model said no
    expect(ev?.facts.map((f) => f.after?.raw)).toEqual(['$79']);
    expect(ev?.summary).toMatch(/^2 new Meta ads: "AC tune-up only \$79 this week, call \[phone\]/);
    expect(ev?.embedding).toHaveLength(512);
    expect(Object.keys(ai.calls.decide[0]!.questions).sort()).toEqual(['offer', 'service_hvac_plumbing']);
    expect(JSON.stringify(ai.calls.decide[0]!.state)).not.toContain('972-555-0100');
    expect(await dbs.owner.select().from(eventChange)).toEqual([{ eventId: ev!.id, changeId: id }]);
    expect((await dbs.owner.select().from(detectedChange))[0]?.status).toBe('event');
  });

  it('builds a review spike event without any model decision', async () => {
    const id = await change({
      source: 'google_reviews', kind: 'modified', blockKey: 'reviews:velocity', afterText: '8 reviews in 7 days',
      details: { changeType: 'review_spike', count: 8, windowDays: 7, baselineMean: 1, z: 7, avgRating: 1.4 },
    });
    const ai = createFakeAi(); // decide() throws if called
    await tagChange({ db: dbs.service, ai, packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'review_spike', channels: ['google_reviews'], confidence: 1, needsReview: false, services: { hvac_plumbing: null } });
    expect(ev?.summary).toBe('8 new Google reviews in 7 days (7σ above the usual 1/week), average rating 1.4');
    expect(ai.calls.decide).toHaveLength(0);
  });

  it('keeps a rank event private to its client and maps the keyword to a service from the pack', async () => {
    const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', finishedAt: day(9) }).returning({ id: rankScan.id });
    const id = await change({
      source: 'rank', kind: 'modified', afterCaptureId: null, beforeCaptureId: null, rankScanId: scan!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, blockKey: 'rank:air conditioning repair',
      details: { changeType: 'rank_change', keyword: 'air conditioning repair', avgRankBefore: 9, avgRankAfter: 3, top3Before: 0, top3After: 0.5, points: 4 },
    });
    await tagChange({ db: dbs.service, ai: createFakeAi(), packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'rank_change', agencyId: IDS.agencyA, clientId: IDS.clientA1, channels: ['rank'], services: { hvac_plumbing: 'ac_repair' }, occurredAt: day(9) });
    expect(ev?.summary).toBe('"air conditioning repair": average map position 9 → 3, top-3 share 0% → 50%');
  });

  it('sends low-confidence service answers to the review queue and marks the event', async () => {
    const id = await change({ source: 'google_jobs', blockKey: 'jobs:new', afterText: 'HVAC Technician — Plano, TX 75023', details: { changeType: 'hiring', count: 1, items: [{ id: 'j1', label: 'HVAC Technician — Plano, TX 75023' }] } });
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: structuredResult({ confidence: 0.4, needsReview: ['service_hvac_plumbing'] }) }), packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'hiring', needsReview: true, zips: ['75023'] });
    expect(ev?.summary).toBe('1 new job posting: HVAC Technician — Plano, TX 75023');
    expect(await dbs.owner.select().from(decisionReview)).toMatchObject([{ subjectId: id, keys: ['service_hvac_plumbing'] }]);
  });

  it('asks a global change the service question of every vertical tracking the competitor', async () => {
    await dbs.owner.update(client).set({ verticalId: 'dental' }).where(eq(client.id, IDS.clientB1)); // a second vertical tracks X
    const id = await change({ source: 'google_business_profile', kind: 'added', blockKey: 'gbp:service:emergency plumbing', afterText: 'Emergency plumbing', details: { changeType: 'new_service', field: 'service' } });
    const ai = createFakeAi({ decide: structuredResult({ services: { hvac_plumbing: 'emergency_service' } }) });
    await tagChange({ db: dbs.service, ai, packs }, id);
    expect(Object.keys(ai.calls.decide[0]!.questions).sort()).toEqual(['service_dental', 'service_hvac_plumbing']); // global change: every tracking vertical
    expect((await dbs.owner.select().from(changeEvent))[0]?.summary).toBe('Google Business Profile service added: "Emergency plumbing"');
  });
});

describe('serviceForKeyword', () => {
  it('matches service names and aliases as whole words, longest first', async () => {
    const hvac = await loadVerticalPack('hvac_plumbing');
    expect(serviceForKeyword('AC Repair near me', hvac)).toBe('ac_repair');
    expect(serviceForKeyword('tankless water heater install', hvac)).toBe('water_heater');
    expect(serviceForKeyword('best plumber', hvac)).toBeNull();
  });
});
