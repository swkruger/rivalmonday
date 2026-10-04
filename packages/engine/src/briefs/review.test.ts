import { createAccessContext } from '@cs/core';
import { brief, briefItem, changeEvent, feedback, move, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedScoredEvent } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import { QUIET_SUMMARY } from './generate';
import { approveBrief, approveBriefTx, dropBriefItem, editBriefItem, getBrief, rateBriefItem, reorderBriefItems } from './review';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const deps = () => ({ service: dbs.service, app: dbs.app, packs: createPackLoader() });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am-1', role: 'account_manager', clientScope: 'all', features: [] });
const otherAgency = createAccessContext({ agencyId: IDS.agencyB, userId: 'am-2', role: 'account_manager', clientScope: 'all', features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'own-1', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
const baseItem = (briefId: string, eventId: string) => ({
  briefId, agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, whatChanged: 'The pricing page shows $69, down from $89.', whyItMatters: 'y', recommendedAction: 'Bundle a filter.', confidence: 0.9, effort: 'L', impact: 'M', eventIds: [eventId], evidenceIds: ['ev'], upsellTag: 'ppc', playbookId: 'price_cut_bundle',
});
let briefId: string;
let eventId: string;
let items: string[];
let base: ReturnType<typeof baseItem>;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const e = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(-1), createdAt: day(-1) });
  const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: day(-7), periodEnd: day(0), status: 'ready', summary: 's' }).returning({ id: brief.id });
  briefId = b!.id;
  eventId = e.eventId;
  base = baseItem(briefId, e.eventId);
  items = (await dbs.service.insert(briefItem).values([{ ...base, ord: 0, headline: 'First' }, { ...base, ord: 1, headline: 'Second' }]).returning({ id: briefItem.id })).map((r) => r.id);
});

describe('brief review', () => {
  it('AMs see the full brief; client roles see nothing before approval and never the upsell tag', async () => {
    expect((await getBrief(deps(), am, briefId)).items[0]?.upsellTag).toBe('ppc');
    await expect(getBrief(deps(), owner, briefId)).rejects.toMatchObject({ code: 'not_found' });
    await approveBrief(deps(), am, briefId);
    const view = await getBrief(deps(), owner, briefId);
    expect(view.items.map((i) => i.upsellTag)).toEqual([null, null]);
    await expect(getBrief(deps(), otherAgency, briefId)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('edits store before/after feedback and return rule warnings without blocking', async () => {
    const r = await editBriefItem(deps(), am, items[0]!, { whatChanged: 'They now charge $49.' });
    expect(r.warnings).toEqual(['number $49 is not in the evidence']);
    const [i] = await dbs.owner.select().from(briefItem).where(eq(briefItem.id, items[0]!));
    expect(i).toMatchObject({ whatChanged: 'They now charge $49.', editedBy: 'am-1' });
    const [f] = await dbs.owner.select().from(feedback);
    expect(f).toMatchObject({ kind: 'edit', subjectType: 'brief_item', actor: 'am-1', before: { whatChanged: 'The pricing page shows $69, down from $89.' }, after: { whatChanged: 'They now charge $49.' } });
  });

  it('drop, reorder and rate record feedback; client roles are refused', async () => {
    await dropBriefItem(deps(), am, items[0]!, 'not relevant');
    await expect(dropBriefItem(deps(), am, items[0]!)).rejects.toMatchObject({ code: 'invalid_input' }); // already dropped: no extra feedback
    await expect(reorderBriefItems(deps(), am, briefId, [items[1]!, items[0]!])).rejects.toThrow(/active items/);
    await reorderBriefItems(deps(), am, briefId, [items[1]!]);
    await rateBriefItem(deps(), am, items[1]!, true);
    expect((await dbs.owner.select().from(feedback)).map((f) => f.kind).sort()).toEqual(['drop', 'rating', 'reorder']);
    await expect(dropBriefItem(deps(), owner, items[1]!)).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('reorder permutes the active set, keyed by position: a dropped item keeps its own ord', async () => {
    const [a, b] = items;
    const [c] = (await dbs.service.insert(briefItem).values({ ...base, ord: 2, headline: 'Third' }).returning({ id: briefItem.id })).map((r) => r.id);
    await dropBriefItem(deps(), am, b!);
    await reorderBriefItems(deps(), am, briefId, [c!, a!]);
    const view = await getBrief(deps(), am, briefId);
    expect(view.items.filter((i) => i.status === 'active').sort((x, y) => x.ord - y.ord).map((i) => i.id)).toEqual([c, a]);
    expect(view.items.find((i) => i.id === b)).toMatchObject({ status: 'dropped', ord: 1 }); // unchanged
    const [f] = await dbs.owner.select().from(feedback).where(eq(feedback.kind, 'reorder'));
    expect(f).toMatchObject({ before: { order: [a, c] }, after: { order: [c, a] } });
  });

  it('approval creates one recommendation per active item, once', async () => {
    await dropBriefItem(deps(), am, items[0]!);
    expect(await approveBrief(deps(), am, briefId)).toEqual({ recommendations: 1 });
    const recs = await dbs.owner.select().from(recommendation);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ briefItemId: items[1], title: 'Bundle a filter.', rationale: 'The pricing page shows $69, down from $89.', status: 'todo', source: 'brief', owner: 'client', upsellTag: 'ppc', effort: 'L', impact: 'M' });
    expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ status: 'approved', approvedBy: 'am-1' });
    await expect(approveBrief(deps(), am, briefId)).rejects.toThrow(/ready/);
    await expect(editBriefItem(deps(), am, items[1]!, { headline: 'x' })).rejects.toThrow(/ready/);
  });

  it('approval marks items whose evidence was retracted after the brief was ready as dropped, with system feedback, and recommends nothing for them', async () => {
    await dbs.service.update(changeEvent).set({ retractedAt: new Date(), retractionReason: 'review' }).where(eq(changeEvent.id, eventId));
    expect(await approveBrief(deps(), am, briefId)).toEqual({ recommendations: 0 });
    expect(await dbs.owner.select().from(recommendation)).toHaveLength(0);
    expect((await dbs.owner.select().from(briefItem)).map((i) => i.status)).toEqual(['dropped', 'dropped']);
    const fb = await dbs.owner.select().from(feedback);
    expect(fb).toHaveLength(2);
    for (const f of fb) expect(f).toMatchObject({ kind: 'drop', subjectType: 'brief_item', actor: 'system', reason: 'evidence retracted' });
    expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ status: 'approved' });
  });

  it('approval adds no recommendation for an item whose move already has a live one; a dismissed one does not block', async () => {
    const [m] = await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.7, summary: 's',
      details: { eventCount: 1, channels: ['web'], facts: {} }, ruleVersion: 2, firstDetectedAt: day(-10), lastHeldAt: day(0), lastEvidenceAt: day(-2),
    }).returning({ id: move.id });
    await dbs.service.update(briefItem).set({ moveId: m!.id }).where(eq(briefItem.id, items[0]!));
    await dbs.service.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', moveId: m!.id, effort: 'L', impact: 'M', owner: 'agency', source: 'move' });
    expect(await approveBrief(deps(), am, briefId)).toEqual({ recommendations: 1 });
    expect((await dbs.owner.select().from(recommendation)).filter((r) => r.source === 'brief').map((r) => r.briefItemId)).toEqual([items[1]]);
  });

  it('approval still recommends for a move whose only earlier recommendation was dismissed', async () => {
    const [m] = await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.7, summary: 's',
      details: { eventCount: 1, channels: ['web'], facts: {} }, ruleVersion: 2, firstDetectedAt: day(-10), lastHeldAt: day(0), lastEvidenceAt: day(-2),
    }).returning({ id: move.id });
    await dbs.service.update(briefItem).set({ moveId: m!.id }).where(eq(briefItem.id, items[0]!));
    await dbs.service.insert(recommendation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', moveId: m!.id, effort: 'L', impact: 'M', owner: 'agency', source: 'move', status: 'dismissed', dismissReason: 'no' });
    expect(await approveBrief(deps(), am, briefId)).toEqual({ recommendations: 2 });
  });
});

