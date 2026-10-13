import { kbChunk } from '@cs/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

const BATCH = 64;
const SWEEP_CAP = 500;
// An article has at most 200 chunks (spec), so a per-article job never needs a cap below that.
const ARTICLE_CAP = 200;

/** Phase 6c: fills `kb_chunk.embedding`. Per-article jobs come from publish; the hourly `{}` sweep catches the rest. */
export function createKbJobs(deps: WorkerDeps) {
  const embed = defineJob({
    name: 'kb-embed',
    schema: z.object({ articleId: z.uuid().optional() }),
    cron: '15 * * * *',
    queue: { policy: 'short', retryLimit: 3, retryDelay: 30, retryBackoff: true },
    handler: async ({ articleId }) => {
      if (!deps.engineConfigured()) return;
      const db = deps.serviceDb();
      const pending = await db
        .select({ id: kbChunk.id, text: kbChunk.text })
        .from(kbChunk)
        .where(articleId ? and(isNull(kbChunk.embedding), eq(kbChunk.articleId, articleId)) : isNull(kbChunk.embedding))
        .orderBy(asc(kbChunk.articleId), asc(kbChunk.ord))
        .limit(articleId ? ARTICLE_CAP : SWEEP_CAP);
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        const vectors = await deps.embedTexts(batch.map((c) => c.text));
        // A chunk deleted mid-run (re-publish/unpublish) matches no row, so its update is a no-op.
        for (const [j, c] of batch.entries()) {
          const v = vectors[j];
          if (v) await db.update(kbChunk).set({ embedding: v }).where(and(eq(kbChunk.id, c.id), isNull(kbChunk.embedding)));
        }
      }
      console.log(`[kb-embed] ${articleId ?? 'sweep'} → ${pending.length} chunks`);
    },
  });
  return { embed };
}
