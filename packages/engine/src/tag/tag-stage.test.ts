import { capture, changeEvent, clientCompetitor, decisionReview, decisionSample, detectedChange, eventChange, stageRun, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, tagResult } from '../../test/fake-ai';
import { day } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader, tagChange } from './tag-stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const PAGE = '00000000-0000-4000-8000-0000000000e1';
const CAP0 = '00000000-0000-4000-8000-0000000000c0';
const CAP1 = '00000000-0000-4000-8000-0000000000c1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'manual', cadence: 'daily' });
  await dbs.service.insert(capture).values([
    { id: CAP0, competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: day(0) },
    { id: CAP1, competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', status: 'ok', collectorVersion: 'web/1', capturedAt: day(1) },
  ]);
});

async function change(before: string | null, after: string | null, kind = 'modified') {
  const numericChanges = diffFacts(before ? extractNumericFacts(before) : [], after ? extractNumericFacts(after) : []);
  const [row] = await dbs.service
    .insert(detectedChange)
    .values({ competitorId: IDS.competitorX, trackedPageId: PAGE, source: 'web', kind, beforeCaptureId: CAP0, afterCaptureId: CAP1, blockKey: 'a.card#0', beforeText: before, afterText: after, numericChanges, flags: ['numeric'], stageVersion: 1 })
    .returning({ id: detectedChange.id });
  return row!.id;
}
const statusOf = async (id: string) => (await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, id)))[0]?.status;

