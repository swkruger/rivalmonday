import { pseudonymizeReviewer } from '@cs/collectors';
import { observation, review, reviewAnalysis } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { loadVerticalPack } from '@cs/verticals';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { FIRST_NAMES, HVAC_THEMES, LAST_INITIALS, LATE_PHRASE } from './names';
import { seedReviews } from './reviews';
import { seedTenancy } from './tenancy';
import { countRows, resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedReviews(ctx);
});

describe('seedReviews', () => {
  it('writes about 400 reviews over 12 months, each with one analysis', async () => {
    const n = await countRows(dbs.owner, sql`select count(*)::int as n from review`);
    expect(n).toBeGreaterThanOrEqual(380);
    expect(n).toBeLessThanOrEqual(420);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from review_analysis`)).toBe(n);
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from review where posted_at < now() - interval '366 days' or posted_at > now()`)).toBe(0);
  });

  it('uses the pack’s theme ids, covers every theme, and leaves one business/theme cell empty on purpose', async () => {
    const pack = await loadVerticalPack('hvac_plumbing');
    expect([...HVAC_THEMES].sort()).toEqual(pack.themes.map((t) => t.id).sort());
    const rows = await dbs.owner.select({ competitorId: reviewAnalysis.competitorId, asked: reviewAnalysis.asked, themes: reviewAnalysis.themes }).from(reviewAnalysis);
    for (const t of HVAC_THEMES) expect(rows.some((r) => r.themes.includes(t))).toBe(true);
    const hill = ctx.ids.competitors.loneStar[0]!.id;
    expect(rows.filter((r) => r.competitorId === hill).some((r) => r.asked.includes('cleanliness'))).toBe(false);
  });

  it('pairs each analysis with its own review (theme phrases agree with the analysed themes)', async () => {
    const rows = await dbs.owner.select({ text: review.text, themes: reviewAnalysis.themes }).from(reviewAnalysis).innerJoin(review, eq(review.id, reviewAnalysis.reviewId));
    const late = rows.find((r) => r.text?.includes(LATE_PHRASE));
    expect(late?.themes).toEqual(['scheduling', 'communication']);
  });

  it('contains the searchable phrase once, leaves one competitor without reviews, and hashes reviewers with the salt', async () => {
    expect(await countRows(dbs.owner, sql`select count(*)::int as n from review where text ilike ${`%${LATE_PHRASE}%`}`)).toBe(1);
    expect(await dbs.owner.select().from(review).where(eq(review.competitorId, ctx.ids.noData.reviews))).toHaveLength(0);
    const possible = new Set<string | null>();
    for (const f of FIRST_NAMES) for (const i of LAST_INITIALS) possible.add(pseudonymizeReviewer(`${f} ${i}.`, TEST_SALT));
    const hashes = await dbs.owner.select({ hash: review.reviewerHash }).from(review);
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) {
      expect(h.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(possible.has(h.hash)).toBe(true);
    }
  });

  it('gives every business a GBP profile with a rating, except the no-reviews competitor (no rating)', async () => {
    const obs = await dbs.owner.select().from(observation).where(eq(observation.kind, 'gbp_profile'));
    expect(obs).toHaveLength(13);
    const empty = obs.find((o) => o.competitorId === ctx.ids.noData.reviews)!;
    expect(empty.data.rating).toBeNull();
    expect(obs.find((o) => o.competitorId === ctx.ids.selfLoneStar)!.data.rating).toEqual(expect.any(Number));
    expect(ctx.ids.sampleReviewIds).toHaveLength(3);
  });
});
