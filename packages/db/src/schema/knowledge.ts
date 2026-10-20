import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core';
import type { HelpAudience } from '@cs/core';
import { EMBEDDING_DIMENSIONS } from './engine';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type KbLevel = 'platform' | 'agency' | 'client';
export type KbKind = 'help' | 'playbook' | 'qa' | 'blog' | 'fact';
export type KbSource = 'manual' | 'url' | 'seed';

/**
 * Phase 6c: knowledge-base articles at platform / agency / client level. Read-only for app_user (RLS in kb_rls);
 * all writes run on the service connection inside platform tools.
 */
export const kbArticle = pgTable(
  'kb_article',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    level: text('level').$type<KbLevel>().notNull(),
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    kind: text('kind').$type<KbKind>().notNull(),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    previousBodyMd: text('previous_body_md'),
    status: text('status').$type<'draft' | 'published'>().notNull().default('draft'),
    clientVisible: boolean('client_visible').notNull().default(true),
    source: text('source').$type<KbSource>().notNull(),
    sourceUrl: text('source_url'),
    seedKey: text('seed_key').unique(),
    helpKey: text('help_key'),
    audience: text('audience').$type<HelpAudience>().notNull().default('all'),
    autoSync: boolean('auto_sync').notNull().default(false),
    lastSyncedAt: ts('last_synced_at'),
    syncError: text('sync_error'),
    syncFailures: integer('sync_failures').notNull().default(0),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('kb_article_scope_idx').on(t.level, t.agencyId, t.clientId, t.status),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    uniqueIndex('kb_article_help_key_uq')
      .on(t.helpKey, t.audience, t.level, sql`COALESCE(${t.agencyId}, '00000000-0000-0000-0000-000000000000'::uuid)`)
      .where(sql`${t.helpKey} IS NOT NULL`),
    index('kb_article_help_key_idx').on(t.helpKey).where(sql`${t.helpKey} IS NOT NULL`),
    check('kb_article_audience_check', sql`audience IN ('all','agency','client','operator')`),
    check('kb_article_level_check', sql`level IN ('platform','agency','client')`),
    check('kb_article_kind_check', sql`kind IN ('help','playbook','qa','blog','fact')`),
    check('kb_article_title_check', sql`char_length(title) BETWEEN 1 AND 200`),
    check('kb_article_body_check', sql`octet_length(body_md) <= 204800`),
    check('kb_article_status_check', sql`status IN ('draft','published')`),
    check('kb_article_source_check', sql`source IN ('manual','url','seed')`),
    check(
      'kb_article_scope_check',
      sql`(level = 'platform' AND agency_id IS NULL AND client_id IS NULL)
        OR (level = 'agency' AND agency_id IS NOT NULL AND client_id IS NULL)
        OR (level = 'client' AND agency_id IS NOT NULL AND client_id IS NOT NULL)`,
    ),
    check('kb_article_url_check', sql`(source = 'url') = (source_url IS NOT NULL)`),
    check('kb_article_seed_check', sql`source = 'seed' OR seed_key IS NULL`),
    check('kb_article_autosync_check', sql`NOT auto_sync OR source = 'url'`),
  ],
);

/**
 * Chunks exist only for published articles; scope columns (and client_visible) are copied from the article in the
 * same transaction so the RLS policy needs no join. `search_tsv` (generated tsvector + GIN) is SQL-only, as in 0039.
 */
export const kbChunk = pgTable(
  'kb_chunk',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').notNull().references(() => kbArticle.id, { onDelete: 'cascade' }),
    level: text('level').$type<KbLevel>().notNull(),
    agencyId: uuid('agency_id'),
    clientId: uuid('client_id'),
    clientVisible: boolean('client_visible').notNull().default(true),
    ord: integer('ord').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [unique('kb_chunk_article_id_ord_unique').on(t.articleId, t.ord)],
);
