import { redactForModel } from '@cs/collectors';
import { type AccessContext, type CallMeta, KB_KINDS, KB_LEVELS, type KbKind, type KbLevel, renderKbText, toolkit, ToolError } from '@cs/core';
import { kbArticle, withTenant } from '@cs/db';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { kbNamesFor } from '../kb/names';
import { rrfMerge } from '../search/rrf';
import { requireActiveClient } from '../search/scope';

const { defineTool } = toolkit<ToolDeps>();
const CANDIDATES = 20;
const MAX_CHUNKS_PER_ARTICLE = 2;

/** One matched article: raw (unrendered, unredacted) chunk text in fused-rank order; each caller renders and redacts. */
export interface KbHit {
  kbId: string;
  title: string;
  kind: KbKind;
  level: KbLevel;
  updatedAt: Date;
  clientId: string | null;
  chunks: string[];
}

interface ChunkRow extends Record<string, unknown> {
  key: string;
  kb_id: string;
  title: string;
  kind: KbKind;
  level: KbLevel;
  updated_at: Date | string;
  client_id: string | null;
  text: string;
}

/**
 * Tenant-isolation boundary for knowledge reads. RLS (kb_article/kb_chunk policies) decides tenant and role visibility;
 * on top, client-level rows are returned only for `clientId` (plan S9). Hybrid FTS + vector, fused with RRF (k = 60).
 */
export async function searchKnowledgeHits(deps: ToolDeps, ctx: AccessContext, clientId: string | null, query: string, kinds?: KbKind[], limit = 5, opts?: { queryVector?: number[] | null }): Promise<KbHit[]> {
  if (clientId) await requireActiveClient(deps, ctx, clientId);
  const scope = clientId ? sql`(c.level <> 'client' OR c.client_id = ${clientId}::uuid)` : sql`c.level <> 'client'`;
  const kindFilter = kinds && kinds.length > 0 ? sql`AND a.kind = ANY(ARRAY[${sql.join(kinds.map((k) => sql`${k}`), sql`, `)}]::text[])` : sql``;
  const cols = sql`c.id::text AS key, a.id AS kb_id, a.title, a.kind, a.level, a.updated_at, a.client_id, c.text`;
  const base = sql`FROM kb_chunk c JOIN kb_article a ON a.id = c.article_id WHERE a.status = 'published' AND ${scope} ${kindFilter}`;

  const fts = await withTenant(deps.app, ctx, async (tx) => [...(await tx.execute<ChunkRow>(sql`
    SELECT ${cols} ${base} AND c.search_tsv @@ websearch_to_tsquery('english', ${query})
    ORDER BY ts_rank_cd(c.search_tsv, websearch_to_tsquery('english', ${query})) DESC, c.id LIMIT ${CANDIDATES}`))]);

  let vector: ChunkRow[] = [];
  // A caller that already embedded the query passes its vector (`null` = embeddings unavailable, full text only).
  const precomputed = opts?.queryVector;
  if (precomputed !== undefined ? precomputed !== null : deps.embedQuery && !ctx.support) { // support sessions never embed (paid + llm_call insert)
    try {
      const vec = precomputed ?? await deps.embedQuery!(redactForModel(query), { agencyId: ctx.agencyId, clientId: clientId });
      const v = sql`${JSON.stringify(vec)}::vector`;
      vector = await withTenant(deps.app, ctx, async (tx) => [...(await tx.execute<ChunkRow>(sql`
        SELECT ${cols} ${base} AND c.embedding IS NOT NULL ORDER BY c.embedding <=> ${v}, c.id LIMIT ${CANDIDATES}`))]);
    } catch {
      console.warn('[search_knowledge] embeddings unavailable'); // never the query or the error text
    }
  }

  const hits = new Map<string, KbHit>();
  for (const row of rrfMerge([fts, vector], 60, CANDIDATES * 2)) {
    let hit = hits.get(row.kb_id);
    if (!hit) {
      if (hits.size >= limit) continue;
      hit = { kbId: row.kb_id, title: row.title, kind: row.kind, level: row.level, updatedAt: new Date(row.updated_at), clientId: row.client_id, chunks: [] };
      hits.set(row.kb_id, hit);
    }
    if (hit.chunks.length < MAX_CHUNKS_PER_ARTICLE) hit.chunks.push(row.text);
  }
  return [...hits.values()];
}

/** `ask`/`mcp` text goes to a model or external client: placeholders first, then `redactForModel`. `web` is the in-tenant human: render only. */
function textFor(meta: CallMeta, names: { productName: string; assistantName: string }, text: string): string {
  const rendered = renderKbText(text, names);
  return meta.channel === 'web' ? rendered : redactForModel(rendered);
}

export const searchKnowledge = defineTool({
  name: 'search_knowledge',
  access: 'read',
  description: 'Search the help, playbook, Q&A, blog and client-fact knowledge base. Returns matching articles with their best passages.',
  input: z.object({
    query: z.string().trim().min(1).max(300),
    clientId: z.string().uuid().optional(),
    kinds: z.array(z.enum(KB_KINDS)).min(1).max(KB_KINDS.length).optional(),
    limit: z.number().int().min(1).max(8).default(5),
  }),
  output: z.object({
    results: z.array(z.object({ kbId: z.string(), title: z.string(), kind: z.enum(KB_KINDS), level: z.enum(KB_LEVELS), updatedAt: z.string(), chunks: z.array(z.string()) })),
  }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, input, deps, meta) {
    const hits = await searchKnowledgeHits(deps, ctx, input.clientId ?? null, input.query, input.kinds, input.limit);
    const names = await kbNamesFor(deps.service, ctx.agencyId);
    return {
      results: hits.map((h) => ({
        kbId: h.kbId, title: textFor(meta, names, h.title), kind: h.kind, level: h.level, updatedAt: h.updatedAt.toISOString(),
        chunks: h.chunks.map((c) => textFor(meta, names, c)),
      })),
    };
  },
});

export const getKbArticle = defineTool({
  name: 'get_kb_article',
  access: 'read',
  description: 'Read one visible knowledge-base article in full.',
  input: z.object({ kbId: z.string().uuid() }),
  output: z.object({
    kbId: z.string(), title: z.string(), kind: z.enum(KB_KINDS), level: z.enum(KB_LEVELS), bodyMd: z.string(), sourceUrl: z.string().nullable(), updatedAt: z.string(),
  }),
  permission: 'read',
  channels: ['web'],
  async handler(ctx, input, deps) {
    const [a] = await withTenant(deps.app, ctx, (tx) => tx.select().from(kbArticle).where(and(eq(kbArticle.id, input.kbId), eq(kbArticle.status, 'published'))));
    if (!a) throw new ToolError('not_found', 'Article not found');
    const names = await kbNamesFor(deps.service, ctx.agencyId);
    return {
      kbId: a.id, title: renderKbText(a.title, names), kind: a.kind, level: a.level, bodyMd: renderKbText(a.bodyMd, names),
      sourceUrl: a.sourceUrl, updatedAt: a.updatedAt.toISOString(),
    };
  },
});

export const knowledgeTools = [searchKnowledge, getKbArticle];
