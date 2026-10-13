import { KB_KINDS, KB_LEVELS, KB_MAX_BODY_BYTES, toolkit, ToolError } from '@cs/core';
import { agency, client, kbArticle } from '@cs/db';
import { and, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { saveArticle } from '../kb/write';
import { MCP_MAX_LIMIT, pageResult } from '../paging';
import { requirePlatformOperator } from '../platform';

const { defineTool } = toolkit<ToolDeps>();
const uuid = z.string().uuid();
const SEED_REFUSAL = 'Managed in repo';

const ArticleInputSchema = z.object({
  id: uuid.optional(),
  level: z.enum(KB_LEVELS),
  agencyId: uuid.nullish(),
  clientId: uuid.nullish(),
  kind: z.enum(KB_KINDS),
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(KB_MAX_BODY_BYTES),
  clientVisible: z.boolean().optional(),
  status: z.enum(['draft', 'published']),
});

async function loadArticle(deps: ToolDeps, id: string) {
  const [a] = await deps.service.select().from(kbArticle).where(eq(kbArticle.id, id));
  if (!a) throw new ToolError('not_found', 'Article not found');
  return a;
}

function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown };
    if (typeof v.o === 'number' && Number.isInteger(v.o) && v.o >= 0 && v.o <= 1_000_000) return v.o;
  } catch {
    // fall through
  }
  throw new ToolError('invalid_input', 'Invalid cursor');
}

const ListItem = z.object({
  id: uuid,
  title: z.string(),
  level: z.enum(KB_LEVELS),
  kind: z.enum(KB_KINDS),
  status: z.enum(['draft', 'published']),
  source: z.enum(['manual', 'url', 'seed']),
  agencyName: z.string().nullable(),
  clientName: z.string().nullable(),
  autoSync: z.boolean(),
  lastSyncedAt: z.date().nullable(),
  syncError: z.string().nullable(),
  updatedAt: z.date(),
});

export const listKbArticles = defineTool({
  name: 'list_kb_articles',
  description: 'Platform operators: knowledge-base articles at every level, newest edit first.',
  input: z.object({
    level: z.enum(KB_LEVELS).optional(),
    agencyId: uuid.optional(),
    clientId: uuid.optional(),
    kind: z.enum(KB_KINDS).optional(),
    status: z.enum(['draft', 'published']).optional(),
    q: z.string().max(200).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(MCP_MAX_LIMIT).optional(),
  }),
  output: z.object({ items: z.array(ListItem), nextCursor: z.string().nullable() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    await requirePlatformOperator(deps, ctx);
    const limit = input.limit ?? 25;
    const offset = decodeOffset(input.cursor);
    const conds: SQL[] = [];
    if (input.level) conds.push(eq(kbArticle.level, input.level));
    if (input.agencyId) conds.push(eq(kbArticle.agencyId, input.agencyId));
    if (input.clientId) conds.push(eq(kbArticle.clientId, input.clientId));
    if (input.kind) conds.push(eq(kbArticle.kind, input.kind));
    if (input.status) conds.push(eq(kbArticle.status, input.status));
    if (input.q?.trim()) conds.push(ilike(kbArticle.title, `%${input.q.trim().replace(/[\\%_]/g, '\\$&')}%`));
    const rows = await deps.service
      .select({
        id: kbArticle.id,
        title: kbArticle.title,
        level: kbArticle.level,
        kind: kbArticle.kind,
        status: kbArticle.status,
        source: kbArticle.source,
        agencyName: agency.name,
        clientName: client.name,
        autoSync: kbArticle.autoSync,
        lastSyncedAt: kbArticle.lastSyncedAt,
        syncError: kbArticle.syncError,
        updatedAt: kbArticle.updatedAt,
      })
      .from(kbArticle)
      .leftJoin(agency, eq(agency.id, kbArticle.agencyId))
      .leftJoin(client, eq(client.id, kbArticle.clientId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(kbArticle.updatedAt), kbArticle.id)
      .limit(limit + 1)
      .offset(offset);
    const page = pageResult(rows, limit, offset);
    return { items: page.rows, nextCursor: page.nextCursor };
  },
});

export const getKbArticleAdmin = defineTool({
  name: 'get_kb_article_admin',
  description: 'Platform operators: one knowledge-base article with its full body and the previous body.',
  input: z.object({ id: uuid }),
  output: z.object({}).passthrough(),
  permission: 'agency',
  async handler(ctx, { id }, deps) {
    await requirePlatformOperator(deps, ctx);
    return await loadArticle(deps, id);
  },
});

export const upsertKbArticle = defineTool({
  name: 'upsert_kb_article',
  description: 'Platform operators: create or edit a knowledge-base article at platform, agency or client level.',
  input: ArticleInputSchema,
  output: z.object({ id: uuid, lintWarnings: z.array(z.string()) }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    await requirePlatformOperator(deps, ctx);
    if (input.id && (await loadArticle(deps, input.id)).source === 'seed') throw new ToolError('invalid_input', SEED_REFUSAL);
    const r = await saveArticle(deps.service, ctx.userId, input);
    if (input.status === 'published' && deps.enqueue) {
      try {
        await deps.enqueue('kb-embed', { articleId: r.id }, `kb-embed:${r.id}`);
      } catch (e) {
        console.error('[kb] enqueue kb-embed failed', e instanceof Error ? e.message : e);
      }
    }
    return { id: r.id, lintWarnings: r.lintWarnings };
  },
});

export const deleteKbArticle = defineTool({
  name: 'delete_kb_article',
  description: 'Platform operators: delete a knowledge-base article and its chunks.',
  input: z.object({ id: uuid }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { id }, deps) {
    await requirePlatformOperator(deps, ctx);
    if ((await loadArticle(deps, id)).source === 'seed') throw new ToolError('invalid_input', SEED_REFUSAL);
    await deps.service.delete(kbArticle).where(eq(kbArticle.id, id)); // chunks cascade
    return { ok: true as const };
  },
});

export const setKbAutoSync = defineTool({
  name: 'set_kb_auto_sync',
  description: 'Platform operators: turn weekly re-import on or off for a URL-sourced article.',
  input: z.object({ id: uuid, autoSync: z.boolean() }),
  output: z.object({ ok: z.literal(true) }),
  permission: 'agency',
  async handler(ctx, { id, autoSync }, deps) {
    await requirePlatformOperator(deps, ctx);
    const a = await loadArticle(deps, id);
    if (autoSync && a.source !== 'url') throw new ToolError('invalid_input', 'Only articles imported from a URL can auto-sync');
    await deps.service
      .update(kbArticle)
      .set(autoSync ? { autoSync: true, syncFailures: 0, syncError: null } : { autoSync: false })
      .where(eq(kbArticle.id, id));
    return { ok: true as const };
  },
});

export const knowledgeAdminTools = [listKbArticles, getKbArticleAdmin, upsertKbArticle, deleteKbArticle, setKbAutoSync];
