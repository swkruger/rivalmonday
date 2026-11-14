import { pullSocial, type ScClient } from '@cs/collectors';
import { detectedChange, observation, socialAccount, socialPost } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { day, seedVendorCapture } from '../../test/seed';
import { buildStructuredSummary } from '../tag/structured';
import { diffSocial, type SocialDiffCtx, socialCadence } from './social';
import { diffVendorCapture } from './vendor-diff';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const URL = 'social:facebook:acme';
const now = day(90);
/** `social_account.id` of the confirmed `acme` page: the account identity in observation keys and block keys. */
let ACC = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [a] = await dbs.service.insert(socialAccount).values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'acme', url: 'https://facebook.com/acme', status: 'confirmed' }).returning();
  ACC = a!.id;
});

const cap = (n: number, url = URL) => seedVendorCapture(dbs.service, { competitorId: IDS.competitorX, source: 'social', url, capturedAt: day(n) });
const post = (firstCaptureId: string, firstSeenDay: number, id: string, text: string, postedDay: number) =>
  dbs.service.insert(socialPost).values({
    competitorId: IDS.competitorX, network: 'facebook', postId: id, postedAt: day(postedDay), text, url: `https://fb.example/${id}`, firstCaptureId, firstSeenAt: day(firstSeenDay),
  });
const followers = (captureId: string, n: number, at: number) =>
  dbs.service.insert(observation).values({ competitorId: IDS.competitorX, captureId, kind: 'social_profile', key: `facebook:${ACC}`, data: { network: 'facebook', accountId: ACC, followers: n }, observedAt: day(at) });
const changes = () => dbs.service.select().from(detectedChange);
const run = (id: string) => diffVendorCapture({ db: dbs.service }, id, { now });

describe('diffSocial (via diffVendorCapture)', () => {
  it('first pull silent', async () => {
    const c0 = await cap(0);
    await post(c0, 0, 'p1', 'Spring tune-up $79', -1);
    await followers(c0, 1200, 0);
    expect(await run(c0)).toMatchObject({ ran: true, result: { baseline: true } });
    expect(await changes()).toEqual([]);
  });

  it('post older than 21 d at first sight → no change', async () => {
    await cap(0);
    const c1 = await cap(7);
    await post(c1, 7, 'old', 'Spring tune-up $79', -30);
    await run(c1);
    expect(await changes()).toEqual([]);
  });

  it('re-pull same posts → no change', async () => {
    const c0 = await cap(0);
    const c1 = await cap(7);
    await post(c0, 0, 'p1', 'Spring tune-up $79', -1);
    await run(c1);
    expect(await changes()).toEqual([]);
  });

  it('offer post → promo with evidence', async () => {
    const c0 = await cap(0);
    const c1 = await cap(7);
    await post(c1, 7, 'p2', 'Spring tune-up $79', 5);
    await run(c1);
    const [c] = await changes();
    expect(c).toMatchObject({ kind: 'added', source: 'social', blockKey: 'social:facebook:post:p2', afterCaptureId: c1, beforeCaptureId: c0, afterText: 'Spring tune-up $79' });
    expect(c?.details).toEqual({ changeType: 'promo', surface: 'social', network: 'facebook', postId: 'p2', url: 'https://fb.example/p2' });
    expect(buildStructuredSummary({ source: 'social', beforeText: null, afterText: c!.afterText, details: c!.details })).toBe('Posted an offer on Facebook: "Spring tune-up $79"');
  });

  it('non-offer post → nothing', async () => {
    await cap(0);
    const c1 = await cap(7);
    await post(c1, 7, 'p3', 'We are hiring a technician!', 5);
    await run(c1);
    expect(await changes()).toEqual([]);
  });

  it('quiet after 4 posts → content once, confirmed on 2nd pull', async () => {
    const c0 = await cap(0);
    const c28 = await cap(28);
    const c35 = await cap(35);
    const c42 = await cap(42);
    for (const [i, d] of [-5, -10, -15, -20].entries()) await post(c0, 0, `q${i}`, 'Another job done', d);
    await run(c28); // first quiet pull: not confirmed
    expect(await changes()).toEqual([]);
    await run(c35); // second quiet pull: confirmed
    const [c] = await changes();
    expect(c).toMatchObject({ kind: 'added', blockKey: `social:facebook:cadence:quiet:${ACC}`, afterCaptureId: c35 });
    expect(c?.details).toEqual({ changeType: 'content', surface: 'social', network: 'facebook', cadence: 'quiet' });
    expect(buildStructuredSummary({ source: 'social', beforeText: null, afterText: null, details: c!.details })).toBe('Went quiet on Facebook: no posts in the last 30 days');
    await run(c42); // state persists: no second change
    expect(await changes()).toHaveLength(1);
  });

  it('quiet at baseline → silent (no observed flip)', async () => {
    const c0 = await cap(0);
    const c7 = await cap(7);
    const c14 = await cap(14);
    for (const [i, d] of [-40, -45, -50, -55].entries()) await post(c0, 0, `b${i}`, 'Another job done', d);
    await run(c7);
    await run(c14);
    expect(await changes()).toEqual([]);
  });

  it("posts of a rejected account don't feed cadence", async () => {
    const old = await cap(0, 'social:facebook:oldpage');
    const c0 = await cap(0);
    const c28 = await cap(28);
    const c35 = await cap(35);
    for (const [i, d] of [-5, -10, -15, -20].entries()) await post(old, 0, `r${i}`, 'Another job done', d);
    await run(c28);
    await run(c35);
    expect(await changes()).toEqual([]);
    void c0;
  });

  it('followers +21% → audience_growth facebook', async () => {
    const c0 = await cap(0);
    const c28 = await cap(28);
    await followers(c0, 1200, 0);
    await followers(c28, 1450, 28);
    await run(c28);
    const [c] = await changes();
    expect(c).toMatchObject({ kind: 'modified', blockKey: `social:facebook:followers:${ACC}`, beforeCaptureId: c0, afterCaptureId: c28 });
    expect(c?.details).toEqual({ changeType: 'audience_growth', surface: 'social', network: 'facebook', followers: 1450, previous: 1200, pct: 20.8, window: 28 });
    expect(buildStructuredSummary({ source: 'social', beforeText: c!.beforeText, afterText: c!.afterText, details: c!.details })).toBe('Facebook followers 1,200 → 1,450 (+21%)');
  });

  it('a gated account makes no cadence change (I2)', async () => {
    await dbs.service.update(socialAccount).set({ gated: true }).where(eq(socialAccount.id, ACC));
    const c0 = await cap(0);
    const c28 = await cap(28);
    const c35 = await cap(35);
    for (const [i, d] of [-5, -10, -15, -20].entries()) await post(c0, 0, `g${i}`, 'Another job done', d);
    await run(c28);
    await run(c35);
    expect(await changes()).toEqual([]);
  });

  it('a capture of no confirmed account makes no change', async () => {
    await cap(0, 'social:facebook:other');
    const c7 = await cap(7, 'social:facebook:other');
    await post(c7, 7, 'p9', 'Spring tune-up $79', 5);
    await run(c7);
    expect(await changes()).toEqual([]);
  });
});

