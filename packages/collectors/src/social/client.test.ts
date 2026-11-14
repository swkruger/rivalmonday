import type { VendorCallRecord } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { VendorError } from '../vendors/errors';
import { createFixtureFetch } from '../vendors/fixture-fetch';
import fbPosts from './__fixtures__/fb-posts.json';
import fbPrivate from './__fixtures__/fb-profile-private.json';
import fbProfile from './__fixtures__/fb-profile.json';
import igLinktree from './__fixtures__/ig-profile-linktree.json';
import ig from './__fixtures__/ig-profile.json';
import searchFx from './__fixtures__/search-companies.json';
import { makeScClient, scFacebookPosts, scFacebookProfile, scInstagramProfile, scSearchCompanies, type ScContext } from './client';

function setup(...bodies: unknown[]) {
  const records: VendorCallRecord[] = [];
  const queue = [...bodies];
  const fetch = vi.fn(async () => {
    const next = queue.shift();
    return next instanceof Response ? next : new Response(JSON.stringify(next), { status: 200 });
  });
  const ctx: ScContext = {
    apiKey: 'k',
    fetch: fetch as unknown as typeof globalThis.fetch,
    scope: { agencyId: null, clientId: null },
    ledger: {
      recordLlmCall: async () => {},
      recordVendorCall: async (r) => {
        records.push(r);
      },
    },
  };
  const urlOf = (i: number) => new URL((fetch.mock.calls[i] as unknown as [string])[0]);
  return { ctx, records, urlOf };
}

