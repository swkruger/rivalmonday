import { sha256Hex } from '@cs/collectors';
import { capture, captureBlock, type Db, evidence } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, asc, eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { runStage, type StageKey, stageDone } from '../stage';
import { type Block, EXTRACTOR_VERSION, extractBlocks } from './extract';

export const EXTRACT_STAGE = 'web_extract';

export interface StoredBlock extends Block {
  id: string;
  textSha: string;
  embedding: number[] | null;
}

/** Extract stage: html evidence → capture_block rows, once per capture and extractor version. */
export async function ensureBlocks(deps: { db: Db; store: ObjectStore }, captureId: string): Promise<'extracted' | 'already' | 'busy'> {
  const key: StageKey = { stage: EXTRACT_STAGE, version: EXTRACTOR_VERSION, subjectId: captureId };
  if (await stageDone(deps.db, key)) return 'already';
  const r = await runStage(
    deps.db,
    key,
    async () => {
      const [row] = await deps.db
        .select({ c: capture, objectKey: evidence.objectKey })
        .from(capture)
        .innerJoin(evidence, and(eq(evidence.captureId, capture.id), eq(evidence.kind, 'html')))
        .where(eq(capture.id, captureId))
        .limit(1);
      if (!row) throw new Error(`capture ${captureId} has no html evidence`);
      if (row.c.source !== 'web' || row.c.status !== 'ok' || !row.c.trackedPageId) throw new Error(`capture ${captureId} is not an ok web page capture`);
      const gz = await deps.store.get(row.objectKey);
      if (!gz) throw new Error(`evidence object ${row.objectKey} is missing from the store`);
      return { competitorId: row.c.competitorId, trackedPageId: row.c.trackedPageId, blocks: extractBlocks(new TextDecoder().decode(gunzipSync(gz))) };
    },
    async (tx, c) => {
      // A newer EXTRACTOR_VERSION re-extracts: drop the old version's blocks (their embeddings are recomputed on the next diff).
      await tx.delete(captureBlock).where(eq(captureBlock.captureId, captureId));
      if (c.blocks.length === 0) return;
      await tx
        .insert(captureBlock)
        .values(c.blocks.map((b) => ({ captureId, competitorId: c.competitorId, trackedPageId: c.trackedPageId, ord: b.ord, blockKey: b.blockKey, path: b.path, text: b.text, textSha: sha256Hex(b.text) })));
    },
  );
  if (r.ran) return 'extracted';
  return (await stageDone(deps.db, key)) ? 'already' : 'busy';
}

export async function loadBlocks(db: Db, captureId: string): Promise<StoredBlock[]> {
  const rows = await db.select().from(captureBlock).where(eq(captureBlock.captureId, captureId)).orderBy(asc(captureBlock.ord));
  return rows.map((r) => ({ id: r.id, ord: r.ord, path: r.path, blockKey: r.blockKey, text: r.text, textSha: r.textSha, embedding: r.embedding ?? null }));
}
