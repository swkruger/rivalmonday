import { brief, briefItem, changeEvent, client, move, moveEvent } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi, noul } from '../../test/fake-ai';
import { day, seedScoredEvent } from '../../test/seed';
import { createPackLoader } from '../tag/tag-stage';
import type { EventCandidate, MoveCandidate } from './gather';
import { committableItems, generateBrief, listBriefDueClients, QUIET_SUMMARY } from './generate';
import type { VerifiedItem } from './verify';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = createPackLoader();
// day(0) = Thu 2026-10-01 06:00 UTC; Thursday 22:30 Chicago (CDT) = Fri 03:30 UTC
const NOW = new Date('2026-10-02T03:30:00Z');
const draft = (refs: string[], headline = 'Smith HVAC cut its AC tune-up to $69.') => JSON.stringify({
  summary: 'Smith HVAC cut a price.',
  items: refs.map((ref) => ({ ref, headline, what_changed: 'The pricing page shows $69, down from $89.', why_it_matters: 'Price shoppers may compare.', recommended_action: 'Bundle a filter change.', effort: 'L', impact: 'M', upsell_tag: 'ppc' })),
});
const supportAll = (_s: unknown, qs: Record<string, unknown>) => ({ answers: Object.fromEntries(Object.keys(qs).map((k) => [k, noul(true)])), needsReview: [] });
const run = (ai = createFakeAi({ chat: () => draft(['C1']), decide: supportAll }), now = NOW) => generateBrief({ db: dbs.service, ai, packs }, IDS.clientA1, { now });
const seedEvent = (o = {}) => seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(-1), createdAt: day(-1), ...o });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('generateBrief', () => {
  it('writes a ready standard brief with verified items, evidence and event ids', async () => {
    const e = await seedEvent();
    const r = await run();
    expect(r).toMatchObject({ status: 'ready', kind: 'standard', items: 1 });
    const [b] = await dbs.owner.select().from(brief);
    expect(b).toMatchObject({ status: 'ready', kind: 'standard', deliveryDate: '2026-10-05', summary: 'Smith HVAC cut a price.', attempts: 1, error: null });
    expect(b!.trend?.windowDays).toBe(30);
    const [i] = await dbs.owner.select().from(briefItem);
    expect(i).toMatchObject({ ord: 0, competitorId: IDS.competitorX, eventIds: [e.eventId], confidence: 0.95, upsellTag: 'ppc', playbookId: 'price_cut_bundle', status: 'active' });
    expect(i!.evidenceIds.length).toBeGreaterThan(0);
  });

  it('writes a quiet brief without calling the writer when nothing qualifies', async () => {
    const ai = createFakeAi({ decide: supportAll });
    expect(await run(ai)).toMatchObject({ status: 'ready', kind: 'quiet', items: 0 });
    expect(ai.calls.chat).toHaveLength(0);
    expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ kind: 'quiet', summary: QUIET_SUMMARY });
  });

  it('becomes quiet when the verifier drops every item (never padded)', async () => {
    await seedEvent();
    const ai = createFakeAi({ chat: () => draft(['C1'], 'Smith HVAC cut its AC tune-up to $49.'), decide: supportAll });
    expect(await run(ai)).toMatchObject({ status: 'ready', kind: 'quiet', items: 0, dropped: { items: 1 } });
  });

  it('fails cleanly on a verifier outage, stores no items, retries, and gives up after three attempts', async () => {
    await seedEvent();
    const down = createFakeAi({ chat: () => draft(['C1']), decide: () => { throw new Error('jev and llm down'); } });
    expect(await run(down)).toMatchObject({ status: 'failed', error: expect.stringMatching(/down/) });
    expect(await dbs.owner.select().from(briefItem)).toHaveLength(0);
    expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ status: 'failed', attempts: 1 });
    await run(down);
    await run(down);
    expect(await run(down)).toEqual({ status: 'skipped', reason: expect.stringMatching(/attempts/) });
    expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('a second run for the same delivery date is skipped once ready', async () => {
    await run();
    expect(await run()).toEqual({ status: 'skipped', reason: expect.stringMatching(/already/) });
  });

  it('drops an item whose event was retracted while the model was writing', async () => {
    const e = await seedEvent();
    const ai = createFakeAi({
      chat: () => draft(['C1']),
      decide: async (s, qs) => {
        await dbs.service.update(changeEvent).set({ retractedAt: new Date(), retractionReason: 'review' }).where(eq(changeEvent.id, e.eventId));
        return supportAll(s, qs);
      },
    });
    expect(await run(ai)).toMatchObject({ status: 'ready', kind: 'quiet', items: 0 });
  });

  it('writes a quiet brief when an open move\'s supporting events were all retracted (its stale summary is not evidence)', async () => {
    const e = await seedEvent();
    const [m] = await dbs.service.insert(move).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, moveType: 'price_war', status: 'active', confidence: 0.9, summary: 'Smith HVAC cut prices twice',
      details: { eventCount: 1, channels: ['web'], facts: { cuts: 2 } }, ruleVersion: 2, firstDetectedAt: day(-10), lastHeldAt: day(0), lastEvidenceAt: day(-1),
    }).returning({ id: move.id });
    await dbs.service.insert(moveEvent).values({ moveId: m!.id, eventId: e.eventId });
    await dbs.service.update(changeEvent).set({ retractedAt: day(-1), retractionReason: 'review' }).where(eq(changeEvent.id, e.eventId));
    const ai = createFakeAi({ chat: () => draft(['C1'], 'Smith HVAC cut prices twice.'), decide: supportAll });
    expect(await run(ai)).toMatchObject({ status: 'ready', kind: 'quiet', items: 0 });
    expect(ai.calls.chat).toHaveLength(0);
    expect(await dbs.owner.select().from(briefItem)).toHaveLength(0);
  });

  describe('a stale run reclaimed by a newer attempt', () => {
    // On the first run's first verifier call: age its claim past the stale window and let a second run reclaim and finish.
    // The verifier makes several decide calls; only the first one reclaims.
    const reclaimDuring = (then: () => void) => {
      let reclaimed = false;
      return async (s: unknown, qs: Record<string, unknown>) => {
        if (!reclaimed) {
          reclaimed = true;
          await dbs.service.update(brief).set({ updatedAt: new Date(Date.now() - 31 * 60_000) }).where(eq(brief.clientId, IDS.clientA1));
          expect(await run()).toMatchObject({ status: 'ready', kind: 'standard', items: 1 });
        }
        then();
        return supportAll(s, qs);
      };
    };

    it('stores nothing at commit and leaves the newer ready brief intact', async () => {
      await seedEvent();
      const first = createFakeAi({ chat: () => draft(['C1']), decide: reclaimDuring(() => {}) });
      expect(await run(first)).toEqual({ status: 'skipped', reason: 'superseded by a newer attempt' });
      expect(await dbs.owner.select().from(briefItem)).toHaveLength(1);
      expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ status: 'ready', kind: 'standard', attempts: 2, error: null });
    });

    it('does not flip the newer ready brief to failed when the stale run errors', async () => {
      await seedEvent();
      const first = createFakeAi({ chat: () => draft(['C1']), decide: reclaimDuring(() => { throw new Error('verifier down'); }) });
      expect(await run(first)).toEqual({ status: 'skipped', reason: 'superseded by a newer attempt' });
      expect(await dbs.owner.select().from(briefItem)).toHaveLength(1);
      expect((await dbs.owner.select().from(brief))[0]).toMatchObject({ status: 'ready', attempts: 2, error: null });
    });
  });

  it('stores the driver message when Drizzle wraps a database error', async () => {
    await seedEvent();
    const cause = new Error('connection terminated unexpectedly');
    const ai = createFakeAi({ chat: () => draft(['C1']), decide: () => { throw Object.assign(new Error('Failed query: select 1'), { cause }); } });
    expect(await run(ai)).toMatchObject({ status: 'failed', error: 'connection terminated unexpectedly' });
  });

  it('starts the next period at the previous brief end', async () => {
    await run();
    await seedEvent({ occurredAt: day(5), createdAt: day(5) });
    const next = new Date('2026-10-09T03:30:00Z');
    const r = await run(undefined, next);
    expect(r).toMatchObject({ status: 'ready', kind: 'standard' });
    const rows = await dbs.owner.select().from(brief).orderBy(brief.deliveryDate);
    expect(rows[1]!.periodStart).toEqual(rows[0]!.periodEnd);
  });

  it('attributes model calls to the client', async () => {
    // FakeAi does not ledger: assert the scope the writer call received
    await seedEvent();
    const scopes: unknown[] = [];
    const ai = createFakeAi({ chat: () => draft(['C1']), decide: supportAll });
    const chat = ai.chat.bind(ai);
    ai.chat = async (t, i, s) => { scopes.push(s); return chat(t, i, s); };
    await run(ai);
    expect(scopes).toEqual([{ agencyId: IDS.agencyA, clientId: IDS.clientA1 }]);
  });
});

describe('listBriefDueClients', () => {
  it('lists clients in their Thursday-night window without a live brief', async () => {
    await dbs.owner.update(client).set({ timezone: 'America/Los_Angeles' }).where(eq(client.id, IDS.clientA2)); // Thu 20:30 PDT at NOW → not due
    const due = await listBriefDueClients(dbs.service, NOW);
    expect(due.sort()).toEqual([IDS.clientA1, IDS.clientB1].sort());
    await run();
    expect(await listBriefDueClients(dbs.service, NOW)).not.toContain(IDS.clientA1);
  });
});

describe('committableItems', () => {
  const ev = { kind: 'event', eventId: 'e1' } as EventCandidate;
  const item = (candidate: EventCandidate | MoveCandidate) => ({ candidate }) as VerifiedItem;
  it('refuses an item citing no events and an item citing a retracted event', () => {
    const empty = item({ kind: 'move', moveId: 'm', events: [] as EventCandidate[] } as MoveCandidate);
    const live = item(ev);
    const gone = item({ ...ev, eventId: 'e2' });
    expect(committableItems([empty, live, gone], ['e2'])).toEqual([live]);
  });
});
