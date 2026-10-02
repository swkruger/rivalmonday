import type { Ai, DecisionQuestion } from '@cs/ai';
import { redactForModel } from '@cs/collectors';
import { capture, competitor, type Db, priceBlockMap, pricePoint, stageRun, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import type { VerticalPack } from '@cs/verticals';
import { and, eq, inArray, isNull, max, ne } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import { serviceQuestionKey } from '../tag/questions';
import { competitorVerticals, type PackLoader } from '../tag/tag-stage';
import { ensureBlocks, loadBlocks } from '../web/blocks';
import { type PriceObservation, pricesInBlock } from './observe';

export const PRICE_STAGE = 'price_extract';
export const PRICE_VERSION = 1;
/** A page with more priced blocks than this is a catalogue; the rest are skipped (and logged). */
export const PRICE_MAX_BLOCKS = 40;
const MAX_STATE_TEXT = 1500;
const PLATFORM = { agencyId: null, clientId: null } as const;

/** One Choice per vertical: which service is priced in this block ("none" for fees, bundles, general prices). */
export function buildPriceQuestions(packs: VerticalPack[]): Record<string, DecisionQuestion> {
  return Object.fromEntries(
    packs.map((p) => [
      serviceQuestionKey(p.id),
      {
        type: 'choice',
        instructions: `Which ${p.name} service is priced in this text? Answer "none" if the price is not for one specific service (a fee, a bundle, a membership of several services, or general).`,
        options: { none: 'No single service', ...Object.fromEntries(p.services.map((s) => [s.id, s.aliases.length > 0 ? `${s.name} (${s.aliases.join(', ')})` : s.name])) },
      } satisfies DecisionQuestion,
    ]),
  );
}

export interface PriceRunResult {
  points: number;
  ended: number;
  skipped?: string;
}

type Observed = PriceObservation & { verticalId: string; serviceId: string };
const keyOf = (o: { verticalId: string; serviceId: string; unit: string; qualifier: string; amount: number }) => `${o.verticalId}|${o.serviceId}|${o.unit}|${o.qualifier}|${o.amount}`;

/**
 * Spec §6.6: the priced blocks of one web capture → service-mapped `price_point` spans. A block text is mapped to a
 * service once (price_block_map); a price missing from a later capture of the page is ended; an older capture
 * than the page's newest observation is a no-op (decision 11).
 */
export async function extractPrices(deps: { db: Db; store: ObjectStore; ai: Ai; packs: PackLoader }, captureId: string): Promise<StageOutcome<PriceRunResult>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!cap || cap.source !== 'web' || cap.status !== 'ok' || !cap.trackedPageId) throw new Error(`capture ${captureId} is not an ok web page capture`);
  const pageId = cap.trackedPageId;
  return runStage(
    deps.db,
    { stage: PRICE_STAGE, version: PRICE_VERSION, subjectId: captureId },
    async () => {
      const maps: (typeof priceBlockMap.$inferInsert)[] = [];
      const skip = (skipped: string) => ({ skipped, observations: [] as Observed[], maps, truncated: false });
      const verticalIds = await competitorVerticals(deps.db, cap.competitorId);
      if (verticalIds.length === 0) return skip('no client tracks this competitor');
      // The watermark is the newest capture of this page whose price_extract run is done — not the newest
      // price_point.last_seen_at, which a capture that ends spans without observing anything new (a blank
      // pricing section, or every block mapped to "no service") never advances, letting a later-arriving
      // older capture slip past and reopen prices the newest capture already ended.
      const [newest] = await deps.db
        .select({ at: max(capture.capturedAt) })
        .from(capture)
        .innerJoin(stageRun, and(eq(stageRun.subjectId, capture.id), eq(stageRun.stage, PRICE_STAGE), eq(stageRun.stageVersion, PRICE_VERSION), eq(stageRun.status, 'done')))
        .where(and(eq(capture.trackedPageId, pageId), ne(capture.id, captureId)));
      if (newest?.at && newest.at > cap.capturedAt) return skip('a newer capture of this page was already processed');
      if ((await ensureBlocks(deps, captureId)) === 'busy') throw new Error(`blocks of capture ${captureId} are being extracted`);

      const priced = (await loadBlocks(deps.db, captureId)).map((b) => ({ b, obs: pricesInBlock(b.text) })).filter((x) => x.obs.length > 0);
      const truncated = priced.length > PRICE_MAX_BLOCKS;
      if (truncated) console.warn(`[engine] capture ${captureId} has ${priced.length} priced blocks; mapping the first ${PRICE_MAX_BLOCKS}`);
      const blocks = priced.slice(0, PRICE_MAX_BLOCKS);
      const shas = [...new Set(blocks.map((x) => x.b.textSha))];
      const known = shas.length > 0
        ? await deps.db.select().from(priceBlockMap).where(and(inArray(priceBlockMap.textSha, shas), inArray(priceBlockMap.verticalId, verticalIds)))
        : [];
      const mapped = new Map<string, string | null>(known.map((m) => [`${m.textSha}|${m.verticalId}`, m.serviceId]));
      const [comp] = await deps.db.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, cap.competitorId)).limit(1);
      const [page] = await deps.db.select({ url: trackedPage.url, pageType: trackedPage.pageType }).from(trackedPage).where(eq(trackedPage.id, pageId)).limit(1);
      const names = [comp?.name ?? null];

      for (const { b, obs } of blocks) {
        const missing = verticalIds.filter((v) => !mapped.has(`${b.textSha}|${v}`));
        if (missing.length === 0) continue;
        const packs = await Promise.all(missing.map(deps.packs));
        const state = {
          competitor: comp?.name ?? null, page_url: page?.url ?? cap.url, page_type: page?.pageType ?? null,
          text: redactForModel(b.text, { businessNames: names }).slice(0, MAX_STATE_TEXT), prices: obs.map((o) => o.raw),
        };
        const result = await deps.ai.decide('price_decisions', state, buildPriceQuestions(packs), PLATFORM);
        const low = new Set(result.needsReview);
        for (const p of packs) {
          const k = serviceQuestionKey(p.id);
          const v = result.answers[k]?.value;
          const serviceId = !low.has(k) && typeof v === 'string' && p.services.some((s) => s.id === v) ? v : null;
          mapped.set(`${b.textSha}|${p.id}`, serviceId);
          maps.push({ textSha: b.textSha, verticalId: p.id, serviceId, confidence: result.answers[k]?.confidence ?? 0, needsReview: low.has(k) });
        }
      }

      const observations: Observed[] = blocks.flatMap(({ b, obs }) =>
        verticalIds.flatMap((verticalId) => {
          const serviceId = mapped.get(`${b.textSha}|${verticalId}`) ?? null;
          return serviceId ? obs.map((o) => ({ ...o, verticalId, serviceId, context: redactForModel(o.context, { businessNames: names }) })) : [];
        }),
      );
      return { skipped: undefined as string | undefined, observations, maps, truncated };
    },
    async (tx, c) => {
      if (c.maps.length > 0) await tx.insert(priceBlockMap).values(c.maps).onConflictDoNothing();
      if (c.skipped) return { points: 0, ended: 0, skipped: c.skipped };
      const open = await tx.select().from(pricePoint).where(and(eq(pricePoint.trackedPageId, pageId), isNull(pricePoint.endedAt)));
      const openByKey = new Map(open.map((p) => [keyOf(p), p]));
      const seen = new Set<string>();
      let points = 0;
      for (const o of c.observations) {
        const k = keyOf(o);
        if (seen.has(k)) continue;
        seen.add(k);
        const existing = openByKey.get(k);
        if (existing) {
          await tx.update(pricePoint).set({ lastSeenAt: cap.capturedAt, lastCaptureId: cap.id, promo: o.promo, raw: o.raw, context: o.context }).where(eq(pricePoint.id, existing.id));
        } else {
          await tx.insert(pricePoint).values({
            competitorId: cap.competitorId, trackedPageId: pageId, verticalId: o.verticalId, serviceId: o.serviceId, amount: o.amount, unit: o.unit, qualifier: o.qualifier,
            promo: o.promo, raw: o.raw, context: o.context, firstSeenAt: cap.capturedAt, lastSeenAt: cap.capturedAt, firstCaptureId: cap.id, lastCaptureId: cap.id,
          });
          points++;
        }
      }
      // A truncated capture only ever saw the first PRICE_MAX_BLOCKS priced blocks, so a span whose block
      // wasn't among them must not be ended here — it was never actually observed as missing.
      let ended = 0;
      if (!c.truncated) {
        for (const p of open) {
          if (seen.has(keyOf(p))) continue;
          await tx.update(pricePoint).set({ endedAt: cap.capturedAt, endedCaptureId: cap.id }).where(eq(pricePoint.id, p.id));
          ended++;
        }
      }
      return { points, ended };
    },
  );
}
