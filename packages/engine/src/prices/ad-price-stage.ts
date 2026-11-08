import type { Ai } from '@cs/ai';
import { loadVendorCaptureItems, normalizeMetaAd, redactForModel, sha256Hex } from '@cs/collectors';
import { ad, capture, competitor, type Db, priceBlockMap, pricePoint, stageRun } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, eq, inArray, isNull, max, ne } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import { competitorVerticals, type PackLoader } from '../tag/tag-stage';
import { type PriceObservation, pricesInBlock } from './observe';
import { mapPricedTexts, MAX_STATE_TEXT, type PriceBlockMapRow, type PriceRunResult } from './price-stage';

export const AD_PRICE_STAGE = 'ad_price_extract';
export const AD_PRICE_VERSION = 1;
/** Deploy cutoff (D5): only Meta captures from this date are priced — no past-dated spans, no backlog model spend. */
export const AD_PRICE_SINCE = new Date('2026-11-08T00:00:00Z');
/** At most this many priced ads are mapped per capture; the rest are skipped (and logged). */
export const AD_PRICE_MAX_ADS = 40;

type Observed = PriceObservation & { adId: string; verticalId: string; serviceId: string };

/**
 * D5: prices in the copy of the Meta ads one capture lists → service-mapped `price_point` spans with `ad_id`
 * (rules only, `pricesInBlock`; the block map and question are the web stage's). A listed ad without an open span
 * is priced (new or returned ads); a listed ad with one advances it; an ad this capture ended ends its spans.
 * An older capture than the page's newest processed one is a no-op. No `price_change` events.
 */
export async function extractAdPrices(deps: { db: Db; store: ObjectStore; ai: Ai; packs: PackLoader }, captureId: string): Promise<StageOutcome<PriceRunResult>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!cap || cap.source !== 'meta_ads' || cap.status !== 'ok') throw new Error(`capture ${captureId} is not an ok meta_ads capture`);
  return runStage(
    deps.db,
    { stage: AD_PRICE_STAGE, version: AD_PRICE_VERSION, subjectId: captureId },
    async () => {
      const skip = (skipped: string) => ({ skipped, observations: [] as Observed[], maps: [] as PriceBlockMapRow[], seenAdIds: [] as string[] });
      const verticalIds = await competitorVerticals(deps.db, cap.competitorId);
      if (verticalIds.length === 0) return skip('no client tracks this competitor');
      // Watermark (pattern extractPrices): the newest capture of this Meta page whose run is done.
      const samePage = cap.url === null ? isNull(capture.url) : eq(capture.url, cap.url);
      const [newest] = await deps.db
        .select({ at: max(capture.capturedAt) })
        .from(capture)
        .innerJoin(stageRun, and(eq(stageRun.subjectId, capture.id), eq(stageRun.stage, AD_PRICE_STAGE), eq(stageRun.stageVersion, AD_PRICE_VERSION), eq(stageRun.status, 'done')))
        .where(and(eq(capture.competitorId, cap.competitorId), eq(capture.source, 'meta_ads'), samePage, ne(capture.id, captureId)));
      if (newest?.at && newest.at > cap.capturedAt) return skip('a newer capture of this Meta page was already processed');

      const items = (await loadVendorCaptureItems(deps, captureId)) ?? [];
      const externalIds = [...new Set(items.map(normalizeMetaAd).filter((a) => a !== null).map((a) => a.externalId))];
      const listed = externalIds.length > 0
        ? await deps.db.select({ id: ad.id, text: ad.text }).from(ad).where(and(eq(ad.competitorId, cap.competitorId), eq(ad.platform, 'meta'), inArray(ad.externalId, externalIds)))
        : [];
      const open = listed.length > 0
        ? new Set((await deps.db.selectDistinct({ adId: pricePoint.adId }).from(pricePoint).where(and(inArray(pricePoint.adId, listed.map((a) => a.id)), isNull(pricePoint.endedAt)))).map((p) => p.adId))
        : new Set<string | null>();

      const [comp] = await deps.db.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, cap.competitorId)).limit(1);
      const names = [comp?.name ?? null];
      const priced = listed
        .filter((a): a is { id: string; text: string } => a.text !== null && a.text.trim().length > 0 && !open.has(a.id))
        .map((a) => {
          const redacted = redactForModel(a.text, { businessNames: names });
          return { a, redacted, obs: pricesInBlock(redacted) };
        })
        .filter((x) => x.obs.length > 0);
      if (priced.length > AD_PRICE_MAX_ADS) console.warn(`[engine] meta capture ${captureId} lists ${priced.length} priced ads; mapping the first ${AD_PRICE_MAX_ADS}`);
      const ads = priced.slice(0, AD_PRICE_MAX_ADS).map((x) => ({ ...x, sha: sha256Hex(x.a.text) }));

      const { mapped, maps } = await mapPricedTexts(deps, verticalIds, ads.map((x) => ({
        sha: x.sha,
        state: () => ({ competitor: comp?.name ?? null, ad_text: x.redacted.slice(0, MAX_STATE_TEXT), source: 'meta_ad' }),
      })));
      const observations: Observed[] = ads.flatMap(({ a, sha, obs }) =>
        verticalIds.flatMap((verticalId) => {
          const serviceId = mapped.get(`${sha}|${verticalId}`) ?? null;
          return serviceId ? obs.map((o) => ({ ...o, adId: a.id, verticalId, serviceId })) : [];
        }),
      );
      return { skipped: undefined as string | undefined, observations, maps, seenAdIds: listed.filter((a) => open.has(a.id)).map((a) => a.id) };
    },
    async (tx, c) => {
      if (c.maps.length > 0) await tx.insert(priceBlockMap).values(c.maps).onConflictDoNothing();
      if (c.skipped) return { points: 0, ended: 0, skipped: c.skipped };
      if (c.seenAdIds.length > 0) {
        await tx.update(pricePoint).set({ lastSeenAt: cap.capturedAt, lastCaptureId: cap.id }).where(and(inArray(pricePoint.adId, c.seenAdIds), isNull(pricePoint.endedAt)));
      }
      let points = 0;
      if (c.observations.length > 0) {
        const written = await tx
          .insert(pricePoint)
          .values(c.observations.map((o) => ({
            competitorId: cap.competitorId, trackedPageId: null, adId: o.adId, verticalId: o.verticalId, serviceId: o.serviceId, amount: o.amount, unit: o.unit, qualifier: o.qualifier,
            promo: o.promo, raw: o.raw, context: o.context, firstSeenAt: cap.capturedAt, lastSeenAt: cap.capturedAt, firstCaptureId: cap.id, lastCaptureId: cap.id,
          })))
          // A repeat of the same price in one ad hits price_point_ad_open_unique; one span is enough.
          .onConflictDoNothing()
          .returning({ id: pricePoint.id });
        points = written.length;
      }
      const endedAds = await tx.select({ id: ad.id }).from(ad).where(and(eq(ad.competitorId, cap.competitorId), eq(ad.platform, 'meta'), eq(ad.endedCaptureId, cap.id)));
      const ended = endedAds.length > 0
        ? (await tx.update(pricePoint).set({ endedAt: cap.capturedAt, endedCaptureId: cap.id }).where(and(inArray(pricePoint.adId, endedAds.map((a) => a.id)), isNull(pricePoint.endedAt))).returning({ id: pricePoint.id })).length
        : 0;
      return { points, ended };
    },
  );
}
