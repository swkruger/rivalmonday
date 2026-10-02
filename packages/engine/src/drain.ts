import type { Ai } from '@cs/ai';
import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { diffCapture } from './diff';
import { extractPrices } from './prices/price-stage';
import { analyzeReview } from './reviews/themes';
import { scoreEvent } from './score/score-stage';
import { diffRankScan } from './structured/rank';
import { findEngineWork } from './sweep';
import { type PackLoader, tagChange } from './tag/tag-stage';

export interface DrainResult {
  diffs: number;
  changes: number;
  tagged: number;
  events: number;
  scored: number;
  rankDiffs: number;
  reviews: number;
  prices: number;
  errors: number;
}

/** Runs the engine inline until no work is left (CLI and tests); the worker uses jobs instead. */
export async function drainEngine(
  deps: { db: Db; store: ObjectStore; ai: Ai; packs: PackLoader },
  opts: { competitorId?: string; limit?: number; maxRounds?: number } = {},
): Promise<DrainResult> {
  const r: DrainResult = { diffs: 0, changes: 0, tagged: 0, events: 0, scored: 0, rankDiffs: 0, reviews: 0, prices: 0, errors: 0 };
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      r.errors++;
      console.error(`[engine] ${what} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  for (let round = 0; round < (opts.maxRounds ?? 10); round++) {
    const work = await findEngineWork(deps.db, { limit: opts.limit ?? 100, competitorId: opts.competitorId });
    if (work.diff.length + work.tag.length + work.score.length + work.rankDiff.length + work.reviews.length + work.prices.length === 0) break;
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
  }
  return r;
}
