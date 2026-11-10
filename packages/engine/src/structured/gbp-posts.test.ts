import { GBP_POSTS_URL } from '@cs/collectors';
import { client, competitor, detectedChange, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { isOfferPost } from './gbp-posts';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const SRC = 'google_business_profile';
const now = day(60);
let cap0: string;
let cap1: string;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  cap0 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, url: GBP_POSTS_URL, capturedAt: day(0) });
  cap1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, url: GBP_POSTS_URL, capturedAt: day(7) });
});

const post = (captureId: string, key: string, text: string, postedAt: Date | null = day(5), competitorId: string = IDS.competitorX) =>
  dbs.service.insert(observation).values({ competitorId, captureId, kind: 'gbp_post', key, data: { text, url: `https://posts.example/${key}`, buttonUrl: null, postedAt: postedAt?.toISOString() ?? null } });
const changes = () => dbs.service.select().from(detectedChange);
const run = (id: string) => diffVendorCapture({ db: dbs.service }, id, { now });

describe('diffGbpPosts (via diffVendorCapture)', () => {
  it('the first posts capture is a silent baseline', async () => {
    await post(cap0, 'p1', 'Spring tune-up $79', day(-1));
    expect(await run(cap0)).toMatchObject({ ran: true, result: { baseline: true } });
    expect(await changes()).toEqual([]);
  });

  it('a post seen before is not new', async () => {
    await post(cap0, 'p1', 'Spring tune-up $79');
    await post(cap1, 'p1', 'Spring tune-up $79');
    await run(cap1);
    expect(await changes()).toEqual([]);
  });

  it('a new offer post is a promo change with the spec details', async () => {
    await post(cap0, 'p1', 'Old news');
    await post(cap1, 'p1', 'Old news');
    await post(cap1, 'p2', 'Spring tune-up $79');
    await run(cap1);
    const [c] = await changes();
    expect(c).toMatchObject({ kind: 'added', blockKey: 'gbp_post:p2', source: SRC, afterText: 'Spring tune-up $79', beforeText: null });
    expect(c?.details).toEqual({ changeType: 'promo', field: 'post', postId: 'p2', offer: true, url: 'https://posts.example/p2' });
  });

  it('promo wording without a price is an offer too; plain text is content', async () => {
    await post(cap0, 'p1', 'x');
    await post(cap1, 'p3', "We're hiring!");
    await post(cap1, 'p4', 'Big spring sale on filters');
    await run(cap1);
    const byKey = Object.fromEntries((await changes()).map((c) => [c.blockKey, c.details.changeType]));
    expect(byKey).toEqual({ 'gbp_post:p3': 'content', 'gbp_post:p4': 'promo' });
    expect(isOfferPost("We're hiring!")).toBe(false);
  });

  it('skips a post dated more than 21 days before the capture, keeps an undated one', async () => {
    await post(cap0, 'p1', 'x');
    await post(cap1, 'old', 'Old post', day(-15)); // 22 days before day(7)
    await post(cap1, 'edge', 'Edge post', day(-13)); // 20 days before
    await post(cap1, 'undated', 'No date', null);
    await run(cap1);
    expect((await changes()).map((c) => c.blockKey).sort()).toEqual(['gbp_post:edge', 'gbp_post:undated']);
  });

  it('more than 5 new posts: the 5 newest as singles plus one aggregate with the rest', async () => {
    await post(cap0, 'p0', 'x');
    for (let i = 1; i <= 7; i++) await post(cap1, `n${i}`, `Update ${i}`, day(i - 1));
    await run(cap1);
    const rows = await changes();
    expect(rows).toHaveLength(6);
    const more = rows.find((c) => c.blockKey === 'gbp_post:more');
    expect(more).toMatchObject({ kind: 'added' });
    expect(more?.details).toMatchObject({ changeType: 'content', field: 'post', count: 2 });
    expect(rows.map((c) => c.blockKey).filter((k) => k !== 'gbp_post:more').sort()).toEqual(['gbp_post:n3', 'gbp_post:n4', 'gbp_post:n5', 'gbp_post:n6', 'gbp_post:n7']);
  });

  it("a self-only competitor makes no events; a tracked one that is also someone's self does", async () => {
    const own = '00000000-0000-4000-8000-0000000000f9';
    await dbs.owner.insert(competitor).values({ id: own, name: 'A1 HVAC (self)', domain: 'a1.example' });
    await dbs.owner.update(client).set({ selfCompetitorId: own }).where(eq(client.id, IDS.clientA1));
    const s0 = await seedVendorCapture(dbs.service, { competitorId: own, source: SRC, url: GBP_POSTS_URL, capturedAt: day(0) });
    const s1 = await seedVendorCapture(dbs.service, { competitorId: own, source: SRC, url: GBP_POSTS_URL, capturedAt: day(7) });
    await post(s0, 'a', 'x', day(1), own);
    await post(s1, 'b', 'Spring tune-up $79', day(6), own);
    await run(s1);
    expect(await changes()).toEqual([]);
    // X is tracked by A1/B1; making it A2's own business too keeps it a rival.
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA2));
    await post(cap0, 'p1', 'x');
    await post(cap1, 'p2', 'Spring tune-up $79');
    await run(cap1);
    expect((await changes()).map((c) => c.blockKey)).toEqual(['gbp_post:p2']);
  });

  it('a GBP-info capture (no url) still goes to diffGbp, not the posts differ', async () => {
    await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, capturedAt: day(0) });
    const g1 = await seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: SRC, capturedAt: day(7) });
    await post(g1, 'zz', 'Spring tune-up $79'); // a stray post row on an info capture is never read by diffGbp
    expect(await run(g1)).toMatchObject({ ran: true, result: { baseline: false, changeIds: [] } });
    expect(await changes()).toEqual([]);
  });
});
