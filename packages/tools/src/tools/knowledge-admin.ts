import { randomUUID } from 'node:crypto';
import { isPublicHttpUrl } from '@cs/collectors';
import { KB_KINDS, KB_LEVELS, KB_MAX_BODY_BYTES, toolkit, ToolError } from '@cs/core';
import { agency, client, kbArticle } from '@cs/db';
import { and, asc, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueOf, jobStatusOf, type ToolDeps } from '../deps';
import { IMPORT_ERRORS } from '../kb/import-error';
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
  /** True when the most recent write was a sync that changed the body (the worker sets `updated_at = last_synced_at` only then). */
  lastSyncChanged: z.boolean(),
  updatedAt: z.date(),
});

export const listKbArticles = defineTool({
  name: 'list_kb_articles',
  access: 'read',
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
        lastSyncChanged: sql<boolean>`(${kbArticle.previousBodyMd} IS NOT NULL AND ${kbArticle.lastSyncedAt} IS NOT NULL AND ${kbArticle.updatedAt} = ${kbArticle.lastSyncedAt})`,
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

export const listKbTargets = defineTool({
  name: 'list_kb_targets',
  access: 'read',
  description: 'Platform operators: every agency with its clients, for choosing where a knowledge-base article applies.',
  input: z.object({}),
  output: z.object({ agencies: z.array(z.object({ id: uuid, name: z.string(), clients: z.array(z.object({ id: uuid, name: z.string() })) })) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    await requirePlatformOperator(deps, ctx);
    const agencies = await deps.service.select({ id: agency.id, name: agency.name }).from(agency).orderBy(asc(agency.name), agency.id);
    const clients = await deps.service.select({ id: client.id, name: client.name, agencyId: client.agencyId }).from(client).orderBy(asc(client.name), client.id);
    return { agencies: agencies.map((a) => ({ ...a, clients: clients.filter((c) => c.agencyId === a.id).map(({ id, name }) => ({ id, name })) })) };
  },
});

export const getKbArticleAdmin = defineTool({
  name: 'get_kb_article_admin',
  access: 'read',
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
  access: 'write',
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
  access: 'write',
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
  access: 'write',
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

function requireImportEnabled(deps: ToolDeps) {
  if (!deps.kbImportEnabled) throw new ToolError('not_found', 'Not found');
}

const httpUrl = z.string().max(2000).refine(isPublicHttpUrl, 'Must be a public http(s) URL');

export const importKbUrl = defineTool({
  name: 'import_kb_url',
  access: 'write',
  description: 'Platform operators: import a public web page as a draft knowledge-base article (background job; poll get_kb_import_status).',
  input: z.object({
    url: httpUrl,
    level: z.enum(KB_LEVELS),
    agencyId: uuid.nullish(),
    clientId: uuid.nullish(),
    kind: z.enum(KB_KINDS),
    autoSync: z.boolean(),
  }),
  output: z.object({ key: z.string() }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    await requirePlatformOperator(deps, ctx);
    requireImportEnabled(deps);
    if (input.level !== 'platform' && !input.agencyId) throw new ToolError('invalid_input', 'An agency is required');
    if (input.level === 'client' && !input.clientId) throw new ToolError('invalid_input', 'A client is required');
    // Check the scope now, not when the job saves: a bad pair would otherwise fetch the page and fail late.
    if (input.level !== 'platform') {
      const [ag] = await deps.service.select({ id: agency.id }).from(agency).where(eq(agency.id, input.agencyId!));
      if (!ag) throw new ToolError('invalid_input', 'Agency not found');
      if (input.level === 'client') {
        const [cl] = await deps.service.select({ id: client.id }).from(client).where(and(eq(client.id, input.clientId!), eq(client.agencyId, ag.id)));
        if (!cl) throw new ToolError('invalid_input', 'Client not found in that agency');
      }
    }
    const key = randomUUID();
    const data: Record<string, string> = { key, url: input.url, level: input.level, kind: input.kind, autoSync: input.autoSync ? 'true' : 'false', userId: ctx.userId };
    if (input.agencyId) data.agencyId = input.agencyId;
    if (input.clientId) data.clientId = input.clientId;
    await enqueueOf(deps)('kb-import', data, key);
    return { key };
  },
});

const ImportStatus = z.object({
  state: z.enum(['queued', 'running', 'done', 'failed']),
  articleId: uuid.optional(),
  error: z.enum(IMPORT_ERRORS).optional(),
});

export const getKbImportStatus = defineTool({
  name: 'get_kb_import_status',
  access: 'read',
  description: 'Platform operators: progress of a URL import started with import_kb_url.',
  input: z.object({ key: z.string().min(1).max(100) }),
  output: ImportStatus,
  permission: 'agency',
  async handler(ctx, { key }, deps) {
    await requirePlatformOperator(deps, ctx);
    requireImportEnabled(deps);
    const job = await jobStatusOf(deps)('kb-import', key);
    // No row for a key we just handed out means it was archived or never queued: a terminal failure beats polling forever.
    if (!job) return { state: 'failed' as const, error: 'fetch_failed' as const };
    switch (job.state) {
      case 'created':
      case 'retry':
        return { state: 'queued' as const };
      case 'active':
        return { state: 'running' as const };
      case 'completed': {
        const out = (job.output ?? {}) as { articleId?: unknown; error?: unknown };
        const parsedError = IMPORT_ERRORS.find((e) => e === out.error);
        if (parsedError) return { state: 'failed' as const, error: parsedError };
        if (typeof out.articleId === 'string') return { state: 'done' as const, articleId: out.articleId };
        return { state: 'failed' as const, error: 'fetch_failed' as const };
      }
      default:
        return { state: 'failed' as const, error: 'fetch_failed' as const };
    }
  },
});

export const knowledgeAdminTools = [listKbArticles, listKbTargets, getKbArticleAdmin, upsertKbArticle, deleteKbArticle, setKbAutoSync, importKbUrl, getKbImportStatus];
