import { socialCaptureUrl } from '@cs/collectors';
import { capture, type Db, detectedChange, evidence, observation, type SocialNetwork, socialAccount, socialPost } from '@cs/db';
import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { isOfferPost, isSelfOnly, POST_MAX_AGE_DAYS, POST_MAX_SINGLE } from './gbp-posts';
import { AUDIENCE_COOLDOWN_DAYS, AUDIENCE_WINDOW_DAYS, audienceGrowth } from './meta-page';
import type { CaptureRow, SourceDiffer, StructuredChange } from './vendor-diff';

/** P4: cadence windows. `started` = >= 3 posts in the last 14 d and none in the 30 d before those; `quiet` = none in 30 d and >= 4 in the 30 d before. */
export const CADENCE_RECENT_DAYS = 14;
export const CADENCE_WINDOW_DAYS = 30;
export const CADENCE_STARTED_MIN = 3;
export const CADENCE_QUIET_PRIOR_MIN = 4;
/** One cadence change per account and kind in this many days. */
export const CADENCE_COOLDOWN_DAYS = 30;
const DAY_MS = 86_400_000;
const AFTER_TEXT_MAX = 300;

export type SocialPostRow = typeof socialPost.$inferSelect;
export type ConfirmedSocialPost = SocialPostRow & { accountId: string };

/**
 * Posts of each competitor's currently confirmed accounts, posted since `since`. `social_post` has no account column, so a post
 * counts only when the capture that first saw it is that account's (`capture.url` = `socialCaptureUrl`): a rejected account's posts never count.
 */
export async function socialPostsOfConfirmedAccounts(db: Db, competitorIds: string[], since: Date): Promise<ConfirmedSocialPost[]> {
  if (competitorIds.length === 0) return [];
  const rows = await db
    .select({ post: socialPost, captureUrl: capture.url, handle: socialAccount.handle, externalId: socialAccount.externalId })
    .from(socialPost)
    .innerJoin(capture, eq(capture.id, socialPost.firstCaptureId))
    .innerJoin(
      socialAccount,
      and(eq(socialAccount.competitorId, socialPost.competitorId), eq(socialAccount.network, socialPost.network), eq(socialAccount.status, 'confirmed')),
    )
    .where(and(inArray(socialPost.competitorId, competitorIds), gte(socialPost.postedAt, since)));
  return rows.flatMap((r) => {
    const url = socialCaptureUrl({ network: r.post.network, handle: r.handle, externalId: r.externalId });
    return r.captureUrl === url ? [{ ...r.post, accountId: url.slice(`social:${r.post.network}:`.length) }] : [];
  });
}

export type Cadence = 'started' | 'quiet';

/** The posting rhythm at `now` from posts dated at or before it (P4), or null when neither flip applies. */
export function socialCadence(posts: readonly { postedAt: Date }[], now: Date): Cadence | null {
  const t = now.getTime();
  const ages = posts.map((p) => (t - p.postedAt.getTime()) / DAY_MS).filter((a) => a >= 0);
  const count = (from: number, to: number) => ages.filter((a) => a >= from && a < to).length;
  if (count(0, CADENCE_RECENT_DAYS) >= CADENCE_STARTED_MIN && count(CADENCE_RECENT_DAYS, CADENCE_RECENT_DAYS + CADENCE_WINDOW_DAYS) === 0) return 'started';
  if (count(0, CADENCE_WINDOW_DAYS) === 0 && count(CADENCE_WINDOW_DAYS, 2 * CADENCE_WINDOW_DAYS) >= CADENCE_QUIET_PRIOR_MIN) return 'quiet';
  return null;
}

export interface SocialDiffCtx {
  competitorId: string;
  network: SocialNetwork;
  capture: CaptureRow;
  /** Null = the account's first processed capture: a silent baseline. */
  prevCapture: CaptureRow | null;
  /** The capture before `prevCapture`, when one exists (a cadence change fires on the flip, not while a state persists). */
  olderCapture?: CaptureRow | null;
  /** Every stored post of this competitor and network. */
  posts: SocialPostRow[];
  accountId: string;
  /** Followers read on `capture`, when the profile read gave a number. */
  followers: number | null;
  followersHistory: { at: Date; followers: number; captureId?: string }[];
  /** Earlier social changes of this competitor and network (cooldowns). */
  priorChanges: { blockKey: string | null; detectedAt: Date }[];
}

