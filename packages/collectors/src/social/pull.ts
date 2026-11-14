import { type Db, observation, socialAccount, socialPost } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { recordVendorCapture } from '../evidence/vendor-capture';
import type { ScClient, ScFbPost } from './client';

export const SOCIAL_COLLECTOR_VERSION = 'social/1';
/** FB posts come 3 per page; stop after this many pages even when nothing stored was reached. */
export const FB_MAX_PAGES = 3;

type Account = typeof socialAccount.$inferSelect;
interface NewPost {
  postId: string;
  postedAt: Date;
  text: string;
  url: string;
  isVideo: boolean;
  reactions: number | null;
  comments: number | null;
}
interface Pulled {
  profile: Record<string, unknown>;
  followers: number | null;
  likes?: number | null;
  postsCount?: number | null;
  posts: NewPost[];
  rawPosts: unknown[];
  gated?: boolean;
}

export interface PullDeps {
  db: Db;
  store: ObjectStore;
  sc: ScClient;
  now?: () => Date;
}

/** Facebook: profile (gated retry when private), then new posts until a stored one, an older one, or 3 pages. */
async function pullFacebook(deps: PullDeps, a: Account, tick: () => void): Promise<Pulled> {
  let gated = a.gated;
  tick();
  let p = await deps.sc.facebookProfile(a.url, gated ? { gated: true } : undefined);
  if ('private' in p) {
    gated = true;
    tick();
    p = await deps.sc.facebookProfile(a.url, { gated: true });
    if ('private' in p) throw new Error('Facebook profile private even with the gated retry');
  }
  // The profile id is only for the posts call; the account identity everywhere else is `social_account.id`.
  const profileId = a.externalId ?? p.id;
  const base = { profile: p as unknown as Record<string, unknown>, followers: p.followerCount, likes: p.likeCount };
  if (gated) return { ...base, posts: [], rawPosts: [], gated: true };

  const [newest] = await deps.db
    .select({ postedAt: socialPost.postedAt })
    .from(socialPost)
    .where(and(eq(socialPost.competitorId, a.competitorId), eq(socialPost.network, 'facebook')))
    .orderBy(desc(socialPost.postedAt))
    .limit(1);
  const newestMs = newest?.postedAt.getTime() ?? null;

  const fresh: ScFbPost[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < FB_MAX_PAGES; page++) {
    tick();
    const res = await deps.sc.facebookPosts(profileId, cursor);
    const stored = new Set(
      res.posts.length
        ? (
            await deps.db
              .select({ id: socialPost.postId })
              .from(socialPost)
              .where(and(eq(socialPost.network, 'facebook'), inArray(socialPost.postId, res.posts.map((x) => x.id))))
          ).map((r) => r.id)
        : [],
    );
    // The first post of page 1 may be pinned (old): it is inserted when new but never ends the walk.
    let stop = false;
    for (const [i, post] of res.posts.entries()) {
      const older = newestMs !== null && post.publishTime !== null && post.publishTime * 1000 < newestMs;
      const known = stored.has(post.id) || older;
      if (!known) fresh.push(post);
      else if (!(page === 0 && i === 0)) {
        stop = true;
        break;
      }
    }
    if (stop || !res.cursor || res.posts.length === 0) break;
    cursor = res.cursor;
  }
  const posts = fresh.flatMap((x): NewPost[] =>
    x.publishTime === null
      ? []
      : [{ postId: x.id, postedAt: new Date(x.publishTime * 1000), text: x.text ?? '', url: x.url ?? a.url, isVideo: x.isVideo, reactions: x.reactionCount, comments: x.commentCount }],
  );
  return { ...base, posts, rawPosts: fresh };
}

/** Instagram: profile with its (up to 12) recent posts. */
async function pullInstagram(deps: PullDeps, a: Account, tick: () => void): Promise<Pulled> {
  tick();
  const p = await deps.sc.instagramProfile(a.handle);
  if (!p) throw new Error('Instagram profile unavailable (private, missing or banned)');
  const posts = p.posts.flatMap((x): NewPost[] =>
    x.takenAt === null
      ? []
      : [
          {
            postId: x.id,
            postedAt: new Date(x.takenAt * 1000),
            text: x.caption ?? '',
            url: x.shortcode ? `https://www.instagram.com/p/${x.shortcode}/` : a.url,
            isVideo: x.isVideo,
            reactions: null,
            comments: null,
          },
        ],
  );
  const { posts: rawPosts, ...profile } = p;
  return { profile, followers: p.followers, postsCount: p.postsCount, posts, rawPosts };
}

/** The capture url of an account (one history per account): `social:facebook:<external_id or handle>` / `social:instagram:<handle>`. */
export const socialCaptureUrl = (a: { network: string; handle: string; externalId?: string | null }): string =>
  `social:${a.network}:${a.network === 'facebook' ? (a.externalId ?? a.handle) : a.handle}`;

/** The key of an account's `social_profile` observations: `<network>:<social_account.id>` (one identity, whatever the capture url uses). */
export const socialProfileKey = (a: { network: string; id: string }): string => `${a.network}:${a.id}`;

/** Weekly pull of one competitor's confirmed accounts: one `vendor_json` capture per account, new `social_post` rows, one `social_profile` observation. */
export async function pullSocial(deps: PullDeps, competitorId: string): Promise<{ captures: string[]; credits: number }> {
  const now = deps.now ?? (() => new Date());
  const accounts = await deps.db
    .select()
    .from(socialAccount)
    .where(and(eq(socialAccount.competitorId, competitorId), eq(socialAccount.status, 'confirmed')));
  const captures: string[] = [];
  let credits = 0;

  for (const a of accounts) {
    const url = socialCaptureUrl(a);
    const base = { competitorId, source: 'social', collectorVersion: SOCIAL_COLLECTOR_VERSION, url };
    const calls = { n: 0 };
    let pulled: Pulled | null = null;
    let failure: string | null = null;
    try {
      const tick = () => void calls.n++;
      pulled = a.network === 'facebook' ? await pullFacebook(deps, a, tick) : await pullInstagram(deps, a, tick);
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }
    credits += calls.n;
    try {
      if (!pulled) {
        const rec = await recordVendorCapture(deps, { ...base, status: 'vendor_error', error: failure });
        captures.push(rec.captureId);
        continue;
      }
      const pl = pulled;
      const rec = await recordVendorCapture(deps, {
        ...base,
        status: 'ok',
        payload: { network: a.network, accountId: a.id, profile: pl.profile, posts: pl.rawPosts },
      });
      captures.push(rec.captureId);
      const at = now();
      await deps.db.transaction(async (tx) => {
        if (pl.posts.length) {
          await tx
            .insert(socialPost)
            .values(pl.posts.map((p) => ({ ...p, competitorId, network: a.network, firstCaptureId: rec.captureId, firstSeenAt: at })))
            .onConflictDoNothing({ target: [socialPost.network, socialPost.postId] });
        }
        const data: Record<string, unknown> = { network: a.network, accountId: a.id, followers: pl.followers };
        if (pl.likes != null) data.likes = pl.likes;
        if (pl.postsCount != null) data.postsCount = pl.postsCount;
        await tx
          .insert(observation)
          .values({ competitorId, captureId: rec.captureId, kind: 'social_profile', key: socialProfileKey(a), data, observedAt: at });
        await tx
          .update(socialAccount)
          .set({ lastPulledAt: at, ...(pl.gated ? { gated: true } : {}) })
          .where(eq(socialAccount.id, a.id));
      });
    } catch (err) {
      console.warn(`social: db write failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { captures, credits };
}