describe('pasted-alias Facebook account end to end (I1)', () => {
  it('pull → diff yields followers, an offer and cadence for an account with no external_id', async () => {
    const T = (n: number) => Math.floor(day(n).getTime() / 1000);
    const posts = [
      { id: 'a1', text: 'Spring tune-up $79 this week', url: null, publishTime: T(27), reactionCount: 1, commentCount: 0, isVideo: false },
      { id: 'a2', text: 'Another job done', url: null, publishTime: T(26), reactionCount: 1, commentCount: 0, isVideo: false },
      { id: 'a3', text: 'Meet the crew', url: null, publishTime: T(25), reactionCount: 1, commentCount: 0, isVideo: false },
    ];
    const fol = [1200, 1450, 1460];
    let pull = 0;
    const sc: ScClient = {
      searchCompanies: vi.fn(),
      facebookProfile: vi.fn(async () => ({ id: '100064175676130', name: 'Acme', url: null, website: null, links: [], followerCount: fol[pull]!, likeCount: null, category: null })),
      facebookPosts: vi.fn(async () => ({ posts: pull === 0 ? [] : posts, cursor: null })),
      instagramProfile: vi.fn(),
    };
    const store = createMemoryStore();
    for (const [i, d] of [0, 28, 30].entries()) {
      pull = i;
      const r = await pullSocial({ db: dbs.service, store, sc, now: () => day(d) }, IDS.competitorX);
      await diffVendorCapture({ db: dbs.service }, r.captures[0]!, { now: new Date(day(d).getTime() + 3_600_000) }); // past the 10-minute settle
    }
    const keys = (await changes()).map((c) => c.blockKey).sort();
    expect(keys).toEqual([`social:facebook:cadence:started:${ACC}`, `social:facebook:followers:${ACC}`, 'social:facebook:post:a1'].sort());
  });
});

describe('socialCadence / diffSocial unit rules', () => {
  const at = (n: number) => ({ postedAt: day(n) });
  it('started: 3 posts in 14 d after 30 quiet days; quiet: none in 30 d after 4', () => {
    expect(socialCadence([at(-1), at(-3), at(-9)], day(0))).toBe('started');
    expect(socialCadence([at(-1), at(-3), at(-9), at(-30)], day(0))).toBeNull();
    expect(socialCadence([at(-31), at(-35), at(-40), at(-50)], day(0))).toBe('quiet');
    expect(socialCadence([at(-31), at(-35), at(-40)], day(0))).toBeNull();
  });

  it('a cadence change is held back for 30 days per account and kind', () => {
    const mk = (n: number) => ({ capturedAt: day(n) }) as SocialDiffCtx['capture'];
    const posts = [-40, -45, -50, -55].map((d, i) => ({ postedAt: day(d), postId: `p${i}`, firstCaptureId: 'x', text: '' })) as SocialDiffCtx['posts'];
    const base: Omit<SocialDiffCtx, 'priorChanges'> = { competitorId: IDS.competitorX, network: 'facebook', capture: mk(0), prevCapture: mk(-7), olderCapture: mk(-14), posts, accountId: ACC, followers: null, followersHistory: [] };
    const prior = (ago: number) => [{ blockKey: `social:facebook:cadence:quiet:${ACC}`, detectedAt: day(-ago) }];
    expect(diffSocial({ ...base, priorChanges: prior(10) })).toEqual([]);
    expect(diffSocial({ ...base, priorChanges: prior(31) })).toHaveLength(1);
  });
});
