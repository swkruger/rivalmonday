import type { Ai } from '@cs/ai';
import { GBP_POSTS_URL, redactForModel, sha256Hex } from '@cs/collectors';
import { capture, clientCompetitor, competitor, type Db, gbpPost, priceBlockMap, pricePoint, stageRun } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, inArray, isNotNull, isNull, max, ne } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import { competitorVerticals, type PackLoader } from '../tag/tag-stage';
import { type PriceObservation, pricesInBlock } from './observe';
import { mapPricedTexts, MAX_STATE_TEXT, type PriceBlockMapRow, type PriceRunResult } from './price-stage';

export const POST_PRICE_STAGE = 'post_price_extract';
export const POST_PRICE_VERSION = 1;
/** Deploy cutoff (D5): only posts captures from this date are priced — no past-dated spans, no backlog model spend. Merge re-checks the deploy date. */
export const POST_PRICE_SINCE = new Date('2026-11-17T00:00:00Z');
/** At most this many priced posts are mapped per capture; the rest are skipped (and logged). */
export const POST_PRICE_MAX = 20;

type Observed = PriceObservation & { postId: string; verticalId: string; serviceId: string };

/**
 * Prices in the text of the Google posts one posts capture lists → service-mapped `price_point` spans with `gbp_post_id`
 * (pattern `extractAdPrices`, Meta path: rules on the raw text, the web stage's block map and question, redacted model
 * state and stored context). A listed live post without an open span is priced; one with a span advances it. There are no
 * vendor offer dates: spans end when the post is ended (the collector ends posts a non-empty capture no longer lists, never
 * on an empty one). An older capture than the newest processed one is a no-op. No `price_change` events.
 */
