import { competitor, socialAccount } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScClient, ScCompany, ScFbProfile } from './client';
import { discoverSocialAccounts, pickCandidate } from './search';

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
    const { sc, facebookProfile } = fakeSc([row({})], []);
    expect(await discoverSocialAccounts(dbs.service, sc, comp())).toEqual({ credits: 1 });
    expect(facebookProfile).not.toHaveBeenCalled();
    expect(await rows()).toHaveLength(1);
  });

  it('rejected candidate is skipped at pick time and the next match is used', async () => {
    await dbs.owner
      .insert(socialAccount)
      .values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'glowdentalco', url: 'https://www.facebook.com/glowdentalco', status: 'rejected' });
    const { sc, facebookProfile } = fakeSc([row({}), row({ page_id: '2', page_alias: 'glowdentalaustin', ig_username: null })], [profile()]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.facebook).toMatchObject({ handle: 'glowdentalaustin', status: 'confirmed' });
    expect(facebookProfile).toHaveBeenCalledTimes(1);
    expect(facebookProfile).toHaveBeenCalledWith('https://www.facebook.com/glowdentalaustin');
  });

  it('rejected handle matches case-insensitively and by facebook profile id', async () => {
    await dbs.owner
      .insert(socialAccount)
      .values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'GlowDentalCo', url: 'https://www.facebook.com/GlowDentalCo', status: 'rejected' });
    const a = fakeSc([row({})], []);
    expect(await discoverSocialAccounts(dbs.service, a.sc, comp())).toEqual({ credits: 1 });
    // A different alias for the same profile id is caught at upsert.
    await dbs.owner
      .insert(socialAccount)
      .values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'oldalias', externalId: '100064175676130', url: 'https://www.facebook.com/oldalias', status: 'rejected' });
    await dbs.owner.delete(socialAccount).where(eq(socialAccount.handle, 'GlowDentalCo'));
    const b = fakeSc([row({ page_alias: 'newalias', ig_username: null })], [profile()]);
    const res = await discoverSocialAccounts(dbs.service, b.sc, comp());
    expect(res.facebook).toBeUndefined();
    expect((await rows()).filter((r) => r.status !== 'rejected')).toHaveLength(0);
  });

  it('rejected FB row never lets its Instagram auto-confirm', async () => {
    await dbs.owner
      .insert(socialAccount)
      .values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'oldalias', externalId: '100064175676130', url: 'https://www.facebook.com/oldalias', status: 'rejected' });
    const { sc } = fakeSc([row({ page_alias: 'newalias' })], [profile()]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.facebook).toBeUndefined();
    expect(res.instagram).toMatchObject({ status: 'suggested', confirmedBy: null });
  });

  it('instagram handle found only in facebook links is suggested and lower-cased', async () => {
    const { sc } = fakeSc([row({ ig_username: null })], [profile({ links: ['https://www.instagram.com/GlowDental_Co/'] })]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.facebook?.status).toBe('confirmed');
    expect(res.instagram).toMatchObject({ handle: 'glowdental_co', status: 'suggested' });
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
    expect(again.facebook).toMatchObject({ status: 'confirmed', confirmedBy: 'website' });
    const other = await discoverSocialAccounts(dbs.service, fakeSc([row({ page_alias: 'glowdental2', ig_username: null })], [profile({ id: '999' })]).sc, comp());
    expect(other.facebook).toMatchObject({ handle: 'glowdental2', status: 'suggested' });
    expect(await rows()).toHaveLength(3);
  });
});

describe('discoverSocialAccounts franchise guard (I3)', () => {
  it('"Aire Serv" vs page "Aire Serv of Granbury" with a matching host → suggested', async () => {
    const { sc } = fakeSc([row({ name: 'Aire Serv of Granbury', page_alias: 'aireservgranbury', ig_username: 'aireservgranbury' })], [profile({ website: 'https://www.aireserv.com/granbury/' })]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp({ name: 'Aire Serv', domain: 'aireserv.com' }));
    expect(res.facebook).toMatchObject({ status: 'suggested', confirmedBy: null });
    expect(res.instagram).toMatchObject({ status: 'suggested', confirmedBy: null });
  });

  it('a domain host shared with another competitor row → suggested', async () => {
    await dbs.owner.insert(competitor).values({ name: 'Glow Dental Co. Granbury', domain: 'https://www.glowdentalco.com/granbury' });
    const { sc } = fakeSc([row({})], [profile()]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.facebook).toMatchObject({ status: 'suggested', confirmedBy: null });
    expect(res.instagram).toMatchObject({ status: 'suggested', confirmedBy: null });
  });

  it('exact name and a unique host → confirmed', async () => {
    await dbs.owner.insert(competitor).values({ name: 'Glow Dental Elsewhere', domain: 'glowdentalco.net' });
    const { sc } = fakeSc([row({ name: 'GLOW DENTAL CO' })], [profile()]);
    const res = await discoverSocialAccounts(dbs.service, sc, comp());
    expect(res.facebook).toMatchObject({ status: 'confirmed', confirmedBy: 'website' });
    expect(res.instagram).toMatchObject({ status: 'confirmed', confirmedBy: 'website' });
  });
});

describe('pickCandidate', () => {
  const c = (name: string, o: Partial<ScCompany> = {}) => row({ name, page_alias: name, ...o });
  const me = (name: string, metaPageIds: string[] = []) => ({ id: IDS.competitorX, name, domain: null, metaPageIds });

  it('"Aire Serv" matches "Aire Serv of Granbury"', () => {
    expect(pickCandidate([c('Aire Serv of Granbury')], me('Aire Serv'))).not.toBeNull();
  });
  it('"Glow" does not match "Glow Dental Co"', () => {
    expect(pickCandidate([c('Glow Dental Co')], me('Glow'))).toBeNull();
  });
  it('a sibling brand sharing a long first word does not match', () => {
    expect(pickCandidate([c('Comfort Masters Plumbing')], me('Comfort Masters Heating'))).toBeNull();
  });
  it('the first matching result wins (prefix with >= 2 tokens)', () => {
    const r = pickCandidate([c('Cool Air Conditioning Co', { page_id: '1' }), c('Cool Air', { page_id: '2' })], me('Cool Air'));
    expect(r?.page_id).toBe('1');
  });
  it('deleted meta page skipped', () => {
    const r = pickCandidate([c('Other Name', { page_id: '777', page_is_deleted: true }), c('Glow Dental Co.', { page_id: '2' })], me('Glow Dental Co.', ['777']));
    expect(r?.page_id).toBe('2');
  });
  it('a live meta page id wins over an earlier name match', () => {
    const r = pickCandidate([c('Glow Dental Co.', { page_id: '1' }), c('Different', { page_id: '777' })], me('Glow Dental Co.', ['777']));
    expect(r?.page_id).toBe('777');
  });
});
