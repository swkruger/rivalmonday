import { changeEvent, client, decisionReview, detectedChange, eventChange, rankScan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, structuredResult } from '../../test/fake-ai';
import { day, seedVendorCapture } from '../../test/seed';
import { buildStructuredSummary, isMappedPost, isStructuredChange, serviceForKeyword } from './structured';
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
    expect(ai.calls.decide.map((c) => c.task)).toEqual(['structured_decisions']);
  });

  it('writes nothing when a newer diff supersedes the change while the model is deciding', async () => {
    const id = await change({ afterText: 'Spring AC check', details: { changeType: 'ad_started', count: 1, items: [{ id: 'A1', label: 'Spring AC check' }] } });
    const decide = structuredResult({ services: { hvac_plumbing: 'ac_tune_up' }, confidence: 0.4, needsReview: ['service_hvac_plumbing'] });
    const ai = createFakeAi({
      decide: async (state, questions) => {
        await dbs.service.update(detectedChange).set({ status: 'superseded' }).where(eq(detectedChange.id, id));
        return decide(state, questions);
      },
    });
    expect(await tagChange({ db: dbs.service, ai, packs }, id)).toMatchObject({ ran: true, result: { eventId: null, merged: false } });
    expect(await dbs.owner.select().from(changeEvent)).toEqual([]);
    expect(await dbs.owner.select().from(decisionReview)).toEqual([]);
    expect((await dbs.owner.select().from(detectedChange))[0]?.status).toBe('superseded');
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

  it('builds the structured decision state and summary through the NER pass', async () => {
    const id = await change({
      afterText: 'Ask for Carlos Ramirez — AC tune-up $79',
      details: { changeType: 'ad_started', count: 1, items: [{ id: 'A1', label: 'Ask for Carlos Ramirez — AC tune-up $79' }] },
    });
    const ai = createFakeAi({ decide: structuredResult({ services: { hvac_plumbing: 'ac_tune_up' } }) });
    await tagChange({ db: dbs.service, ai, packs }, id);
    expect(JSON.stringify(ai.calls.decide[0]!.state)).not.toContain('Carlos');
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev?.summary).toContain('[name]');
    expect(ev?.summary).not.toContain('Carlos');
  });

  it('keeps a GBP title rename intact in the summary: the new (and old) name is never mistaken for a person', async () => {
    const id = await change({
      source: 'google_business_profile', kind: 'modified', blockKey: 'gbp:title',
      beforeText: 'title: Smith HVAC', afterText: 'title: Smith Heating & Air',
      details: { changeType: 'content', field: 'title' },
    });
    await tagChange({ db: dbs.service, ai: createFakeAi(), packs }, id); // 'content' isn't service-mapped: decide() is never called
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev?.summary).toBe('Google Business Profile title changed: Smith HVAC → Smith Heating & Air');
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

describe('buildStructuredSummary', () => {
  it('reads Google posts per the spec copy', () => {
    const base = { source: 'google_business_profile', beforeText: null };
    expect(buildStructuredSummary({ ...base, afterText: 'Spring tune-up $79', details: { changeType: 'promo', field: 'post', postId: 'p', offer: true } })).toBe('Posted an offer on Google: "Spring tune-up $79"');
    expect(buildStructuredSummary({ ...base, afterText: "We're hiring!", details: { changeType: 'content', field: 'post', postId: 'p', offer: false } })).toBe('Posted on Google: "We\'re hiring!"');
    expect(buildStructuredSummary({ ...base, afterText: null, details: { changeType: 'content', field: 'post', count: 2 } })).toBe('Posted 2 more updates on Google');
    expect(buildStructuredSummary({ ...base, afterText: 'x'.repeat(100), details: { changeType: 'content', field: 'post', postId: 'p' } })).toBe(`Posted on Google: "${'x'.repeat(79)}…"`);
  });
  it('service-maps a single post like an ad, but not the aggregate or a web promo', () => {
    expect(isMappedPost('promo', { field: 'post', postId: 'p' })).toBe(true);
    expect(isMappedPost('content', { field: 'post', postId: 'p' })).toBe(true);
    expect(isMappedPost('content', { field: 'post', count: 2 })).toBe(false);
    expect(isMappedPost('promo', {})).toBe(false);
  });
  it('does not repeat the GBP field label stored in the before/after text', () => {
    expect(
      buildStructuredSummary(
        { source: 'google_business_profile', beforeText: 'title: Smith HVAC', afterText: 'title: Smith Heating & Air', details: { changeType: 'content', field: 'title' } },
        ['Smith HVAC', 'Smith Heating & Air'],
      ),
    ).toBe('Google Business Profile title changed: Smith HVAC → Smith Heating & Air');
    expect(buildStructuredSummary({ source: 'google_business_profile', beforeText: 'Mon 8-5', afterText: 'Mon 7-6', details: { changeType: 'content', field: 'hours' } }))
      .toBe('Google Business Profile hours changed: Mon 8-5 → Mon 7-6');
  });
  it('renders an audience_growth as a plain sentence with grouped numbers', () => {
    expect(buildStructuredSummary({ source: 'meta_ads', beforeText: 'Facebook Page likes: 1000', afterText: 'Facebook Page likes: 1220', details: { changeType: 'audience_growth', pageId: '1', likesBefore: 1000, likesAfter: 1220, pct: 22, days: 28 } }))
      .toBe('Facebook Page likes grew 22% (1,000 → 1,220) in 28 days');
  });
  it('renders a status_change in reader words, never the raw vendor value', () => {
    const closed = buildStructuredSummary({ source: 'google_business_profile', beforeText: 'status: open', afterText: 'status: closed_forever', details: { changeType: 'status_change', field: 'status', direction: 'closed', statusBefore: 'open', statusAfter: 'closed_forever' } });
    expect(closed).toBe('Google Business Profile marked permanently closed');
    expect(closed).not.toContain('closed_forever');
    const reopened = buildStructuredSummary({ source: 'google_business_profile', beforeText: 'status: temporarily_closed', afterText: 'status: open', details: { changeType: 'status_change', field: 'status', direction: 'reopened', statusBefore: 'temporarily_closed', statusAfter: 'open' } });
    expect(reopened).toBe('Google Business Profile reopened (was temporarily closed)');
  });
  it('reads an upper-case status in reader words', () => {
    expect(buildStructuredSummary({ source: 'google_business_profile', beforeText: 'status: open', afterText: 'status: CLOSED_FOREVER', details: { changeType: 'status_change', field: 'status', direction: 'closed', statusBefore: 'open', statusAfter: 'CLOSED_FOREVER' } }))
      .toBe('Google Business Profile marked permanently closed');
  });
  it('renders a profile_change for hours as a plain sentence', () => {
    expect(buildStructuredSummary({ source: 'google_business_profile', beforeText: 'hours: monday 08:00–17:00', afterText: 'hours: monday 09:00–17:00', details: { changeType: 'profile_change', field: 'hours' } }))
      .toBe('Changed its hours on Google: monday 08:00–17:00 → monday 09:00–17:00');
  });
});

describe('web-channel structured changes (18a-2)', () => {
  it('isStructuredChange: a web text diff is not structured, a stamped web change and every vendor change are', () => {
    expect(isStructuredChange({ source: 'web', details: {} })).toBe(false);
    expect(isStructuredChange({ source: 'web', details: { offer: true } as never })).toBe(false);
    expect(isStructuredChange({ source: 'web', details: { changeType: 'site_feature' } })).toBe(true);
    expect(isStructuredChange({ source: 'meta_ads', details: {} })).toBe(true);
  });
  it('site_feature summaries use the category label and never the vendor', () => {
    const added = buildStructuredSummary({ source: 'web', beforeText: null, afterText: null, details: { changeType: 'site_feature', category: 'online_booking', vendor: 'ServiceTitan', direction: 'added' } });
    expect(added).toBe('Added online booking to its website');
    expect(buildStructuredSummary({ source: 'web', beforeText: null, afterText: null, details: { changeType: 'site_feature', category: 'live_chat', vendor: 'Intercom', direction: 'removed' } })).toBe('Removed live chat from its website');
    expect(added).not.toMatch(/ServiceTitan/);
  });
  it('new_page summary quotes the first item label (h1/title), else the path, and never afterText', () => {
    const multi = ['/furnace-repair', 'Furnace Repair', 'We fix furnaces fast.', 'Our process'].join(String.fromCharCode(10));
    expect(buildStructuredSummary({ source: 'web', beforeText: null, afterText: multi, details: { changeType: 'new_page', pageUrl: 'https://x.test/furnace-repair', items: [{ id: 'h1', label: 'Furnace Repair' }] } })).toBe('Added a new page to its website: "Furnace Repair"');
    const noLabel = buildStructuredSummary({ source: 'web', beforeText: null, afterText: multi, details: { changeType: 'new_page', pageUrl: 'https://x.test/furnace-repair' } });
    expect(noLabel).toBe('Added a new page to its website: "/furnace-repair"');
    expect(noLabel).not.toContain('We fix furnaces');
  });
  it('site_feature with an unknown category falls back to a generic label', () => {
    expect(buildStructuredSummary({ source: 'web', beforeText: null, afterText: null, details: { changeType: 'site_feature', category: 'nonsense', direction: 'added' } })).toBe('Added a tool to its website');
  });
  it('tags a site_feature web change on the structured path with no vendor in the event', async () => {
    const capW = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'web', capturedAt: day(7) });
    const id = await change({ source: 'web', beforeCaptureId: null, afterCaptureId: capW, blockKey: 'feature:online_booking', details: { changeType: 'site_feature', category: 'online_booking', vendor: 'ServiceTitan', direction: 'added', pageUrl: 'https://x.test/book' } });
    const ai = createFakeAi({ decide: structuredResult({ services: {} }) });
    const r = await tagChange({ db: dbs.service, ai, packs }, id);
    expect(r).toMatchObject({ ran: true });
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'site_feature', channels: ['web'], summary: 'Added online booking to its website' });
    expect(ev?.summary).not.toMatch(/ServiceTitan/);
    expect(ev?.details).toMatchObject({ vendor: 'ServiceTitan' }); // the vendor lives only in details
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

describe('tier_change events', () => {
  it('summary uses tier labels, no model call', async () => {
    const [scan] = await dbs.service.insert(rankScan).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, status: 'done', finishedAt: day(0) }).returning({ id: rankScan.id });
    const id = await change({
      source: 'rank', kind: 'modified', afterCaptureId: null, beforeCaptureId: null, rankScanId: scan!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, blockKey: 'tier:2026-10-12',
      beforeText: 'Worth watching', afterText: 'Top rival', details: { changeType: 'tier_change', from: 'watch', to: 'top' },
    });
    const ai = createFakeAi();
    await tagChange({ db: dbs.service, ai, packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ changeType: 'tier_change', agencyId: IDS.agencyA, clientId: IDS.clientA1, channels: ['rank'], occurredAt: new Date('2026-10-12T00:00:00Z') }); // the block_key (signals run) date, not the attached scan's finish 11 days earlier
    expect(ev?.summary).toBe('Now rated "Top rival" (was "Worth watching")');
    expect(ai.calls.decide).toHaveLength(0);
  });
});