const label = (n: SocialNetwork) => (n === 'instagram' ? 'Instagram' : 'Facebook');

/** Social captures -> brief-only changes: new offer posts, follower growth, started posting / went quiet. Pure; the first capture is a baseline. */
export function diffSocial(ctx: SocialDiffCtx): StructuredChange[] {
  const { capture: cap, prevCapture: prev, network } = ctx;
  if (!prev) return [];
  const at = cap.capturedAt.getTime();
  const out: StructuredChange[] = [];

  // New offer posts: rows first seen in this capture, not older than 21 days at first sight. Non-offers make no change; extras beyond 5 are dropped.
  const cutoff = at - POST_MAX_AGE_DAYS * DAY_MS;
  const offers = ctx.posts
    .filter((p) => p.firstCaptureId === cap.id && p.postedAt.getTime() >= cutoff && isOfferPost(p.text))
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime() || a.postId.localeCompare(b.postId))
    .slice(0, POST_MAX_SINGLE);
  for (const p of offers) {
    out.push({
      kind: 'added', blockKey: `social:${network}:post:${p.postId}`, beforeText: null, afterText: p.text.trim().slice(0, AFTER_TEXT_MAX),
      details: { changeType: 'promo', surface: 'social', network, postId: p.postId, url: p.url },
    });
  }

  // Followers: the Meta likes rule (+15 % and +50 over ~28 d, <= 100 %), once per 28 d per account.
  if (ctx.followers !== null) {
    const g = audienceGrowth(ctx.followers, ctx.followersHistory.map((h) => ({ at: h.at, value: h.followers, captureId: h.captureId })), at);
    const key = `social:${network}:followers:${ctx.accountId}`;
    const cooling = ctx.priorChanges.some((c) => c.blockKey === key && c.detectedAt.getTime() >= at - AUDIENCE_COOLDOWN_DAYS * DAY_MS);
    if (g.outcome === 'growth' && !cooling) {
      out.push({
        kind: 'modified', blockKey: key, beforeText: `${label(network)} followers: ${g.before}`, afterText: `${label(network)} followers: ${ctx.followers}`,
        details: {
          changeType: 'audience_growth', surface: 'social', network, followers: ctx.followers, previous: g.before, pct: g.pct,
          window: Math.round((at - g.base.at.getTime()) / DAY_MS),
        },
        ...(g.base.captureId ? { beforeCaptureId: g.base.captureId } : {}),
      });
    }
  }

  // Cadence: the same state on this and the previous pull, a flip from the pull before that (none = baseline, silent), and no change of the kind in 30 days.
  const state = socialCadence(ctx.posts, cap.capturedAt);
  if (state && socialCadence(ctx.posts, prev.capturedAt) === state && !!ctx.olderCapture && socialCadence(ctx.posts, ctx.olderCapture.capturedAt) !== state) {
    const key = `social:${network}:cadence:${state}:${ctx.accountId}`;
    if (!ctx.priorChanges.some((c) => c.blockKey === key && c.detectedAt.getTime() >= at - CADENCE_COOLDOWN_DAYS * DAY_MS)) {
      out.push({ kind: 'added', blockKey: key, beforeText: null, afterText: null, details: { changeType: 'content', surface: 'social', network, cadence: state } });
    }
  }
  return out;
}

const NETWORKS = new Set<string>(['facebook', 'instagram']);

