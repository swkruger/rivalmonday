import { capture, evidence, observation, socialAccount, socialPost } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScClient, ScFbPost, ScFbProfile, ScIgProfile } from './client';
import { pullSocial } from './pull';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const NOW = new Date('2026-11-13T10:00:00Z');
const T0 = 1_794_000_000; // seconds
const fbPost = (id: string, ageDays: number, o: Partial<ScFbPost> = {}): ScFbPost => ({
  id,
  text: `post ${id}`,
  url: `https://www.facebook.com/x/posts/${id}`,
  publishTime: T0 - ageDays * 86400,
  reactionCount: 3,
  commentCount: 1,
  isVideo: false,
  ...o,
});
const fbProfile = (o: Partial<ScFbProfile> = {}): ScFbProfile => ({
  id: '100064175676130', name: 'Glow', url: null, website: null, links: [], followerCount: 1600, likeCount: 1558, category: null, ...o,
});
const igProfile = (n: number): ScIgProfile => ({
  handle: 'glowdentalco',
  followers: 900,
  postsCount: 50,
  externalUrl: null,
  isBusiness: true,
  posts: Array.from({ length: n }, (_, i) => ({ id: `ig${i}`, shortcode: `sc${i}`, takenAt: T0 - i * 86400, caption: `cap ${i}`, isVideo: i === 0 })),
});

function sc(o: Partial<ScClient> = {}): ScClient {
  return {
    searchCompanies: vi.fn(),
    facebookProfile: vi.fn(async () => fbProfile()),
    facebookPosts: vi.fn(async () => ({ posts: [], cursor: null })),
    instagramProfile: vi.fn(async () => igProfile(12)),
    ...o,
  };
}
const deps = (client: ScClient) => ({ db: dbs.service, store: createMemoryStore(), sc: client, now: () => NOW });
const account = (network: 'facebook' | 'instagram', o: Partial<typeof socialAccount.$inferInsert> = {}) =>
  dbs.owner.insert(socialAccount).values({
    competitorId: IDS.competitorX,
    network,
    handle: 'glowdentalco',
    externalId: network === 'facebook' ? '100064175676130' : null,
    url: `https://www.${network}.com/glowdentalco`,
    status: 'confirmed',
    confirmedBy: 'website',
    ...o,
  });
const posts = () => dbs.owner.select().from(socialPost).where(eq(socialPost.competitorId, IDS.competitorX));
const seedStored = async (postId: string, ageDays: number) => {
  const [cap] = await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, source: 'social', status: 'ok', collectorVersion: 'social/1' }).returning();
  await dbs.owner.insert(socialPost).values({
    competitorId: IDS.competitorX, network: 'facebook', postId, postedAt: new Date((T0 - ageDays * 86400) * 1000),
    text: '', url: 'u', firstCaptureId: cap!.id, firstSeenAt: NOW,
  });
};
const pages = (...ps: ScFbPost[][]) => {
  let i = 0;
  return vi.fn(async () => {
    const posts = ps[i] ?? [];
    i++;
    return { posts, cursor: i < ps.length ? `c${i}` : null };
  });
};

