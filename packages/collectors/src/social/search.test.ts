import { socialAccount } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScClient, ScCompany, ScFbProfile } from './client';
import { discoverSocialAccounts } from './search';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const row = (o: Partial<ScCompany>): ScCompany => ({
  page_id: '1',
  name: 'Glow Dental Co.',
  page_alias: 'glowdentalco',
  ig_username: 'glowdentalco',
  likes: 10,
  ig_followers: 5,
  category: null,
  page_is_deleted: false,
  ...o,
});
const profile = (o: Partial<ScFbProfile> = {}): ScFbProfile => ({
  id: '100064175676130',
  name: 'Glow Dental Co.',
  url: null,
  website: 'https://glowdentalco.com/',
  links: [],
  followerCount: 1600,
  likeCount: 1558,
  category: null,
  ...o,
});

function fakeSc(results: ScCompany[], profiles: (ScFbProfile | { private: true })[]) {
  const queue = [...profiles];
  const facebookProfile = vi.fn(async (_url: string, _opts?: { gated?: boolean }) => queue.shift() ?? { private: true as const });
  const sc: ScClient = {
    searchCompanies: vi.fn(async () => results),
    facebookProfile,
    facebookPosts: vi.fn(),
    instagramProfile: vi.fn(),
  };
  return { sc, facebookProfile };
}
const comp = (o: Partial<{ name: string; domain: string | null; metaPageIds: string[] }> = {}) => ({
  id: IDS.competitorX,
  name: 'Glow Dental Co.',
  domain: 'glowdentalco.com' as string | null,
  metaPageIds: [] as string[],
  ...o,
});
const rows = () => dbs.owner.select().from(socialAccount).where(eq(socialAccount.competitorId, IDS.competitorX));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('discoverSocialAccounts', () => {
  it('website match → facebook + instagram confirmed', async () => {
    const { sc } = fakeSc([row({})], [profile()]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.credits).toBe(2);
    expect(res.facebook).toMatchObject({
      network: 'facebook',
      handle: 'glowdentalco',
      externalId: '100064175676130',
      url: 'https://www.facebook.com/glowdentalco',
      status: 'confirmed',
      confirmedBy: 'website',
    });
    expect(res.instagram).toMatchObject({
      network: 'instagram',
      handle: 'glowdentalco',
      url: 'https://www.instagram.com/glowdentalco/',
      externalId: null,
      status: 'confirmed',
      confirmedBy: 'website',
    });
    expect(await rows()).toHaveLength(2);
  });

  it('website host mismatch → suggested', async () => {
    const { sc } = fakeSc([row({})], [profile({ website: 'https://other-dental.com' })]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.facebook).toMatchObject({ status: 'suggested', confirmedBy: null });
    expect(res.instagram).toMatchObject({ status: 'suggested', confirmedBy: null });
  });

  it('linktr.ee never confirms', async () => {
    const { sc } = fakeSc([row({})], [profile({ website: 'https://linktr.ee/glowdentalco' })]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp({ domain: 'linktr.ee' }));
    expect(res.facebook?.status).toBe('suggested');
  });

  it('meta page with mismatching website → suggested (P3)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sc } = fakeSc([row({ page_id: '777', name: 'Totally Different' })], [profile({ website: 'https://elsewhere.com' })]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp({ metaPageIds: ['777'] }));
    expect(res.facebook?.status).toBe('suggested');
    expect(warn).toHaveBeenCalledWith('social: meta page website mismatch', expect.anything());
    warn.mockRestore();
  });

  it('rejected handle not re-suggested', async () => {
    await dbs.owner
      .insert(socialAccount)
      .values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'glowdentalco', url: 'https://www.facebook.com/glowdentalco', status: 'rejected' });
    const { sc } = fakeSc([row({})], [profile({ website: 'https://other.com' })]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.facebook).toBeUndefined();
    expect(res.instagram).toMatchObject({ status: 'suggested' });
    expect((await rows()).find((r) => r.network === 'facebook')?.status).toBe('rejected');
  });

  it('no search result → nothing, 1 credit', async () => {
    const { sc, facebookProfile } = fakeSc([row({ name: 'Unrelated Plumbing' })], []);
    expect(await discoverSocialAccounts(dbs.service, sc, comp())).toEqual({ credits: 1 });
    expect(facebookProfile).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });

  it('private FB → gated retry, followers only', async () => {
    const { sc, facebookProfile } = fakeSc([row({ page_alias: '', page_id: '258279197517396' })], [{ private: true }, profile({ website: null })]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.credits).toBe(3);
    expect(facebookProfile).toHaveBeenNthCalledWith(1, 'https://www.facebook.com/profile.php?id=258279197517396');
    expect(facebookProfile).toHaveBeenNthCalledWith(2, 'https://www.facebook.com/profile.php?id=258279197517396', { gated: true });
    expect(res.facebook).toMatchObject({ handle: '258279197517396', gated: true, status: 'suggested' });
  });

  it('never downgrades a confirmed row and demotes to suggested when another account is confirmed', async () => {
    await discoverSocialAccounts(dbs.service, fakeSc([row({})], [profile()]).sc, comp());
    const again = await discoverSocialAccounts(dbs.service, fakeSc([row({})], [profile({ website: 'https://other.com' })]).sc, comp());
    expect(again.facebook?.status).toBe('confirmed');
    const other = await discoverSocialAccounts(dbs.service, fakeSc([row({ page_alias: 'glowdental2', ig_username: null })], [profile()]).sc, comp());
    expect(other.facebook).toMatchObject({ handle: 'glowdental2', status: 'suggested' });
    expect(await rows()).toHaveLength(3);
  });
});
