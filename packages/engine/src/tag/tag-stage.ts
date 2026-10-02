import type { Ai } from '@cs/ai';
import {
  capture, captureBlock, changeEvent, client, clientCompetitor, competitor, type Db, decisionReview, detectedChange, eventChange, type NumericChange, trackedPage,
} from '@cs/db';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import { buildTagQuestions, buildTagState, resolveTag } from './questions';

export const TAG_STAGE = 'tag';
export const TAG_VERSION = 1;
const PLATFORM = { agencyId: null, clientId: null } as const;

export type PackLoader = (verticalId: string) => Promise<VerticalPack>;

export function createPackLoader(load: (id: string) => Promise<VerticalPack> = (id) => loadVerticalPack(id)): PackLoader {
  const cache = new Map<string, Promise<VerticalPack>>();
  return (id) => {
    let p = cache.get(id);
    if (!p) {
      p = load(id).catch((err) => {
        cache.delete(id);
        throw err;
      });
      cache.set(id, p);
    }
    return p;
  };
}

/** Verticals of every client tracking the competitor (service mapping is per vertical). */
export async function competitorVerticals(db: Db, competitorId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ verticalId: client.verticalId })
    .from(clientCompetitor)
    .innerJoin(client, eq(client.id, clientCompetitor.clientId))
    .where(eq(clientCompetitor.competitorId, competitorId));
  return rows.map((r) => r.verticalId).sort();
}

/** US ZIP codes in text; not part of a longer number, a price or a phone number. */
export function extractZips(text: string): string[] {
  return [...new Set([...text.matchAll(/(?<![\d$,.-])\b\d{5}\b(?![\d,.-])/g)].map((m) => m[0]))];
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildSummary(change: { kind: string; beforeText: string | null; afterText: string | null; numericChanges: NumericChange[] }, pageUrl: string | null): string {
  let prefix = '';
  if (pageUrl) {
    try {
      prefix = `${new URL(pageUrl).pathname}: `;
    } catch {
      prefix = '';
    }
  }
  const price = change.numericChanges.find((n) => n.kind === 'price' && n.before && n.after);
  if (price) return `${prefix}price changed from ${price.before!.raw} to ${price.after!.raw}${price.pct !== null ? ` (${price.pct > 0 ? '+' : ''}${price.pct}%)` : ''} — "${trunc(change.afterText ?? '', 80)}"`;
  if (change.kind === 'added') return `${prefix}added "${trunc(change.afterText ?? '', 120)}"`;
  if (change.kind === 'removed') return `${prefix}removed "${trunc(change.beforeText ?? '', 120)}"`;
  return `${prefix}"${trunc(change.beforeText ?? '', 80)}" → "${trunc(change.afterText ?? '', 80)}"`;
}

export async function tagChange(deps: { db: Db; ai: Ai; packs: PackLoader }, changeId: string): Promise<StageOutcome<{ eventId: string | null }>> {
  return runStage(
    deps.db,
    { stage: TAG_STAGE, version: TAG_VERSION, subjectId: changeId },
    async () => {
      const [row] = await deps.db
        .select({ change: detectedChange, competitorName: competitor.name, pageUrl: trackedPage.url, pageType: trackedPage.pageType, capturedAt: capture.capturedAt })
        .from(detectedChange)
        .innerJoin(competitor, eq(competitor.id, detectedChange.competitorId))
        .innerJoin(capture, eq(capture.id, detectedChange.afterCaptureId))
        .leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
        .where(eq(detectedChange.id, changeId))
        .limit(1);
      if (!row) throw new Error(`detected_change ${changeId} not found`);
      if (row.change.status !== 'pending') return { row, resolution: null, answers: null, embedding: null };

      const packs = await Promise.all((await competitorVerticals(deps.db, row.change.competitorId)).map(deps.packs));
      const state = buildTagState({
        competitorName: row.competitorName, pageUrl: row.pageUrl, pageType: row.pageType, kind: row.change.kind,
        beforeText: row.change.beforeText, afterText: row.change.afterText, numericChanges: row.change.numericChanges,
      });
      const result = await deps.ai.decide('decisions', state, buildTagQuestions(packs), PLATFORM);
      const resolution = resolveTag(row.change.numericChanges, result, packs);

      const blockCapture = row.change.kind === 'removed' ? row.change.beforeCaptureId : row.change.afterCaptureId;
      let embedding: number[] | null = null;
      if (blockCapture && row.change.blockKey) {
        const [blk] = await deps.db
          .select({ embedding: captureBlock.embedding })
          .from(captureBlock)
          .where(and(eq(captureBlock.captureId, blockCapture), eq(captureBlock.blockKey, row.change.blockKey)))
          .limit(1);
        embedding = blk?.embedding ?? null;
      }
      return { row, resolution, answers: result.answers as Record<string, unknown>, embedding };
    },
    async (tx, { row, resolution, answers, embedding }) => {
      if (!resolution) return { eventId: null };
      // Low-confidence answers still reach the AM review queue (spec §7.3), whether or not they produced an event.
      if (resolution.needsReview.length > 0) {
        await tx.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys: resolution.needsReview, answers: answers ?? {} });
      }
      if (!resolution.meaningful) {
        await tx.update(detectedChange).set({ status: 'cosmetic' }).where(eq(detectedChange.id, changeId));
        return { eventId: null };
      }
      const [ev] = await tx
        .insert(changeEvent)
        .values({
          competitorId: row.change.competitorId, changeType: resolution.type, services: resolution.services, summary: buildSummary(row.change, row.pageUrl),
          facts: row.change.numericChanges, zips: extractZips(row.change.afterText ?? row.change.beforeText ?? ''), embedding,
          confidence: resolution.confidence, needsReview: resolution.needsReview.length > 0, occurredAt: row.capturedAt,
        })
        .returning({ id: changeEvent.id });
      await tx.insert(eventChange).values({ eventId: ev!.id, changeId });
      await tx.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, changeId));
      return { eventId: ev!.id };
    },
  );
}