describe('pullSocial facebook', () => {
  it('stops at first stored post_id', async () => {
    await seedStored('b', 5);
    const facebookPosts = pages([fbPost('a', 1), fbPost('b', 5), fbPost('c', 9)], [fbPost('d', 12)]);
    await account('facebook');
    const res = await pullSocial(deps(sc({ facebookPosts })), IDS.competitorX);
    expect(facebookPosts).toHaveBeenCalledTimes(1);
    expect((await posts()).map((p) => p.postId).sort()).toEqual(['a', 'b']);
    expect(res.credits).toBe(2);
  });

  it('stops after 3 pages', async () => {
    const facebookPosts = pages(
      [fbPost('a', 1), fbPost('b', 2)], [fbPost('c', 3), fbPost('d', 4)], [fbPost('e', 5), fbPost('f', 6)], [fbPost('g', 7)],
    );
    await account('facebook');
    const res = await pullSocial(deps(sc({ facebookPosts })), IDS.competitorX);
    expect(facebookPosts).toHaveBeenCalledTimes(3);
    expect(await posts()).toHaveLength(6);
    expect(res.credits).toBe(4);
  });

  it('deleted newest post → stops by publishTime', async () => {
    await seedStored('gone', 5); // newest stored; the vendor no longer lists it
    const facebookPosts = pages([fbPost('a', 1), fbPost('older', 8)], [fbPost('x', 9)]);
    await account('facebook');
    await pullSocial(deps(sc({ facebookPosts })), IDS.competitorX);
    expect(facebookPosts).toHaveBeenCalledTimes(1);
    expect((await posts()).map((p) => p.postId).sort()).toEqual(['a', 'gone']);
  });

  it('capture per account with evidence', async () => {
    const facebookPosts = pages([fbPost('a', 1, { isVideo: true, text: null })]);
    await account('instagram');
    await account('facebook');
    const res = await pullSocial(deps(sc({ facebookPosts })), IDS.competitorX);
    expect(res.captures).toHaveLength(2);
    const caps = await dbs.owner.select().from(capture).where(eq(capture.source, 'social'));
    expect(caps.map((c) => c.url).sort()).toEqual(['social:facebook:100064175676130', 'social:instagram:glowdentalco']);
    expect(caps.every((c) => c.status === 'ok' && c.collectorVersion === 'social/1')).toBe(true);
    const ev = await dbs.owner.select().from(evidence);
    expect(ev.map((e) => e.kind)).toEqual(['vendor_json', 'vendor_json']);
    const obs = await dbs.owner.select().from(observation).where(eq(observation.kind, 'social_profile'));
    expect(obs.map((o) => o.key).sort()).toEqual(['facebook:100064175676130', 'instagram:glowdentalco']);
    expect(obs.find((o) => o.key.startsWith('facebook'))!.data).toEqual({ network: 'facebook', accountId: '100064175676130', followers: 1600, likes: 1558 });
    expect(obs.find((o) => o.key.startsWith('instagram'))!.data).toEqual({ network: 'instagram', accountId: 'glowdentalco', followers: 900, postsCount: 50 });
    const fb = (await posts()).find((p) => p.network === 'facebook')!;
    expect(fb).toMatchObject({ isVideo: true, text: '', firstSeenAt: NOW });
    expect(res.captures).toContain(fb.firstCaptureId);
    const accts = await dbs.owner.select().from(socialAccount);
    expect(accts.every((a) => a.lastPulledAt?.getTime() === NOW.getTime())).toBe(true);
  });
});

describe('pullSocial instagram', () => {
  it('ig 12 posts inserted once on re-pull', async () => {
    await account('instagram');
    const client = sc();
    await pullSocial(deps(client), IDS.competitorX);
    await pullSocial(deps(client), IDS.competitorX);
    expect(await posts()).toHaveLength(12);
    expect(await dbs.owner.select().from(capture)).toHaveLength(2);
  });
});

describe('pullSocial eligibility and failures', () => {
  it('suggested account not pulled', async () => {
    await account('instagram', { status: 'suggested', confirmedBy: null });
    const client = sc();
    const res = await pullSocial(deps(client), IDS.competitorX);
    expect(res).toEqual({ captures: [], credits: 0 });
    expect(client.instagramProfile).not.toHaveBeenCalled();
  });

  it('gated → observation only', async () => {
    await account('facebook');
    const facebookProfile = vi.fn(async (_u: string, o?: { gated?: boolean }) => (o?.gated ? fbProfile({ likeCount: null }) : { private: true as const }));
    const client = sc({ facebookProfile });
    const res = await pullSocial(deps(client), IDS.competitorX);
    expect(facebookProfile).toHaveBeenCalledTimes(2);
    expect(client.facebookPosts).not.toHaveBeenCalled();
    expect(res.credits).toBe(2);
    expect(await posts()).toHaveLength(0);
    const [acct] = await dbs.owner.select().from(socialAccount);
    expect(acct!.gated).toBe(true);
    const [obs] = await dbs.owner.select().from(observation);
    expect(obs!.data).toEqual({ network: 'facebook', accountId: '100064175676130', followers: 1600 });
  });

  it('vendor error → vendor_error capture, next account continues', async () => {
    await account('facebook');
    await account('instagram');
    const client = sc({ facebookProfile: vi.fn(async () => { throw new Error('boom'); }) });
    const res = await pullSocial(deps(client), IDS.competitorX);
    expect(res.captures).toHaveLength(2);
    const caps = await dbs.owner.select().from(capture);
    expect(caps.map((c) => c.status).sort()).toEqual(['ok', 'vendor_error']);
    expect(await posts()).toHaveLength(12);
    expect(await dbs.owner.select().from(observation)).toHaveLength(1);
  });
});
