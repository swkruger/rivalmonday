import { createAccessContext } from '@cs/core';
import { client, feedback, move, moveEvent, recommendation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, noul } from '../../test/fake-ai';
import { day, seedScoredEvent } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import { recommendForMoves, updateRecommendationStatus } from './recommendations';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
const supportAll = (_s: unknown, qs: Record<string, unknown>) => ({ answers: Object.fromEntries(Object.keys(qs).map((k) => [k, noul(true)])), needsReview: [] });
const rec = (rationale = 'Smith HVAC cut its AC tune-up from $89 to $69.', title = 'Sell certainty, not discounts') =>
  JSON.stringify({ title, rationale, effort: 'M', impact: 'H', owner: 'agency', upsell_tag: 'ppc' });
const viewer = createAccessContext({ agencyId: IDS.agencyA, userId: 'v', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'o', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
let moveId: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const e = await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(-2), createdAt: day(-2) });
  const [m] = await dbs.service.insert(move).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.7, summary: 'Smith HVAC cut prices twice',
    details: { eventCount: 1, channels: ['web'], facts: { cuts: 2 } }, ruleVersion: 2, firstDetectedAt: day(-10), lastHeldAt: day(0), lastEvidenceAt: day(-2),
  }).returning({ id: move.id });
  moveId = m!.id;
  await dbs.service.insert(moveEvent).values({ moveId, eventId: e.eventId });
});

describe('recommendForMoves', () => {
  it('writes one verified recommendation per active move, once', async () => {
    const ai = createFakeAi({ chat: () => rec(), decide: supportAll });
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) })).toEqual({ created: 1, skipped: 0, failed: 0 });
    expect(ai.calls.chat[0]?.task).toBe('playbook_writer');
    expect(ai.calls.chat[0]?.content).toMatch(/Hold price, sell certainty/);
    const [r] = await dbs.owner.select().from(recommendation);
    expect(r).toMatchObject({ source: 'move', moveId, title: 'Sell certainty, not discounts', playbookId: 'price_war_hold_position', owner: 'agency', status: 'todo', rationale: 'Smith HVAC cut its AC tune-up from $89 to $69.' });
    expect(r!.eventIds).toHaveLength(1);
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) })).toEqual({ created: 0, skipped: 0, failed: 0 });
  });

  it('skips a move whose rationale has no supported sentence (no evidence, no claim)', async () => {
    const ai = createFakeAi({ chat: () => rec('Smith HVAC will cut to $39 next.'), decide: supportAll });
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) })).toEqual({ created: 0, skipped: 1, failed: 0 });
    expect(await dbs.owner.select().from(recommendation)).toHaveLength(0);
  });

  it('replaces a title that fails the rules check with the playbook title', async () => {
    const ai = createFakeAi({ chat: () => rec(undefined, 'Undercut them at $49'), decide: supportAll });
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) })).toMatchObject({ created: 1 });
    expect((await dbs.owner.select().from(recommendation))[0]).toMatchObject({ title: 'Hold price, sell certainty' });
  });

  it('gives the support check a period running from the first detection of the move to now', async () => {
    const ai = createFakeAi({ chat: () => rec(), decide: supportAll });
    await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) });
    expect((ai.calls.decide[0]!.state as { evidence: string }).evidence).toMatch(/^Brief period: 2026-09-21 to 2026-10-01\./);
  });

  it('skips a move that already has a live recommendation from an approved brief; a dismissed one does not block', async () => {
    const [r] = await dbs.service.insert(recommendation).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, title: 't', rationale: 'r', moveId, effort: 'L', impact: 'M', owner: 'client', source: 'brief',
    }).returning({ id: recommendation.id });
    const ai = createFakeAi({ chat: () => rec(), decide: supportAll });
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) })).toEqual({ created: 0, skipped: 0, failed: 0 });
    expect(ai.calls.chat).toHaveLength(0);
    await dbs.service.update(recommendation).set({ status: 'dismissed', dismissReason: 'no' }).where(eq(recommendation.id, r!.id));
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) })).toMatchObject({ created: 1 });
  });

  it('allows the local year of the client, not the UTC year', async () => {
    await dbs.owner.update(client).set({ timezone: 'America/Chicago' }).where(eq(client.id, IDS.clientA1));
    const ai = createFakeAi({ chat: () => rec('Smith HVAC cut its AC tune-up from $89 to $69 in 2026.'), decide: supportAll });
    // 03:00 UTC on 1 Jan 2027 is still 2026 in Chicago.
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: new Date('2027-01-01T03:00:00Z') })).toMatchObject({ created: 1 });
  });

  it('counts a model failure without stopping the run', async () => {
    const ai = createFakeAi({ chat: () => { throw new Error('openrouter down'); }, decide: supportAll });
    expect(await recommendForMoves({ db: dbs.service, ai, packs }, IDS.clientA1, { now: day(0) })).toEqual({ created: 0, skipped: 0, failed: 1 });
  });
});

describe('updateRecommendationStatus', () => {
  it('lets a client owner move a recommendation and records feedback; viewers are refused; dismissal needs a reason', async () => {
    await recommendForMoves({ db: dbs.service, ai: createFakeAi({ chat: () => rec(), decide: supportAll }), packs }, IDS.clientA1, { now: day(0) });
    const [r] = await dbs.owner.select().from(recommendation);
    const deps = { service: dbs.service, app: dbs.app };
    await updateRecommendationStatus(deps, owner, r!.id, 'in_progress');
    await expect(updateRecommendationStatus(deps, viewer, r!.id, 'done')).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(updateRecommendationStatus(deps, owner, r!.id, 'dismissed')).rejects.toThrow(/reason/);
    await updateRecommendationStatus(deps, owner, r!.id, 'dismissed', 'already doing this');
    expect((await dbs.owner.select().from(recommendation))[0]).toMatchObject({ status: 'dismissed', dismissReason: 'already doing this' });
    expect((await dbs.owner.select().from(feedback)).map((f) => [f.kind, f.before, f.after])).toEqual([
      ['status', { status: 'todo' }, { status: 'in_progress' }],
      ['status', { status: 'in_progress' }, { status: 'dismissed' }],
    ]);
  });
});
