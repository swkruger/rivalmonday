import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agency, alert, brief, changeEvent, platformSetting } from './schema';

/** Phase 13a2 migration 0114: review flags on brief/alert (P19) and the sample agency's host slug (V10). */
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const briefRow = (extra: Record<string, unknown> = {}) => ({
  agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05',
  periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z'), status: 'ready', ...extra,
});
async function alertRow(extra: Record<string, unknown> = {}) {
  const [e] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorY, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning({ id: changeEvent.id });
  return { agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorY, eventId: e!.id, score: 80, status: 'drafting', mode: 'direct', ...extra };
}

describe('review flags', () => {
  it("review_reason 'other' rejected; null and 'banned_term' accepted", async () => {
    expect(await errorText(dbs.service.insert(brief).values(briefRow({ reviewReason: 'other' }) as never))).toMatch(/brief_review_reason_check/);
    expect(await errorText(dbs.service.insert(alert).values(await alertRow({ reviewReason: 'other' }) as never))).toMatch(/alert_review_reason_check/);
    const [b1] = await dbs.service.insert(brief).values(briefRow() as never).returning();
    expect(b1!.reviewReason).toBeNull();
    const [b2] = await dbs.service.insert(brief).values(briefRow({ clientId: IDS.clientA2, reviewReason: 'banned_term' }) as never).returning();
    expect(b2!.reviewReason).toBe('banned_term');
    const [a1] = await dbs.service.insert(alert).values(await alertRow() as never).returning();
    expect(a1!.reviewReason).toBeNull();
    const [a2] = await dbs.service.insert(alert).values(await alertRow({ reviewReason: 'banned_term' }) as never).returning();
    expect(a2!.reviewReason).toBe('banned_term');
  });

  it('review_terms round-trips a string array', async () => {
    const [b] = await dbs.service.insert(brief).values(briefRow({ reviewReason: 'banned_term', reviewTerms: ['leverage', 'synergy'] }) as never).returning();
    const [read] = await dbs.service.select({ t: brief.reviewTerms }).from(brief).where(eq(brief.id, b!.id));
    expect(read!.t).toEqual(['leverage', 'synergy']);
    const [a] = await dbs.service.insert(alert).values(await alertRow({ reviewReason: 'banned_term', reviewTerms: ['x'] }) as never).returning();
    expect(a!.reviewTerms).toEqual(['x']);
  });
});

// The hand-added DO block is the last statement of the migration; re-run it against crafted agencies.
const BLOCK = readFileSync(join(__dirname, '../migrations/0114_voice_review.sql'), 'utf8').split('--> statement-breakpoint').pop()!;

describe('migration 0114 samples host slug', () => {
  async function seedSample(slug: string) {
    const [a] = await dbs.owner.insert(agency).values({ name: 'Rival Monday Samples', hostSlug: slug }).returning({ id: agency.id });
    await dbs.owner.insert(platformSetting).values({ key: 'sample_agency_id', value: { agencyId: a!.id }, updatedBy: 'op' });
    return a!.id;
  }
  const slugOf = async (id: string) => (await dbs.owner.select({ s: agency.hostSlug }).from(agency).where(eq(agency.id, id)))[0]!.s;

  it('renames rival-monday-samples to samples; leaves another agency\'s slug alone', async () => {
    const id = await seedSample('rival-monday-samples');
    const [other] = await dbs.owner.insert(agency).values({ name: 'Other', hostSlug: 'rival-monday-samples-7' }).returning({ id: agency.id });
    await dbs.owner.execute(sql.raw(BLOCK));
    expect(await slugOf(id)).toBe('samples');
    expect(await slugOf(other!.id)).toBe('rival-monday-samples-7');
  });

  it('samples taken → samples-2', async () => {
    await dbs.owner.insert(agency).values({ name: 'Samples', hostSlug: 'samples' });
    const id = await seedSample('rival-monday-samples');
    await dbs.owner.execute(sql.raw(BLOCK));
    expect(await slugOf(id)).toBe('samples-2');
  });
});
