import type { Ai } from '@cs/ai';
import { redactContactInfo } from '@cs/collectors';
import {
  capture, captureBlock, client, clientCompetitor, competitor, type Db, decisionReview, detectedChange, type NumericChange, trackedPage,
} from '@cs/db';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { MONEY_KINDS } from '../facts/numeric';
import { findMergeTarget, writeEvent } from '../merge/merge';
import { runStage, type StageOutcome } from '../stage';
import { buildTagQuestions, buildTagState, resolveTag } from './questions';
import { tagStructuredChange } from './structured';

export const TAG_STAGE = 'tag';
export const TAG_VERSION = 1;
const PLATFORM = { agencyId: null, clientId: null } as const;

export interface TagOutcome {
  eventId: string | null;
  /** True when the change was attached to an existing event (cross-channel merge, Task 11). */
  merged: boolean;
}

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

/**
 * A web change is an offer (feeds promo blitz / price war) when it is a promo, cuts a price or percent, or
 * newly states one. A price rise is still a meaningful price change, but it is not a promotion.
 */
export function isWebOffer(type: string, facts: NumericChange[]): boolean {
  if (type === 'promo') return true;
  return facts.some((n) => MONEY_KINDS.has(n.kind) && ((n.pct !== null && n.pct < 0) || (n.before === null && n.after !== null)));
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One-line event summary. Built from redacted text: summaries are later sent to models (Phase 4), evidence stays verbatim. */
export function buildSummary(change: { kind: string; beforeText: string | null; afterText: string | null; numericChanges: NumericChange[] }, pageUrl: string | null): string {
  const beforeText = change.beforeText === null ? null : redactContactInfo(change.beforeText);
  const afterText = change.afterText === null ? null : redactContactInfo(change.afterText);
  let prefix = '';
  if (pageUrl) {
    try {
      prefix = `${new URL(pageUrl).pathname}: `;
    } catch {
      prefix = '';
    }
  }
  const price = change.numericChanges.find((n) => n.kind === 'price' && n.before && n.after);
  if (price) return `${prefix}price changed from ${price.before!.raw} to ${price.after!.raw}${price.pct !== null ? ` (${price.pct > 0 ? '+' : ''}${price.pct}%)` : ''} — "${trunc(afterText ?? '', 80)}"`;
  if (change.kind === 'added') return `${prefix}added "${trunc(afterText ?? '', 120)}"`;
  if (change.kind === 'removed') return `${prefix}removed "${trunc(beforeText ?? '', 120)}"`;
  return `${prefix}"${trunc(beforeText ?? '', 80)}" → "${trunc(afterText ?? '', 80)}"`;
}

export async function tagChange(deps: { db: Db; ai: Ai; packs: PackLoader }, changeId: string): Promise<StageOutcome<TagOutcome>> {
  const [head] = await deps.db.select({ source: detectedChange.source }).from(detectedChange).where(eq(detectedChange.id, changeId)).limit(1);
  if (!head) throw new Error(`detected_change ${changeId} not found`);
  if (head.source !== 'web') return tagStructuredChange(deps, changeId);
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
      if (row.change.status !== 'pending') return { row, resolution: null, answers: null, embedding: null, summary: '', target: null };

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
      const summary = buildSummary(row.change, row.pageUrl);
      const target = resolution.meaningful
        ? await findMergeTarget(deps, {
            competitorId: row.change.competitorId, clientId: null, captureId: row.change.afterCaptureId, changeType: resolution.type, services: resolution.services, facts: row.change.numericChanges,
            embedding, occurredAt: row.capturedAt, text: row.change.afterText ?? row.change.beforeText ?? '',
          })
        : null;
      return { row, resolution, answers: result.answers as Record<string, unknown>, embedding, summary, target };
    },
    async (tx, { row, resolution, answers, embedding, summary, target }) => {
      if (!resolution) return { eventId: null, merged: false };
      // Low-confidence answers still reach the AM review queue (spec §7.3), whether or not they produced an event.
      if (resolution.needsReview.length > 0) {
        await tx.insert(decisionReview).values({ subjectType: 'detected_change', subjectId: changeId, keys: resolution.needsReview, answers: answers ?? {} });
      }
      if (!resolution.meaningful) {
        await tx.update(detectedChange).set({ status: 'cosmetic' }).where(eq(detectedChange.id, changeId));
        return { eventId: null, merged: false };
      }
      const eventId = await writeEvent(
        tx,
        changeId,
        {
          competitorId: row.change.competitorId, changeType: resolution.type, channels: ['web'], services: resolution.services, summary,
          facts: row.change.numericChanges, details: { offer: isWebOffer(resolution.type, row.change.numericChanges) },
          zips: extractZips(row.change.afterText ?? row.change.beforeText ?? ''), embedding, confidence: resolution.confidence,
          needsReview: resolution.needsReview.length > 0, occurredAt: row.capturedAt,
        },
        target,
      );
      await tx.update(detectedChange).set({ status: 'event' }).where(eq(detectedChange.id, changeId));
      return { eventId, merged: target !== null };
    },
  );
}
