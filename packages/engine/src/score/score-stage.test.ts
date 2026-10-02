import { changeEvent, client, clientCompetitor, EMBEDDING_DIMENSIONS, eventScore, withTenant } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day } from '../../test/seed';
import { diffFacts, extractNumericFacts } from '../facts/numeric';
import { createPackLoader } from '../tag/tag-stage';
import { factsSignature, scoreEvent } from './score-stage';

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
