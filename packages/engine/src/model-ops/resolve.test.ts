import { changeEvent, decisionLabel, decisionReview, decisionSample, detectedChange, eventChange, eventScore } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { choice, noul } from '../../test/fake-ai';
import { day, seedPage, seedVendorCapture, seedWebCapture } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader } from '../tag/tag-stage';
import { listOpenReviews, resolveDecisionReview } from './resolve';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const deps = { db: dbs.service, packs };
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner); // A1 and B1 (both hvac) track X
});

async function webChange(status: 'cosmetic' | 'event', text = 'We now offer duct cleaning in every county', money = false) {
  const store = createMemoryStore();
  const page = await seedPage(dbs.service, IDS.competitorX, 'https://smithhvac.example/services', 'service');
  const cap = await seedWebCapture(dbs.service, store, { competitorId: IDS.competitorX, trackedPageId: page, html: `<p>${text}</p>`, capturedAt: day(1) });
  const [c] = await dbs.service
    .insert(detectedChange)
    .values({
      competitorId: IDS.competitorX, trackedPageId: page, source: 'web', kind: 'added', afterCaptureId: cap, blockKey: 'body>p#0', afterText: text, status, stageVersion: 1,
      numericChanges: money ? diffFacts(extractNumericFacts('$99'), extractNumericFacts('$79')) : [],
    })
    .returning({ id: detectedChange.id });
  return c!.id;
}

async function review(changeId: string, keys: string[], answers: Record<string, unknown>, withSample = true) {
  const [s] = withSample
    ? await dbs.service
        .insert(decisionSample)
        .values({
          task: 'tag_decisions', reason: 'review', state: {}, final: answers, needsReview: keys,
          questions: { meaningful: { type: 'noul', instructions: 'm' }, change_type: { type: 'choice', instructions: 't', options: { new_service: 'n', promo: 'p', content: 'c', cosmetic: 'x', price_change: 'pc' } }, service_hvac_plumbing: { type: 'choice', instructions: 's', options: { none: 'none', duct_cleaning: 'd', ac_tune_up: 'a' } } },
        })
        .returning({ id: decisionSample.id })
    : [undefined];
  const [r] = await dbs.service.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys, answers, sampleId: s?.id ?? null }).returning({ id: decisionReview.id });
  return r!.id;
}

const modelSaid = (meaningful: boolean, type: string, service = 'none') => ({ meaningful: noul(meaningful, 0.4), change_type: choice(type, 0.4), service_hvac_plumbing: choice(service, 0.4) });

async function event(changeIds: string[], over: Partial<typeof changeEvent.$inferInsert> = {}) {
  const [ev] = await dbs.service
    .insert(changeEvent)
    .values({ competitorId: IDS.competitorX, changeType: 'new_service', channels: ['web'], summary: 's', confidence: 0.4, needsReview: true, occurredAt: day(1), ...over })
    .returning({ id: changeEvent.id });
  for (const id of changeIds) await dbs.service.insert(eventChange).values({ eventId: ev!.id, changeId: id });
  return ev!.id;
}