describe('approval recomputes the summary (binding before any send)', () => {
  // The file's top-level beforeEach already seeds a brief at (clientA1, 2026-10-05); clear it so readyBrief's own
  // insert at that same (client, delivery date) key does not collide with it.
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
  });
  async function readyBrief(statuses: ('active' | 'dropped')[]) {
    const ev = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(-1) });
    const [b] = await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: day(-7), periodEnd: day(0), status: 'ready', kind: 'standard', summary: 'Smith HVAC cut a price and raised another.' }).returning();
    for (const [ord, status] of statuses.entries()) {
      await dbs.service.insert(briefItem).values({ briefId: b!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord, competitorId: IDS.competitorX, headline: `H${ord}`, whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'M', eventIds: [ev.eventId], evidenceIds: [], status });
    }
    return b!.id;
  }
  const read = async (id: string) => (await dbs.owner.select().from(brief).where(eq(brief.id, id)))[0]!;

  it('keeps the summary when nothing was dropped', async () => {
    const id = await readyBrief(['active', 'active']);
    await approveBrief(deps(), am, id);
    expect(await read(id)).toMatchObject({ status: 'approved', kind: 'standard', summary: 'Smith HVAC cut a price and raised another.' });
  });

  it('uses the count line after an AM drop, and the quiet summary when nothing is left', async () => {
    const one = await readyBrief(['active', 'dropped']);
    await approveBrief(deps(), am, one);
    expect(await read(one)).toMatchObject({ kind: 'standard', summary: '1 competitor update this week.' });
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    const none = await readyBrief(['dropped']);
    await approveBrief(deps(), am, none);
    expect(await read(none)).toMatchObject({ kind: 'quiet', summary: QUIET_SUMMARY });
  });

  it('records a system approval as feedback', async () => {
    const id = await readyBrief(['active']);
    await dbs.service.transaction((tx) => approveBriefTx(tx, id, 'system', day(4), { auto: true }));
    expect(await read(id)).toMatchObject({ status: 'approved', approvedBy: 'system' });
    const [f] = await dbs.owner.select().from(feedback).where(eq(feedback.subjectId, id));
    expect(f).toMatchObject({ subjectType: 'brief', kind: 'status', actor: 'system', after: { status: 'approved', auto: true } });
  });
});
