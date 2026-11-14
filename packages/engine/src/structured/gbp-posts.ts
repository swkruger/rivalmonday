import { GBP_POSTS_URL } from '@cs/collectors';
import { capture, client, clientCompetitor, type Db, evidence, gbpPost, observation } from '@cs/db';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { PROMO, pricesInBlock } from '../prices/observe';
import type { SourceDiffer, StructuredChange } from './vendor-diff';

/** D8: a post dated more than this many days before the capture never makes an event (late-listed old posts). */
export const POST_MAX_AGE_DAYS = 21;
/** More new posts than this in one capture: the newest become single changes, the rest one `gbp_post:more` aggregate. */
export const POST_MAX_SINGLE = 5;
const DAY_MS = 86_400_000;
const AFTER_TEXT_MAX = 300;

interface PostData { text?: string | null; url?: string | null; postedAt?: string | null }

/** D4: an offer post names a price or matches the promo wording (no vendor offer marker exists). */
export const isOfferPost = (text: string): boolean => pricesInBlock(text).length > 0 || PROMO.test(text);

/** A competitor no client tracks but some client owns as its own business: self posts make no events (D3). */
export async function isSelfOnly(db: Parameters<SourceDiffer>[0], competitorId: string): Promise<boolean> {
  const [tracked] = await db.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.competitorId, competitorId)).limit(1);
  if (tracked) return false;
  const [own] = await db.select({ id: client.id }).from(client).where(eq(client.selfCompetitorId, competitorId)).limit(1);
  return !!own;
}

/** New Google posts in this capture (spec § Differ). New = a key no earlier posts capture of this competitor listed. */
export const diffGbpPosts: SourceDiffer = async (db, cap) => {
  const current = await db
    .select({ key: observation.key, data: observation.data })
    .from(observation)
    .where(and(eq(observation.captureId, cap.id), eq(observation.kind, 'gbp_post')));
  if (current.length === 0) return [];
  if (await isSelfOnly(db, cap.competitorId)) return [];
  const seen = await db
    .selectDistinct({ key: observation.key })
    .from(observation)
    .innerJoin(capture, eq(capture.id, observation.captureId))
    .where(
      and(
        eq(observation.competitorId, cap.competitorId), eq(observation.kind, 'gbp_post'), inArray(observation.key, current.map((c) => c.key)),
        eq(capture.source, 'google_business_profile'), eq(capture.url, GBP_POSTS_URL), eq(capture.status, 'ok'), lt(capture.capturedAt, cap.capturedAt),
      ),
    );
  const known = new Set(seen.map((s) => s.key));
  const cutoff = cap.capturedAt.getTime() - POST_MAX_AGE_DAYS * DAY_MS;
  const fresh = current
    .map((c) => {
      const d = c.data as PostData;
      const at = d.postedAt ? new Date(d.postedAt).getTime() : NaN;
      return { key: c.key, d, at: Number.isNaN(at) ? null : at };
    })
    .filter((p) => !known.has(p.key) && (p.at === null || p.at >= cutoff))
    // Newest first; an undated post counts as seen at the capture.
    .sort((a, b) => (b.at ?? cap.capturedAt.getTime()) - (a.at ?? cap.capturedAt.getTime()) || a.key.localeCompare(b.key));
  const changes: StructuredChange[] = fresh.slice(0, POST_MAX_SINGLE).map((p) => {
    const text = (p.d.text ?? '').trim();
    const offer = isOfferPost(text);
    return {
      kind: 'added',
      blockKey: `gbp_post:${p.key}`,
      beforeText: null,
      afterText: text.slice(0, AFTER_TEXT_MAX),
      details: { changeType: offer ? 'promo' : 'content', field: 'post', postId: p.key, offer, url: p.d.url ?? null },
    };
  });
  if (fresh.length > POST_MAX_SINGLE) {
    changes.push({
      kind: 'added', blockKey: 'gbp_post:more', beforeText: null, afterText: null,
      details: { changeType: 'content', field: 'post', count: fresh.length - POST_MAX_SINGLE },
    });
  }
  return changes;
};

/**
 * Scorecard (D9): Google posts a business made in the last 30 days (`coalesce(posted_at, first_seen_at)`; ended posts still count,
 * they were posted). `null` = no ok posts capture yet for that business ("not checked", never 0).
 */
export async function postCounts30d(db: Db, competitorIds: string[], now: Date): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(competitorIds.map((id) => [id, null]));
  if (competitorIds.length === 0) return out;
  const checked = await db
    .selectDistinct({ id: capture.competitorId })
    .from(capture)
    .where(and(inArray(capture.competitorId, competitorIds), eq(capture.source, 'google_business_profile'), eq(capture.url, GBP_POSTS_URL), eq(capture.status, 'ok')));
  for (const c of checked) out.set(c.id, 0);
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const when = sql`coalesce(${gbpPost.postedAt}, ${gbpPost.firstSeenAt})`;
  const counts = await db
    .select({ id: gbpPost.competitorId, n: sql<number>`count(*)::int` })
    .from(gbpPost)
    .where(and(inArray(gbpPost.competitorId, competitorIds), sql`${when} >= ${since.toISOString()}::timestamptz`))
    .groupBy(gbpPost.competitorId);
  for (const c of counts) if (out.get(c.id) !== null) out.set(c.id, Number(c.n));
  return out;
}

/** The newest ok posts capture's evidence id per business (no evidence, no claim). */
export async function postsEvidenceIds(db: Db, competitorIds: string[]): Promise<string[]> {
  if (competitorIds.length === 0) return [];
  const rows = await db
    .select({ competitorId: capture.competitorId, id: evidence.id })
    .from(evidence)
    .innerJoin(capture, eq(capture.id, evidence.captureId))
    .where(and(inArray(capture.competitorId, competitorIds), eq(capture.source, 'google_business_profile'), eq(capture.url, GBP_POSTS_URL), eq(capture.status, 'ok')))
    .orderBy(desc(capture.capturedAt), evidence.id);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of rows) if (!seen.has(r.competitorId)) { seen.add(r.competitorId); ids.push(r.id); }
  return ids;
}