describe('tagChange', () => {
  it('turns a meaningful price change into an event with its evidence link', async () => {
    const id = await change('AC Tune-Up $89', 'AC Tune-Up $69');
    const ai = createFakeAi({ decide: tagResult({ meaningful: true, type: 'price_change', services: { hvac_plumbing: 'ac_tune_up' } }) });
    const r = await tagChange({ db: dbs.service, ai, packs }, id);
    expect(r.ran && r.result.eventId).toBeTruthy();
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev).toMatchObject({ competitorId: IDS.competitorX, changeType: 'price_change', services: { hvac_plumbing: 'ac_tune_up' }, needsReview: false, occurredAt: day(1) });
    expect(ev?.summary).toContain('$89 to $69');
    expect(ev).toMatchObject({ channels: ['web'], details: { offer: true } }); // a money change is an offer
    expect(ev?.facts).toHaveLength(1);
    expect(await dbs.owner.select().from(eventChange)).toEqual([{ eventId: ev!.id, changeId: id }]);
    expect(await statusOf(id)).toBe('event');
    expect(ai.calls.decide.map((c) => c.task)).toEqual(['tag_decisions']);
  });

  it('flags a web change as an offer only for a promo, a price cut or a newly added price — never a price rise', async () => {
    const tag = async (before: string | null, after: string, kind = 'modified') => {
      const id = await change(before, after, kind);
      await tagChange({ db: dbs.service, ai: createFakeAi({ decide: tagResult({ meaningful: true, type: 'price_change', services: { hvac_plumbing: 'ac_tune_up' } }) }), packs }, id);
      const [ev] = await dbs.owner.select({ e: changeEvent }).from(changeEvent).innerJoin(eventChange, eq(eventChange.eventId, changeEvent.id)).where(eq(eventChange.changeId, id));
      return ev?.e;
    };
    const rise = await tag('AC Tune-Up $69', 'AC Tune-Up $89');
    expect(rise).toMatchObject({ changeType: 'price_change', details: { offer: false } }); // still a meaningful price change
    await dbs.owner.delete(changeEvent);
    expect((await tag(null, 'AC Tune-Up now just $59', 'added')).details).toMatchObject({ offer: true });
  });

  it('builds the event summary from redacted text (no contact details)', async () => {
    const id = await change(null, 'Now offering emergency AC repair, call 972-555-0100 any time', 'added');
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: tagResult({ meaningful: true, type: 'new_service' }) }), packs }, id);
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev?.summary).toContain('[phone]');
    expect(ev?.summary).not.toContain('972-555-0100');
    expect(ev).toMatchObject({ channels: ['web'], details: { offer: false } }); // meaningful, but no promo or money fact
  });

  it('marks a wording-only change cosmetic without an event', async () => {
    const id = await change('Call us today', 'Call us now');
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: tagResult({ meaningful: false, type: 'cosmetic' }) }), packs }, id);
    expect(await statusOf(id)).toBe('cosmetic');
    expect(await dbs.owner.select().from(changeEvent)).toEqual([]);
  });

  it('never lets the model dismiss a price change', async () => {
    const id = await change('AC Tune-Up $89', 'AC Tune-Up $69');
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: tagResult({ meaningful: false, type: 'cosmetic' }) }), packs }, id);
    expect((await dbs.owner.select().from(changeEvent))[0]?.changeType).toBe('price_change');
  });

  it('queues low-confidence decisions for review and flags the event', async () => {
    const id = await change(null, 'Now offering heat pump installs across Collin County', 'added');
    const ai = createFakeAi({ decide: tagResult({ meaningful: true, type: 'new_service', confidence: 0.6, needsReview: ['change_type'] }) });
    await tagChange({ db: dbs.service, ai, packs }, id);
    expect((await dbs.owner.select().from(changeEvent))[0]?.needsReview).toBe(true);
    expect(await dbs.owner.select().from(decisionReview)).toMatchObject([{ subjectType: 'detected_change', subjectId: id, keys: ['change_type'] }]);
  });

  it('links the decision_review row to the decision sample (Phase 3d)', async () => {
    const id = await change(null, 'Now offering heat pump installs across Collin County', 'added');
    const [s] = await dbs.service.insert(decisionSample).values({ task: 'tag_decisions', reason: 'review', state: {}, questions: {}, final: {} }).returning({ id: decisionSample.id });
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: tagResult({ meaningful: true, type: 'new_service', confidence: 0.6, needsReview: ['change_type'], sampleId: s!.id }) }), packs }, id);
    const [r] = await dbs.owner.select().from(decisionReview);
    expect(r?.sampleId).toBe(s!.id);
  });

  it('queues a dismissed low-confidence change for review without creating an event', async () => {
    const id = await change('Call us today', 'Call us now');
    const ai = createFakeAi({ decide: tagResult({ meaningful: false, type: 'cosmetic', confidence: 0.6, needsReview: ['meaningful'] }) });
    await tagChange({ db: dbs.service, ai, packs }, id);
    expect(await statusOf(id)).toBe('cosmetic');
    expect(await dbs.owner.select().from(changeEvent)).toEqual([]);
    expect(await dbs.owner.select().from(decisionReview)).toMatchObject([{ subjectType: 'detected_change', subjectId: id, keys: ['meaningful'] }]);
  });

  it('leaves the change pending and writes nothing when every model is down, then succeeds on retry', async () => {
    const id = await change('AC Tune-Up $89', 'AC Tune-Up $69');
    await expect(tagChange({ db: dbs.service, ai: createFakeAi({ decide: () => { throw new Error('jev and openrouter down'); } }), packs }, id)).rejects.toThrow('down');
    expect(await statusOf(id)).toBe('pending');
    expect(await dbs.owner.select().from(changeEvent)).toEqual([]);
    expect((await dbs.owner.select().from(stageRun).where(eq(stageRun.subjectId, id)))[0]).toMatchObject({ stage: 'tag', status: 'failed' });
    await tagChange({ db: dbs.service, ai: createFakeAi({ decide: tagResult({ meaningful: true, type: 'price_change' }) }), packs }, id);
    expect(await statusOf(id)).toBe('event');
  });

  it('writes nothing when a newer diff supersedes the change while the model is deciding', async () => {
    const id = await change('AC Tune-Up $89', 'AC Tune-Up $69');
    const decide = tagResult({ meaningful: true, type: 'price_change', confidence: 0.4, needsReview: ['change_type'] });
    const ai = createFakeAi({
      decide: async (state, questions) => {
        await dbs.service.update(detectedChange).set({ status: 'superseded' }).where(eq(detectedChange.id, id));
        return decide(state, questions);
      },
    });
    expect(await tagChange({ db: dbs.service, ai, packs }, id)).toMatchObject({ ran: true, result: { eventId: null, merged: false } });
    expect(await dbs.owner.select().from(changeEvent)).toEqual([]);
    expect(await dbs.owner.select().from(decisionReview)).toEqual([]);
    expect(await statusOf(id)).toBe('superseded');
  });

  it('keeps a superseded change superseded when a dismissed decision commits late', async () => {
    const id = await change('Call us today', 'Call us now');
    const ai = createFakeAi({
      decide: async (state, questions) => {
        await dbs.service.update(detectedChange).set({ status: 'superseded' }).where(eq(detectedChange.id, id));
        return tagResult({ meaningful: false, type: 'cosmetic' })(state, questions);
      },
    });
    await tagChange({ db: dbs.service, ai, packs }, id);
    expect(await statusOf(id)).toBe('superseded');
  });

  it('is idempotent', async () => {
    const id = await change('AC Tune-Up $89', 'AC Tune-Up $69');
    const ai = createFakeAi({ decide: tagResult({ meaningful: true, type: 'price_change' }) });
    await tagChange({ db: dbs.service, ai, packs }, id);
    expect(await tagChange({ db: dbs.service, ai, packs }, id)).toEqual({ ran: false });
    expect(await dbs.owner.select().from(changeEvent)).toHaveLength(1);
  });

  it('asks one service question per vertical of the clients tracking the competitor, with redacted state', async () => {
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX });
    const id = await change('Call 972-555-0100', 'Call 972-555-0100 for $49 whitening');
    const ai = createFakeAi({ decide: tagResult({ meaningful: true, type: 'promo', services: { dental: 'whitening' } }) });
    await tagChange({ db: dbs.service, ai, packs }, id);
    const call = ai.calls.decide[0]!;
    expect(Object.keys(call.questions).sort()).toEqual(['change_type', 'meaningful', 'service_dental', 'service_hvac_plumbing']);
    expect(JSON.stringify(call.state)).not.toContain('555-0100');
    const [ev] = await dbs.owner.select().from(changeEvent);
    expect(ev?.services).toEqual({ dental: 'whitening', hvac_plumbing: null });
    expect(ev).toMatchObject({ changeType: 'promo', channels: ['web'], details: { offer: true } });
  });
});
