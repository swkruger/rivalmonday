import { chunkMarkdown, type HelpAudience, KB_MAX_BODY_BYTES, type KbKind, type KbLevel, lintKbText, ToolError } from '@cs/core';
import { agency, client, type Db, kbArticle, kbChunk, type Tx } from '@cs/db';
import { and, eq, sql } from 'drizzle-orm';

export interface ArticleInput {
  id?: string;
  level: KbLevel;
  agencyId?: string | null;
  clientId?: string | null;
  kind: KbKind;
  title: string;
  bodyMd: string;
  clientVisible?: boolean;
  status: 'draft' | 'published';
}

export interface SaveExtra {
  source?: 'manual' | 'url' | 'seed';
  sourceUrl?: string | null;
  seedKey?: string | null;
  autoSync?: boolean;
  /** Help-system keying (15b): page guides and glossary rows. */
  helpKey?: string | null;
  audience?: HelpAudience;
  /** Platform level only: hide audience-restricted help from clients. */
  clientVisible?: boolean;
}

export const TRUNCATED_WARNING = 'Too long: only the first 200 sections are searchable.';

/** Chunks exist only for published articles (kb_chunk RLS has no status check): replace them from the article row. */
export async function rechunk(tx: Tx, articleId: string): Promise<number> {
  const [a] = await tx.select().from(kbArticle).where(eq(kbArticle.id, articleId));
  if (!a) throw new ToolError('not_found', 'Article not found');
  await tx.delete(kbChunk).where(eq(kbChunk.articleId, articleId));
  if (a.status !== 'published') return 0;
  const { chunks } = chunkMarkdown(a.bodyMd);
  if (chunks.length === 0) return 0;
  await tx
    .insert(kbChunk)
    .values(chunks.map((text, ord) => ({ articleId, level: a.level, agencyId: a.agencyId, clientId: a.clientId, clientVisible: a.clientVisible, ord, text })));
  return chunks.length;
}

async function resolveScope(tx: Tx, input: ArticleInput): Promise<{ agencyId: string | null; clientId: string | null }> {
  if (input.level === 'platform') return { agencyId: null, clientId: null };
  if (!input.agencyId) throw new ToolError('invalid_input', 'An agency is required');
  const [ag] = await tx.select({ id: agency.id }).from(agency).where(eq(agency.id, input.agencyId));
  if (!ag) throw new ToolError('invalid_input', 'Agency not found');
  if (input.level === 'agency') return { agencyId: ag.id, clientId: null };
  if (!input.clientId) throw new ToolError('invalid_input', 'A client is required');
  const [cl] = await tx.select({ id: client.id }).from(client).where(and(eq(client.id, input.clientId), eq(client.agencyId, ag.id)));
  if (!cl) throw new ToolError('invalid_input', 'Client not found in that agency');
  return { agencyId: ag.id, clientId: cl.id };
}

/**
 * Service-connection write: upsert the article and keep its chunks in step, in one transaction. Callers enqueue
 * `kb-embed` after it returns. Seed-row protection is the tools' concern (the seed loader saves through here).
 */
export async function saveArticle(
  service: Db,
  userId: string,
  input: ArticleInput,
  extra: SaveExtra = {},
): Promise<{ id: string; lintWarnings: string[]; chunkCount: number }> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) throw new ToolError('invalid_input', 'Title must be 1 to 200 characters');
  if (Buffer.byteLength(input.bodyMd, 'utf8') > KB_MAX_BODY_BYTES) throw new ToolError('invalid_input', 'Article body is too large (200 KB maximum)');
  // Platform rows are client-visible unless the seed (help audience) says otherwise; operator tools can't hide them.
  const clientVisible = input.level === 'agency' ? (input.clientVisible ?? true) : input.level === 'platform' ? (extra.clientVisible ?? true) : true;

  const { id, chunkCount } = await service.transaction(async (tx) => {
    const scope = await resolveScope(tx, input);
    const common = { level: input.level, ...scope, kind: input.kind, title, bodyMd: input.bodyMd, status: input.status, clientVisible, updatedBy: userId, updatedAt: sql`now()` };
    let articleId: string;
    if (input.id) {
      const [old] = await tx.select().from(kbArticle).where(eq(kbArticle.id, input.id)).for('update');
      if (!old) throw new ToolError('not_found', 'Article not found');
      await tx
        .update(kbArticle)
        .set({
          ...common,
          previousBodyMd: old.bodyMd !== input.bodyMd ? old.bodyMd : old.previousBodyMd,
          ...(extra.source !== undefined && { source: extra.source }),
          ...(extra.sourceUrl !== undefined && { sourceUrl: extra.sourceUrl }),
          ...(extra.seedKey !== undefined && { seedKey: extra.seedKey }),
          ...(extra.autoSync !== undefined && { autoSync: extra.autoSync }),
          ...(extra.helpKey !== undefined && { helpKey: extra.helpKey }),
          ...(extra.audience !== undefined && { audience: extra.audience }),
        })
        .where(eq(kbArticle.id, input.id));
      articleId = input.id;
    } else {
      const [row] = await tx
        .insert(kbArticle)
        .values({
          ...common,
          source: extra.source ?? 'manual',
          sourceUrl: extra.sourceUrl ?? null,
          seedKey: extra.seedKey ?? null,
          autoSync: extra.autoSync ?? false,
          helpKey: extra.helpKey ?? null,
          ...(extra.audience !== undefined && { audience: extra.audience }),
          createdBy: userId,
        })
        .returning({ id: kbArticle.id });
      articleId = row!.id;
    }
    return { id: articleId, chunkCount: await rechunk(tx, articleId) };
  });

  const lintWarnings = lintKbText(input.level, `${title}\n${input.bodyMd}`);
  if (chunkMarkdown(input.bodyMd).truncated) lintWarnings.push(TRUNCATED_WARNING);
  return { id, lintWarnings, chunkCount };
}
