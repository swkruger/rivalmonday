import type { Ai } from '@cs/ai';
import { redactForModel } from '@cs/collectors';
import { capture, captureBlock, competitor, type Db, detectedChange, type NumericChange } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, desc, eq, lt } from 'drizzle-orm';
import { diffFacts, extractFacts, type FactExtractor, llmFactExtractor, MONEY_KINDS } from '../facts/numeric';
import { runStage, type StageOutcome } from '../stage';
import { type Alignment, alignBlocks } from './align';
import { ensureBlocks, loadBlocks, type StoredBlock } from './blocks';
import { learnVolatileBlocks, maskedBlockKeys } from './volatile';

export const WEB_DIFF_STAGE = 'web_diff';
export const WEB_DIFF_VERSION = 1;
/** Below this cosine a modified block is a semantic change. Live 2026-10-01: punctuation 0.996, "$89→$69" 0.969. */
export const SEMANTIC_THRESHOLD = 0.95;
/** Shorter added/removed blocks ("New!", "Menu") are noise unless they carry a number. */
export const MIN_STRUCTURAL_CHARS = 20;
/**
 * Whole-page churn guard: when added + removed blocks reach CHURN_RATIO of the larger capture and at
 * least CHURN_MIN_CANDIDATES changes pass the gate (a redesign or a half-rendered page), only money
 * changes are kept, so a single capture cannot fan out into hundreds of paid tag decisions.
 */
export const CHURN_RATIO = 0.5;
export const CHURN_MIN_CANDIDATES = 20;
const PLATFORM = { agencyId: null, clientId: null } as const;

export type ChangeFlag = 'semantic' | 'numeric' | 'structural' | 'masked';

export interface EngineDeps {
  db: Db;
  store: ObjectStore;
  ai: Ai;
}

export interface DiffResult {
  baseline: boolean;
  changeIds: string[];
  masked: number;
  newlyMasked: string[];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return a.every((x, i) => x === b[i]) ? 1 : 0;
  return dot / Math.sqrt(na * nb);
}

/** Spec §6.1 gate: which aligned blocks become detected changes. Money changes are never masked. */
export function gateChange(a: Alignment<StoredBlock>, numeric: NumericChange[], similarity: number | null, masked: Set<string>): ChangeFlag[] | null {
  if (a.kind === 'unchanged') return null;
  const money = numeric.some((n) => MONEY_KINDS.has(n.kind));
  if (a.kind === 'modified' && a.before!.blockKey === a.after!.blockKey && masked.has(a.before!.blockKey)) {
    return money ? ['numeric', 'masked'] : null;
  }
  const flags: ChangeFlag[] = [];
  if (numeric.length > 0) flags.push('numeric');
  if (a.kind === 'modified') {
    if (similarity !== null && similarity < SEMANTIC_THRESHOLD) flags.push('semantic');
  } else if ((a.after ?? a.before)!.text.length >= MIN_STRUCTURAL_CHARS) {
    flags.push('structural');
  }
  return flags.length > 0 ? flags : null;
}

interface Candidate {
  alignment: Alignment<StoredBlock>;
  numeric: NumericChange[];
  similarity: number | null;
  flags: ChangeFlag[];
}