/** `DIFFERS['social']`: reads the capture's account (`social:<network>:<id>`), its posts and follower readings, then `diffSocial`. */
export const diffSocialCapture: SourceDiffer = async (db, cap, prev, older) => {
  const network = /^social:([a-z]+):/.exec(cap.url ?? '')?.[1];
  if (!network || !NETWORKS.has(network)) return [];
  const net = network as SocialNetwork;
  if (await isSelfOnly(db, cap.competitorId)) return [];
  const [profile] = await db
    .select({ key: observation.key, data: observation.data })
    .from(observation)
    .where(and(eq(observation.captureId, cap.id), eq(observation.kind, 'social_profile')))
    .limit(1);
  const accountId = profile ? profile.key.slice(net.length + 1) : (cap.url ?? '').slice(`social:${net}:`.length);
  const f = profile?.data.followers;
  const followers = typeof f === 'number' && Number.isFinite(f) ? f : null;
  const at = cap.capturedAt.getTime();
  // Cadence needs up to 60 d before the older capture (+ its ~7 d gap); bound the read.
  const posts = (await socialPostsOfConfirmedAccounts(db, [cap.competitorId], new Date(at - 120 * DAY_MS))).filter((p) => p.network === net && p.accountId === accountId);
  const history = profile
    ? await db
        .select({ data: observation.data, captureId: observation.captureId, observedAt: observation.observedAt })
        .from(observation)
        .where(
          and(
            eq(observation.competitorId, cap.competitorId), eq(observation.kind, 'social_profile'), eq(observation.key, profile.key),
            gte(observation.observedAt, new Date(at - AUDIENCE_WINDOW_DAYS[1] * DAY_MS)), ne(observation.captureId, cap.id),
          ),
        )
    : [];
  const followersHistory = history.flatMap((r) => (typeof r.data.followers === 'number' ? [{ at: r.observedAt, followers: r.data.followers, captureId: r.captureId }] : []));
  const priorChanges = await db
    .select({ blockKey: detectedChange.blockKey, detectedAt: detectedChange.detectedAt })
    .from(detectedChange)
    .where(
      and(
        eq(detectedChange.competitorId, cap.competitorId), eq(detectedChange.source, 'social'), ne(detectedChange.status, 'superseded'),
        ne(detectedChange.afterCaptureId, cap.id), sql`${detectedChange.blockKey} LIKE ${`social:${net}:%`}`,
      ),
    );
  return diffSocial({
    competitorId: cap.competitorId, network: net, capture: cap, prevCapture: prev, olderCapture: older[0] ?? null,
    posts, accountId, followers, followersHistory, priorChanges,
  });
};

const SCORECARD_DAYS = 30;

/**
 * Scorecard `socialPosts30d` and `social_gap` (18e P7): posts of each business's currently confirmed accounts posted in the last 30 days.
 * `null` = no confirmed account (never 0); a confirmed account with no recent post is 0. Suggested and rejected accounts never count.
 */
export async function socialPostCounts30d(db: Db, competitorIds: string[], now: Date): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(competitorIds.map((id) => [id, null]));
  if (competitorIds.length === 0) return out;
  const confirmed = await db.selectDistinct({ id: socialAccount.competitorId }).from(socialAccount)
    .where(and(inArray(socialAccount.competitorId, competitorIds), eq(socialAccount.status, 'confirmed')));
  for (const c of confirmed) out.set(c.id, 0);
  const posts = await socialPostsOfConfirmedAccounts(db, competitorIds, new Date(now.getTime() - SCORECARD_DAYS * DAY_MS));
  for (const p of posts) out.set(p.competitorId, (out.get(p.competitorId) ?? 0) + 1);
  return out;
}

/** The evidence ids of each business's newest ok social capture per account (they list the counted posts; no evidence, no claim), keyed by competitor. */
export async function socialEvidenceByCompetitor(db: Db, competitorIds: string[]): Promise<Record<string, string[]>> {
  if (competitorIds.length === 0) return {};
  const rows = await db
    .selectDistinctOn([capture.competitorId, capture.url], { competitorId: capture.competitorId, id: evidence.id })
    .from(evidence)
    .innerJoin(capture, eq(capture.id, evidence.captureId))
    .where(and(inArray(capture.competitorId, competitorIds), eq(capture.source, 'social'), eq(capture.status, 'ok')))
    .orderBy(capture.competitorId, capture.url, desc(capture.capturedAt), asc(evidence.kind), asc(evidence.id));
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.competitorId] ??= []).push(r.id);
  return out;
}
