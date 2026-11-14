import type { CallScope } from '@cs/core';
import { z } from 'zod';
import { VendorError } from '../vendors/errors';
import { scRequest, type ScrapeCreatorsOpts } from '../vendors/scrapecreators';

export type ScContext = ScrapeCreatorsOpts & { scope: CallScope };

const num = z.number().nullable().catch(null);
const str = z.string().nullable().catch(null);
const bool = z.boolean().nullable().catch(null);
const idStr = z.union([z.string(), z.number()]).transform(String);

const company = z.object({
  page_id: idStr,
  name: str,
  page_alias: str,
  ig_username: str,
  likes: num,
  ig_followers: num,
  category: str,
  page_is_deleted: bool,
});
export type ScCompany = z.infer<typeof company>;

const fbProfile = z.object({
  id: idStr,
  name: str,
  url: str,
  website: str,
  links: z.array(z.unknown()).catch([]).transform((l) => l.filter((x): x is string => typeof x === 'string')),
  followerCount: num,
  likeCount: num,
  category: str,
});
export type ScFbProfile = z.infer<typeof fbProfile>;

const fbPost = z
  .object({
    id: idStr,
    text: str,
    url: str,
    publishTime: num,
    reactionCount: num,
    commentCount: num,
    videoDetails: z.record(z.string(), z.unknown()).nullish().catch(null),
  })
  .transform(({ videoDetails, ...p }) => ({ ...p, isVideo: !!videoDetails && Object.keys(videoDetails).length > 0 }));
export type ScFbPost = z.infer<typeof fbPost>;

const igNode = z.object({
  id: idStr,
  shortcode: str,
  taken_at_timestamp: num,
  is_video: bool,
  edge_media_to_caption: z.object({ edges: z.array(z.object({ node: z.object({ text: str }) })).catch([]) }).nullish().catch(null),
});
const igUser = z.object({
  username: str,
  external_url: str,
  is_business_account: bool,
  edge_followed_by: z.object({ count: num }).nullish().catch(null),
  edge_owner_to_timeline_media: z.object({ count: num, edges: z.array(z.object({ node: igNode })).catch([]) }).nullish().catch(null),
});
export interface ScIgProfile {
  handle: string;
  followers: number | null;
  postsCount: number | null;
  externalUrl: string | null;
  isBusiness: boolean;
  posts: { id: string; shortcode: string | null; takenAt: number | null; caption: string | null; isVideo: boolean }[];
}

const bad = (): never => {
  throw new VendorError('scrapecreators', null, 'Unexpected ScrapeCreators body', false);
};

export async function scSearchCompanies(ctx: ScContext, q: string): Promise<ScCompany[]> {
  const { body } = await scRequest(ctx, '/v1/facebook/adLibrary/search/companies', { query: q }, 'search/companies', ctx.scope, (b) => {
    if (!Array.isArray(b.searchResults)) bad();
  });
  return (body.searchResults as unknown[]).flatMap((r) => {
    const p = company.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

const isPrivateBody = (b: Record<string, unknown>): boolean => b.isPrivate === true || JSON.stringify(b).includes('Profile is private');

/** `gated` retries with `include_gated_profile=true` (followers only). A private profile without it resolves `{ private: true }`. */
export async function scFacebookProfile(ctx: ScContext, url: string, opts: { gated?: boolean } = {}): Promise<ScFbProfile | { private: true }> {
  const query: Record<string, string> = { url };
  if (opts.gated) query.include_gated_profile = 'true';
  const { body } = await scRequest(ctx, '/v1/facebook/profile', query, 'facebook/profile', ctx.scope);
  if (isPrivateBody(body) && !opts.gated) return { private: true };
  const p = fbProfile.safeParse(body);
  if (!p.success) return isPrivateBody(body) ? { private: true } : bad();
  return p.data;
}

/** `profileId` is the Facebook profile `id` (not the ad-library `page_id`). */
export async function scFacebookPosts(ctx: ScContext, profileId: string, cursor?: string): Promise<{ posts: ScFbPost[]; cursor: string | null }> {
  const query: Record<string, string> = { pageId: profileId };
  if (cursor) query.cursor = cursor;
  const res = await scRequest(ctx, '/v1/facebook/profile/posts', query, 'facebook/profile/posts', ctx.scope, (b) => {
    if (!Array.isArray(b.posts)) bad();
  });
  const posts = (res.body.posts as unknown[]).flatMap((r) => {
    const p = fbPost.safeParse(r);
    return p.success ? [p.data] : [];
  });
  return { posts, cursor: res.cursor };
}

/** 403/404 (private, missing or banned handle) resolve `null`. */
export async function scInstagramProfile(ctx: ScContext, handle: string): Promise<ScIgProfile | null> {
  let body: Record<string, unknown>;
  try {
    ({ body } = await scRequest(ctx, '/v1/instagram/profile', { handle, trim: 'true' }, 'instagram/profile', ctx.scope));
  } catch (err) {
    if (err instanceof VendorError && (err.code === 403 || err.code === 404)) return null;
    throw err;
  }
  const u = igUser.safeParse((body.data as { user?: unknown } | undefined)?.user);
  if (!u.success) return null;
  const user = u.data;
  return {
    handle: user.username ?? handle,
    followers: user.edge_followed_by?.count ?? null,
    postsCount: user.edge_owner_to_timeline_media?.count ?? null,
    externalUrl: user.external_url ?? null,
    isBusiness: user.is_business_account === true,
    posts: (user.edge_owner_to_timeline_media?.edges ?? []).map(({ node }) => ({
      id: node.id,
      shortcode: node.shortcode,
      takenAt: node.taken_at_timestamp,
      isVideo: node.is_video === true,
      caption: node.edge_media_to_caption?.edges[0]?.node.text ?? null,
    })),
  };
}

export interface ScClient {
  searchCompanies(q: string): Promise<ScCompany[]>;
  facebookProfile(url: string, opts?: { gated?: boolean }): Promise<ScFbProfile | { private: true }>;
  facebookPosts(profileId: string, cursor?: string): Promise<{ posts: ScFbPost[]; cursor: string | null }>;
  instagramProfile(handle: string): Promise<ScIgProfile | null>;
}

/** The four calls bound to one key, ledger and scope. */
export function makeScClient(ctx: ScContext): ScClient {
  return {
    searchCompanies: (q) => scSearchCompanies(ctx, q),
    facebookProfile: (url, opts) => scFacebookProfile(ctx, url, opts),
    facebookPosts: (id, cursor) => scFacebookPosts(ctx, id, cursor),
    instagramProfile: (h) => scInstagramProfile(ctx, h),
  };
}