export async function diffWebCapture(deps: EngineDeps, captureId: string, opts: { factFallback?: FactExtractor } = {}): Promise<StageOutcome<DiffResult>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  if (!cap || cap.source !== 'web' || cap.status !== 'ok' || !cap.trackedPageId) throw new Error(`capture ${captureId} is not an ok web page capture`);
  const pageId = cap.trackedPageId;
  const fallback = opts.factFallback ?? llmFactExtractor(deps.ai, PLATFORM);

  const outcome = await runStage(
    deps.db,
    { stage: WEB_DIFF_STAGE, version: WEB_DIFF_VERSION, subjectId: captureId },
    async () => {
      if ((await ensureBlocks(deps, captureId)) === 'busy') throw new Error(`blocks of capture ${captureId} are being extracted`);
      const [comp] = await deps.db.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, cap.competitorId)).limit(1);
      const [prev] = await deps.db
        .select({ id: capture.id })
        .from(capture)
        .where(and(eq(capture.trackedPageId, pageId), eq(capture.source, 'web'), eq(capture.status, 'ok'), lt(capture.capturedAt, cap.capturedAt)))
        .orderBy(desc(capture.capturedAt))
        .limit(1);
      if (!prev) return { prevId: null, candidates: [] as Candidate[], masked: 0, embedded: [] as StoredBlock[] };
      if ((await ensureBlocks(deps, prev.id)) === 'busy') throw new Error(`blocks of capture ${prev.id} are being extracted`);

      const [before, after, maskedKeys] = await Promise.all([loadBlocks(deps.db, prev.id), loadBlocks(deps.db, captureId), maskedBlockKeys(deps.db, pageId)]);
      const alignments = alignBlocks(before, after).filter((a) => a.kind !== 'unchanged');

      // Embed (redacted) every involved block that has no stored embedding yet.
      const need = new Map<string, StoredBlock>();
      for (const a of alignments) for (const b of [a.before, a.after]) if (b && !b.embedding) need.set(b.id, b);
      const embedded = [...need.values()];
      const { vectors } = await deps.ai.embed('embeddings', embedded.map((b) => redactForModel(b.text, { businessNames: [comp?.name] })), PLATFORM);
      embedded.forEach((b, i) => {
        b.embedding = vectors[i]!;
      });

      let candidates: Candidate[] = [];
      let masked = 0;
      for (const a of alignments) {
        const numeric = diffFacts(a.before ? await extractFacts(a.before.text, fallback) : [], a.after ? await extractFacts(a.after.text, fallback) : []);
        const similarity = a.kind === 'modified' ? cosine(a.before!.embedding!, a.after!.embedding!) : null;
        const flags = gateChange(a, numeric, similarity, maskedKeys);
        if (flags) candidates.push({ alignment: a, numeric, similarity, flags });
        else if (a.kind === 'modified' && maskedKeys.has(a.before!.blockKey)) masked++;
      }
      const structural = alignments.filter((a) => a.kind === 'added' || a.kind === 'removed').length;
      if (structural >= CHURN_RATIO * Math.max(before.length, after.length) && candidates.length >= CHURN_MIN_CANDIDATES) {
        const total = candidates.length;
        candidates = candidates.filter((c) => c.numeric.some((n) => MONEY_KINDS.has(n.kind)));
        console.warn(
          `[engine] heavy churn on page ${pageId} (capture ${captureId} vs ${prev.id}): ${structural} added/removed of ${before.length}→${after.length} blocks; ` +
            `kept ${candidates.length} money change(s) of ${total} candidates`,
        );
      }
      return { prevId: prev.id, candidates, masked, embedded };
    },
    async (tx, c) => {
      for (const b of c.embedded) await tx.update(captureBlock).set({ embedding: b.embedding }).where(eq(captureBlock.id, b.id));
      if (c.candidates.length === 0) return { baseline: c.prevId === null, changeIds: [] as string[], masked: c.masked };
      const rows = await tx
        .insert(detectedChange)
        .values(
          c.candidates.map(({ alignment: a, numeric, similarity, flags }) => ({
            competitorId: cap.competitorId, trackedPageId: pageId, source: 'web', kind: a.kind, beforeCaptureId: c.prevId, afterCaptureId: captureId,
            blockKey: (a.after ?? a.before)!.blockKey, beforeText: a.before?.text ?? null, afterText: a.after?.text ?? null,
            similarity, numericChanges: numeric, flags, stageVersion: WEB_DIFF_VERSION,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: detectedChange.id });
      return { baseline: false, changeIds: rows.map((r) => r.id), masked: c.masked };
    },
  );
  if (!outcome.ran) return outcome;
  const newlyMasked = await learnVolatileBlocks(deps.db, pageId);
  return { ran: true, result: { ...outcome.result, newlyMasked } };
}
