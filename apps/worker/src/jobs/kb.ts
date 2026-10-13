import type { RenderedPage } from '@cs/collectors';
import { KB_KINDS, KB_LEVELS, KB_MAX_BODY_BYTES } from '@cs/core';
import { kbArticle, kbChunk } from '@cs/db';
import { extractBlocks } from '@cs/engine';
import { blocksToMarkdown, type ImportError, rechunk, saveArticle } from '@cs/tools';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

const BATCH = 64;
const SWEEP_CAP = 500;
// An article has at most 200 chunks (spec), so a per-article job never needs a cap below that.
const ARTICLE_CAP = 200;

const MAX_SYNC_FAILURES = 3;
const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Cuts markdown to the body limit on a paragraph boundary (a single oversized paragraph is cut mid-text). */
export function truncateBody(md: string): string {
  if (Buffer.byteLength(md, 'utf8') <= KB_MAX_BODY_BYTES) return md;
  let out = '';
  for (const para of md.split('\n\n')) {
    const next = out ? `${out}\n\n${para}` : para;
    if (Buffer.byteLength(next, 'utf8') > KB_MAX_BODY_BYTES) break;
    out = next;
  }
  if (out) return out;
  let cut = md.slice(0, KB_MAX_BODY_BYTES);
  while (Buffer.byteLength(cut, 'utf8') > KB_MAX_BODY_BYTES) cut = cut.slice(0, -1);
  return cut;
}

function importErrorOf(page: RenderedPage): ImportError | null {
  if (page.status === 'robots_disallowed') return 'robots_disallowed';
  if (page.status === 'blocked') return 'blocked';
  if (page.error?.startsWith('redirected off-site')) return 'off_site';
  if (page.httpStatus !== null && page.httpStatus >= 400) return 'http_error';
  if (page.status !== 'ok') return 'fetch_failed';
  return null;
}

type Fetched = { ok: true; title: string; finalUrl: string; markdown: string } | { ok: false; error: ImportError };

/** Phase 6c: fills `kb_chunk.embedding`. Per-article jobs come from publish; the hourly `{}` sweep catches the rest. */
export function createKbJobs(deps: WorkerDeps, opts: { enqueueEmbed?: (articleId: string) => Promise<void> } = {}) {
  /** The only fetch path: the shared polite renderer (robots, rate limit, honest UA). The page is always closed. */
  async function fetchMarkdown(url: string): Promise<Fetched> {
    let page: RenderedPage | null = null;
    try {
      page = await deps.politeRenderer().render(url);
      const error = importErrorOf(page);
      if (error) return { ok: false, error };
      const markdown = truncateBody(blocksToMarkdown(extractBlocks(page.html)));
      if (!markdown.trim()) return { ok: false, error: 'no_content' };
      return { ok: true, title: page.title, finalUrl: page.finalUrl, markdown };
    } catch (err) {
      console.error('[kb-fetch]', err instanceof Error ? err.message : err);
      return { ok: false, error: 'fetch_failed' };
    } finally {
      await page?.close().catch(() => {});
    }
  }

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

  const importUrl = defineJob({
    name: 'kb-import',
    schema: z.object({
      key: z.string().min(1),
      url: z.string().url(),
      level: z.enum(KB_LEVELS),
      agencyId: z.uuid().optional(),
      clientId: z.uuid().optional(),
      kind: z.enum(KB_KINDS),
      // EnqueueJob data is Record<string,string>: booleans travel as 'true' / 'false'.
      autoSync: z.enum(['true', 'false']).transform((v) => v === 'true'),
      userId: z.string().min(1),
    }),
    queue: { policy: 'short', retryLimit: 0, expireInSeconds: 600 },
    handler: async (d) => {
      if (!deps.kbImportEnabled()) return { error: 'disabled' satisfies ImportError };
      const r = await fetchMarkdown(d.url);
      if (!r.ok) return { error: r.error };
      const title = r.title.trim().slice(0, 200) || new URL(r.finalUrl).hostname;
      const saved = await saveArticle(
        deps.serviceDb(),
        d.userId,
        { level: d.level, agencyId: d.agencyId, clientId: d.clientId, kind: d.kind, title, bodyMd: r.markdown, status: 'draft' },
        { source: 'url', sourceUrl: r.finalUrl, autoSync: d.autoSync },
      );
      console.log(`[kb-import] ${d.url} → ${saved.id}`);
      return { articleId: saved.id };
    },
  });

  const sync = defineJob({
    name: 'kb-sync',
    schema: z.object({}),
    cron: '0 5 * * 0',
    queue: { policy: 'short', retryLimit: 0, expireInSeconds: 7200 },
    handler: async () => {
      if (!deps.kbImportEnabled()) return;
      const db = deps.serviceDb();
      // source = 'url' only: seed and manual rows are never touched by sync.
      const rows = await db
        .select()
        .from(kbArticle)
        .where(and(eq(kbArticle.status, 'published'), eq(kbArticle.autoSync, true), eq(kbArticle.source, 'url')));
      let changed = 0;
      for (const row of rows) {
        if (!row.sourceUrl) continue;
        const r = await fetchMarkdown(row.sourceUrl);
        if (!r.ok) {
          const failures = row.syncFailures + 1;
          await db
            .update(kbArticle)
            .set({ syncError: r.error, syncFailures: failures, ...(failures >= MAX_SYNC_FAILURES && { autoSync: false }) })
            .where(eq(kbArticle.id, row.id));
          continue;
        }
        if (norm(r.markdown) === norm(row.bodyMd)) {
          await db.update(kbArticle).set({ lastSyncedAt: sql`now()`, syncFailures: 0, syncError: null }).where(eq(kbArticle.id, row.id));
          continue;
        }
        await db.transaction(async (tx) => {
          await tx
            .update(kbArticle)
            .set({ previousBodyMd: row.bodyMd, bodyMd: r.markdown, lastSyncedAt: sql`now()`, syncFailures: 0, syncError: null, updatedAt: sql`now()` })
            .where(eq(kbArticle.id, row.id));
          await rechunk(tx, row.id);
        });
        changed++;
        try {
          await opts.enqueueEmbed?.(row.id);
        } catch (e) {
          console.error('[kb-sync] enqueue kb-embed failed', e instanceof Error ? e.message : e); // the hourly sweep embeds it anyway
        }
      }
      console.log(`[kb-sync] ${rows.length} articles, ${changed} changed`);
    },
  });

  return { embed, importUrl, sync };
}
