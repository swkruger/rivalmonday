import type { Ai } from '@cs/ai';
import type { AdMediaDeps } from '@cs/collectors';
import type { Db } from '@cs/db';
import type { VerticalPack } from '@cs/verticals';
import type { ObjectStore } from '@cs/storage';
import { readAdImage } from './ads/image-read-stage';
import { triageAdImage } from './ads/image-triage-stage';
import { diffCapture } from './diff';
import { extractAdPrices } from './prices/ad-price-stage';
import { extractPostPrices } from './prices/post-price-stage';
import { extractPrices } from './prices/price-stage';
import { analyzeReview, reaskReview } from './reviews/topics';
import { scoreEvent } from './score/score-stage';
import { diffRankScan } from './structured/rank';
import { findEngineWork } from './sweep';
import { type PackLoader, tagChange } from './tag/tag-stage';
import { detectSiteFeatures } from './web/site-feature-stage';
import { detectListedEvents } from './listed-events/stage';

export interface DrainResult {
  diffs: number;
  changes: number;
  tagged: number;
  events: number;
  scored: number;
  rankDiffs: number;
  reviews: number;
  prices: number;
  /** Meta captures whose ad-copy prices were extracted (D5). */
  adPrices: number;
  postPrices: number;
  /** Web captures whose website tools were confirmed (18a-2 D4). */
  siteFeatures: number;
  /** Older reviews re-asked at least one missing question (15b-3b §5). */
  reasked: number;
  /** Ad images triaged (18a-3 D3); runs only with `adMedia` and `opts.adImages`. */
  adImages: number;
  /** Stored price images read by the vision model (D5). */
  adImageReads: number;
  errors: number;
}

/** Runs the engine inline until no work is left (CLI and tests); the worker uses jobs instead. */
export async function drainEngine(
  deps: { db: Db; store: ObjectStore; ai: Ai; packs: PackLoader; generic: () => Promise<VerticalPack>; adMedia?: AdMediaDeps },
  /** `adImages` (P12): the caller's `WEB_MONITORING_ENABLED === 'true'`; the image lists also need `deps.adMedia`. */
  opts: { competitorId?: string; limit?: number; maxRounds?: number; adImages?: boolean; adImageSince?: Date } = {},
): Promise<DrainResult> {
  const r: DrainResult = { diffs: 0, changes: 0, tagged: 0, events: 0, scored: 0, rankDiffs: 0, reviews: 0, prices: 0, adPrices: 0, postPrices: 0, siteFeatures: 0, reasked: 0, adImages: 0, adImageReads: 0, errors: 0 };
  const adMedia = deps.adMedia;
  const adImages = Boolean(opts.adImages && adMedia);
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      r.errors++;
      console.error(`[engine] ${what} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  for (let round = 0; round < (opts.maxRounds ?? 10); round++) {
    const work = await findEngineWork(deps.db, { limit: opts.limit ?? 100, competitorId: opts.competitorId, adImages, adImageSince: opts.adImageSince });
    const total = work.diff.length + work.tag.length + work.score.length + work.rankDiff.length + work.reviews.length + work.prices.length + work.adPrices.length + work.postPrices.length + work.siteFeatures.length + work.listedEvents.length
      + work.reask.length + work.adImages.length + work.adImageReads.length;
    if (total === 0) break;
    for (const id of work.diff) {
      await attempt(`diff ${id}`, async () => {
        const o = await diffCapture(deps, id);
        if (o.ran) {
          r.diffs++;
          r.changes += o.changeIds.length;
        }
      });
    }
    for (const id of work.tag) {
      await attempt(`tag ${id}`, async () => {
        const o = await tagChange(deps, id);
        if (o.ran) {
          r.tagged++;
          if (o.result.eventId) r.events++;
        }
      });
    }
    for (const id of work.score) {
      await attempt(`score ${id}`, async () => {
        const o = await scoreEvent(deps, id);
        r.scored += o.scored;
        r.errors += o.failed;
      });
    }
    for (const id of work.rankDiff) {
      await attempt(`rank diff ${id}`, async () => {
        const o = await diffRankScan(deps, id);
        if (o.ran) {
          r.rankDiffs++;
          r.changes += o.result.changeIds.length;
        }
      });
    }
    for (const id of work.reviews) {
      await attempt(`review ${id}`, async () => {
        if ((await analyzeReview(deps, id)).ran) r.reviews++;
      });
    }
    for (const id of work.prices) {
      await attempt(`prices ${id}`, async () => {
        if ((await extractPrices(deps, id)).ran) r.prices++;
      });
    }
    for (const id of work.adPrices) {
      await attempt(`ad prices ${id}`, async () => {
        if ((await extractAdPrices(deps, id)).ran) r.adPrices++;
      });
    }
    for (const id of work.postPrices) {
      await attempt(`post prices ${id}`, async () => {
        if ((await extractPostPrices(deps, id)).ran) r.postPrices++;
      });
    }
    for (const id of work.siteFeatures) {
      await attempt(`site features ${id}`, async () => {
        const o = await detectSiteFeatures(deps, id);
        if (o.ran) {
          r.siteFeatures++;
          r.changes += o.result.changes.length;
        }
      });
    }
    for (const id of work.listedEvents) {
      await attempt(`listed events ${id}`, async () => {
        const o = await detectListedEvents(deps, id);
        if (o.ran) r.changes += o.result.changes.length;
      });
    }
    for (const id of work.reask) {
      await attempt(`reask ${id}`, async () => {
        if ((await reaskReview(deps, id)).questions > 0) r.reasked++;
      });
    }
    if (adMedia) {
      for (const id of work.adImages) {
        await attempt(`ad image ${id}`, async () => {
          if ((await triageAdImage({ ...deps, media: adMedia }, id)).status === 'ran') r.adImages++;
        });
      }
      for (const id of work.adImageReads) {
        await attempt(`ad image read ${id}`, async () => {
          if ((await readAdImage(deps, id)).status === 'ran') r.adImageReads++;
        });
      }
    }
  }
  return r;
}