describe('social ScrapeCreators calls', () => {
  it('search: parses rows and ledgers search/companies with units', async () => {
    const { ctx, records, urlOf } = setup(searchFx);
    const rows = await scSearchCompanies(ctx, 'Glow Dental Austin');
    expect(urlOf(0).pathname).toBe('/v1/facebook/adLibrary/search/companies');
    expect(urlOf(0).searchParams.get('query')).toBe('Glow Dental Austin');
    expect(rows[0]).toMatchObject({ page_id: '102926408489125', name: 'Glow Dental Co.', page_alias: 'glowdentalco', ig_username: 'glowdentalco', likes: 1558, ig_followers: 997, category: 'Dentist & Dental Office', page_is_deleted: false });
    expect(records).toEqual([expect.objectContaining({ vendor: 'scrapecreators', operation: 'search/companies', units: 1, costUsd: null, ok: true })]);
  });

  it('search: missing numbers become null, unknown fields ignored', async () => {
    const { ctx } = setup({ success: true, searchResults: [{ page_id: 5, name: 'X', extra: 1 }] });
    expect(await scSearchCompanies(ctx, 'x')).toEqual([{ page_id: '5', name: 'X', page_alias: null, ig_username: null, likes: null, ig_followers: null, category: null, page_is_deleted: null }]);
  });

  it('facebook profile: parses fields; units 0 from credits_charged', async () => {
    const { ctx, records, urlOf } = setup(fbProfile);
    const p = await scFacebookProfile(ctx, 'https://www.facebook.com/glowdentalco');
    expect(p).toEqual({ id: '100064175676130', name: 'Glow Dental Co.', url: 'https://www.facebook.com/glowdentalco', website: 'https://glowdentalco.com/', links: [], followerCount: 1558, likeCount: 1558, category: 'Dentist & Dental Office' });
    expect(urlOf(0).searchParams.get('include_gated_profile')).toBeNull();
    expect(records[0]).toMatchObject({ operation: 'facebook/profile', units: 0, ok: true });
  });

  it('facebook profile: private resolves { private: true }; gated retry sends include_gated_profile', async () => {
    const { ctx, urlOf } = setup(fbPrivate, { ...fbProfile, website: null });
    expect(await scFacebookProfile(ctx, 'https://www.facebook.com/profile.php?id=258279197517396')).toEqual({ private: true });
    const gated = await scFacebookProfile(ctx, 'https://www.facebook.com/profile.php?id=258279197517396', { gated: true });
    expect(urlOf(1).searchParams.get('include_gated_profile')).toBe('true');
    expect(gated).toMatchObject({ followerCount: 1558 });
  });

  it('facebook profile: a public profile whose pageIntro mentions "Profile is private" parses as public', async () => {
    const { ctx } = setup({ ...fbProfile, pageIntro: 'Profile is private? Not here.' });
    expect(await scFacebookProfile(ctx, 'u')).toMatchObject({ id: '100064175676130' });
  });

  it('facebook profile: a "Profile is private" message also means private', async () => {
    const { ctx } = setup({ success: true, message: 'Profile is private' });
    expect(await scFacebookProfile(ctx, 'u')).toEqual({ private: true });
  });

  it('facebook posts: takes the profile id, maps fields, passes the cursor', async () => {
    const { ctx, records, urlOf } = setup(fbPosts);
    const r = await scFacebookPosts(ctx, '100064175676130', 'prev');
    expect(urlOf(0).pathname).toBe('/v1/facebook/profile/posts');
    expect(urlOf(0).searchParams.get('pageId')).toBe('100064175676130');
    expect(urlOf(0).searchParams.get('cursor')).toBe('prev');
    expect(r.posts[0]).toEqual({ id: '1545474220935086', text: null, url: expect.stringContaining('facebook.com/glowdentalco/posts/'), publishTime: 1794441825, reactionCount: 0, commentCount: 0, isVideo: false });
    expect(r.cursor).toEqual(expect.any(String));
    expect(records[0]).toMatchObject({ operation: 'facebook/profile/posts', units: 1 });
  });

  it('facebook posts: terminal empty cursor is null; non-empty videoDetails is a video', async () => {
    const { ctx } = setup({ success: true, cursor: '', posts: [{ id: '1', videoDetails: { length: 3 } }] });
    const r = await scFacebookPosts(ctx, '9');
    expect(r.cursor).toBeNull();
    expect(r.posts[0]).toMatchObject({ id: '1', isVideo: true, text: null, publishTime: null });
  });

  it('instagram: parses profile and posts', async () => {
    const { ctx, records, urlOf } = setup(ig);
    const p = await scInstagramProfile(ctx, 'glowdentalco');
    expect(urlOf(0).searchParams.get('trim')).toBe('true');
    expect(urlOf(0).searchParams.get('handle')).toBe('glowdentalco');
    expect(p).toMatchObject({ handle: 'glowdentalco', followers: 997, postsCount: 297, externalUrl: 'https://glowdentalco.com/', isBusiness: false });
    expect(p?.posts).toHaveLength(12);
    expect(p?.posts[0]).toMatchObject({ id: '4018758026809056983', shortcode: 'DfFfyISNB7X', takenAt: 1793293355, isVideo: true, caption: expect.any(String) });
    expect(records[0]).toMatchObject({ operation: 'instagram/profile', units: 0 });
  });

  it('instagram: a link-hub external url is surfaced as is', async () => {
    const { ctx } = setup(igLinktree);
    expect((await scInstagramProfile(ctx, 'granburyparkdental'))?.externalUrl).toContain('linktr.ee');
  });

  it('instagram: 403 and 404 resolve null, other failures throw; every call is ledgered', async () => {
    const { ctx, records } = setup(new Response('{}', { status: 404 }), new Response('{}', { status: 403 }), new Response('{}', { status: 500 }));
    expect(await scInstagramProfile(ctx, 'a')).toBeNull();
    expect(await scInstagramProfile(ctx, 'b')).toBeNull();
    await expect(scInstagramProfile(ctx, 'c')).rejects.toBeInstanceOf(VendorError);
    expect(records).toHaveLength(3);
    expect(records.every((r) => !r.ok)).toBe(true);
  });

  it('the fixture fetch serves the four paths and makeScClient binds them', async () => {
    const records: VendorCallRecord[] = [];
    const sc = makeScClient({
      apiKey: 'k',
      fetch: createFixtureFetch({ latencyMs: () => 0 }),
      scope: { agencyId: null, clientId: null },
      ledger: {
        recordLlmCall: async () => {},
        recordVendorCall: async (r) => {
          records.push(r);
        },
      },
    });
    expect((await sc.searchCompanies('Glow Dental'))[0]?.name).toBe('Glow Dental Co.');
    expect(await sc.facebookProfile('https://www.facebook.com/glowdentalco')).toMatchObject({ id: '100064175676130' });
    expect(await sc.facebookProfile('https://www.facebook.com/private-x')).toEqual({ private: true });
    expect((await sc.facebookPosts('100064175676130')).cursor).toBeNull();
    expect((await sc.instagramProfile('glowdentalco'))?.posts).toHaveLength(12);
    expect(await sc.instagramProfile('missing-handle')).toBeNull();
    expect(records).toHaveLength(6);
  });
});