export async function extractPostPrices(deps: { db: Db; store: ObjectStore; ai: Ai; packs: PackLoader }, captureId: string): Promise<StageOutcome<PriceRunResult>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!cap || cap.source !== 'google_business_profile' || cap.url !== GBP_POSTS_URL || cap.status !== 'ok') throw new Error(`capture ${captureId} is not an ok Google posts capture`);
  return runStage(
    deps.db,
    { stage: POST_PRICE_STAGE, version: POST_PRICE_VERSION, subjectId: captureId },
    async () => {
      const skip = (skipped: string) => ({ skipped, observations: [] as Observed[], maps: [] as PriceBlockMapRow[], seenPostIds: [] as string[] });
      if (cap.capturedAt < POST_PRICE_SINCE) return skip('capture predates post pricing');
      // A client's own business (self competitor, in no client_competitor row) is never priced; `competitorVerticals` would include its vertical.
      const [tracked] = await deps.db.select({ id: clientCompetitor.competitorId }).from(clientCompetitor).where(eq(clientCompetitor.competitorId, cap.competitorId)).limit(1);
      const verticalIds = tracked ? await competitorVerticals(deps.db, cap.competitorId) : [];
      if (verticalIds.length === 0) return skip('no client tracks this competitor');
      const [newest] = await deps.db
        .select({ at: max(capture.capturedAt) })
        .from(capture)
        .innerJoin(stageRun, and(eq(stageRun.subjectId, capture.id), eq(stageRun.stage, POST_PRICE_STAGE), eq(stageRun.stageVersion, POST_PRICE_VERSION), eq(stageRun.status, 'done')))
        .where(and(eq(capture.competitorId, cap.competitorId), eq(capture.source, 'google_business_profile'), eq(capture.url, GBP_POSTS_URL), ne(capture.id, captureId)));
      if (newest?.at && newest.at > cap.capturedAt) return skip('a newer posts capture was already processed');

      const listed = await deps.db
        .select({ id: gbpPost.id, text: gbpPost.text })
        .from(gbpPost)
        .where(and(eq(gbpPost.competitorId, cap.competitorId), eq(gbpPost.lastCaptureId, captureId), isNull(gbpPost.endedAt)));
      const open = listed.length > 0
        ? new Set((await deps.db.selectDistinct({ postId: pricePoint.gbpPostId }).from(pricePoint).where(and(inArray(pricePoint.gbpPostId, listed.map((p) => p.id)), isNull(pricePoint.endedAt)))).map((p) => p.postId))
        : new Set<string | null>();

      const [comp] = await deps.db.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, cap.competitorId)).limit(1);
      const names = [comp?.name ?? null];
      const priced = listed
        .filter((p): p is { id: string; text: string } => p.text !== null && p.text.trim().length > 0 && !open.has(p.id))
        .map((p) => ({ p, obs: pricesInBlock(p.text) }))
        .filter((x) => x.obs.length > 0);
      if (priced.length > POST_PRICE_MAX) console.warn(`[engine] posts capture ${captureId} lists ${priced.length} priced posts; mapping the first ${POST_PRICE_MAX}`);
      const posts = priced.slice(0, POST_PRICE_MAX).map((x) => ({ ...x, sha: sha256Hex(x.p.text) }));

      const { mapped, maps } = await mapPricedTexts(deps, verticalIds, posts.map((x) => ({
        sha: x.sha,
        state: () => ({ competitor: comp?.name ?? null, post_text: redactForModel(x.p.text, { businessNames: names }).slice(0, MAX_STATE_TEXT), source: 'gbp_post' }),
      })));
      const observations: Observed[] = posts.flatMap(({ p, sha, obs }) =>
        verticalIds.flatMap((verticalId) => {
          const serviceId = mapped.get(`${sha}|${verticalId}`) ?? null;
          return serviceId ? obs.map((o) => ({ ...o, postId: p.id, verticalId, serviceId, context: redactForModel(o.context, { businessNames: names }) })) : [];
        }),
      );
      return { skipped: undefined as string | undefined, observations, maps, seenPostIds: listed.filter((p) => open.has(p.id)).map((p) => p.id) };
    },
    async (tx, c) => {
      if (c.maps.length > 0) await tx.insert(priceBlockMap).values(c.maps).onConflictDoNothing();
      if (c.skipped) return { points: 0, ended: 0, skipped: c.skipped };
      if (c.seenPostIds.length > 0) {
        await tx.update(pricePoint).set({ lastSeenAt: cap.capturedAt, lastCaptureId: cap.id }).where(and(inArray(pricePoint.gbpPostId, c.seenPostIds), isNull(pricePoint.endedAt)));
      }
      let points = 0;
      if (c.observations.length > 0) {
        const written = await tx
          .insert(pricePoint)
          .values(c.observations.map((o) => ({
            competitorId: cap.competitorId, trackedPageId: null, adId: null, gbpPostId: o.postId, verticalId: o.verticalId, serviceId: o.serviceId, amount: o.amount, unit: o.unit, qualifier: o.qualifier,
            promo: o.promo, raw: o.raw, context: o.context, firstSeenAt: cap.capturedAt, lastSeenAt: cap.capturedAt, firstCaptureId: cap.id, lastCaptureId: cap.id,
          })))
          // A repeat of the same price in one post hits price_point_post_open_unique; one span is enough.
          .onConflictDoNothing()
          .returning({ id: pricePoint.id });
        points = written.length;
      }
      // Posts the collector ended (by this capture, or an earlier one whose spans were not yet closed) end their spans.
      const endedPosts = await tx.select({ id: gbpPost.id }).from(gbpPost).where(and(eq(gbpPost.competitorId, cap.competitorId), isNotNull(gbpPost.endedAt)));
      const ended = endedPosts.length > 0
        ? (await tx.update(pricePoint).set({ endedAt: cap.capturedAt, endedCaptureId: cap.id }).where(and(inArray(pricePoint.gbpPostId, endedPosts.map((p) => p.id)), isNull(pricePoint.endedAt))).returning({ id: pricePoint.id })).length
        : 0;
      return { points, ended };
    },
  );
}