describe('resolveDecisionReview (Phase 3d decision 8)', () => {
  it('lists open reviews with their change', async () => {
    const ch = await webChange('cosmetic');
    await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'));
    const open = await listOpenReviews(dbs.service);
    expect(open.map((o) => [o.changeId, o.keys, o.competitorName])).toEqual([[ch, ['meaningful'], 'Smith HVAC']]);
  });

  it('turns a cosmetic change the AM calls meaningful into a scored event and labels the sample', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'));
    const r = await resolveDecisionReview(deps, id, { answers: { meaningful: true, change_type: 'new_service', service_hvac_plumbing: 'duct_cleaning' }, resolvedBy: 'am@agency' });
    expect(r).toMatchObject({ action: 'created', labels: 3 });
    const [ev] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, r.eventId!));
    expect(ev).toMatchObject({ changeType: 'new_service', services: { hvac_plumbing: 'duct_cleaning' }, needsReview: false });
    expect(await dbs.owner.select().from(eventScore).where(eq(eventScore.eventId, r.eventId!))).toHaveLength(2);
    expect((await dbs.owner.select().from(detectedChange))[0]?.status).toBe('event');
    const [rev] = await dbs.owner.select().from(decisionReview);
    expect(rev).toMatchObject({ resolvedBy: 'am@agency', resolution: { meaningful: true, change_type: 'new_service', service_hvac_plumbing: 'duct_cleaning' } });
    expect((await dbs.owner.select().from(decisionLabel)).map((l) => [l.questionKey, l.value, l.source]).sort()).toEqual([
      ['change_type', 'new_service', 'review'], ['meaningful', 'true', 'review'], ['service_hvac_plumbing', 'duct_cleaning', 'review'],
    ]);
  });

  it('detaches a rejected web change from a merged event, which stays live on the ad', async () => {
    const ch = await webChange('event');
    const ads = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'google_ads', capturedAt: day(1) });
    const [ad] = await dbs.service.insert(detectedChange).values({ competitorId: IDS.competitorX, source: 'google_ads', kind: 'added', afterCaptureId: ads, blockKey: 'ads', status: 'event', stageVersion: 1 }).returning({ id: detectedChange.id });
    const ev = await event([ch, ad!.id], { channels: ['google_ads', 'web'] });
    const id = await review(ch, ['meaningful'], modelSaid(true, 'new_service'));
    const r = await resolveDecisionReview(deps, id, { answers: { meaningful: false }, resolvedBy: 'am' });
    expect(r).toMatchObject({ action: 'detached', eventId: ev });
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ retractedAt: null, channels: ['google_ads'] });
    expect((await dbs.owner.select().from(detectedChange).where(eq(detectedChange.id, ch)))[0]?.status).toBe('cosmetic');
  });

  it('retracts a web-only event the AM rejects, even when it carries a money change', async () => {
    const ch = await webChange('event', 'Tune-up $79 (was $99)', true);
    const ev = await event([ch], { changeType: 'price_change' });
    const id = await review(ch, ['change_type'], modelSaid(true, 'price_change'));
    expect(await resolveDecisionReview(deps, id, { answers: { meaningful: false }, resolvedBy: 'am' })).toMatchObject({ action: 'retracted', eventId: ev });
    expect((await dbs.owner.select().from(changeEvent))[0]?.retractionReason).toBe('review');
  });

  it('updates type and service, clears needs_review and re-scores', async () => {
    const ch = await webChange('event');
    const ev = await event([ch], { services: { hvac_plumbing: null } });
    const id = await review(ch, ['service_hvac_plumbing'], modelSaid(true, 'new_service'));
    expect(await resolveDecisionReview(deps, id, { answers: { service_hvac_plumbing: 'duct_cleaning' }, resolvedBy: 'am' })).toMatchObject({ action: 'updated', eventId: ev });
    const [row] = await dbs.owner.select().from(changeEvent).where(eq(changeEvent.id, ev));
    expect(row).toMatchObject({ services: { hvac_plumbing: 'duct_cleaning' }, needsReview: false });
    expect(await dbs.owner.select().from(eventScore)).toHaveLength(2);
  });

  it('validates answers against the questions and never resolves twice', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'));
    await expect(resolveDecisionReview(deps, id, { answers: { change_type: 'banana' }, resolvedBy: 'am' })).rejects.toThrow(/change_type/);
    await expect(resolveDecisionReview(deps, id, { answers: { nope: true }, resolvedBy: 'am' })).rejects.toThrow(/unknown question "nope"/);
    expect((await dbs.owner.select().from(decisionReview))[0]?.resolvedAt).toBeNull();
    await resolveDecisionReview(deps, id, { answers: { meaningful: false }, resolvedBy: 'am' });
    await expect(resolveDecisionReview(deps, id, { answers: { meaningful: true }, resolvedBy: 'am' })).rejects.toThrow(/already resolved/);
  });

  it('works without a sample, using the tag questions', async () => {
    const ch = await webChange('cosmetic');
    const id = await review(ch, ['meaningful'], modelSaid(false, 'cosmetic'), false);
    expect(await resolveDecisionReview(deps, id, { answers: { meaningful: true }, resolvedBy: 'am' })).toMatchObject({ action: 'created', labels: 0 });
  });
});
