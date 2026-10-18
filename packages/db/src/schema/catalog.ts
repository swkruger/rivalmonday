import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { CatalogStatus } from '@cs/verticals';
import { agency } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 14a: the vertical catalogue (replaces the YAML packs at runtime). Global, platform-wide. All four tables are
 * service role only (forced RLS, no policy, nothing for app_user). `config` holds every pack field that is not a column.
 */
export const vertical = pgTable(
  'vertical',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status').$type<CatalogStatus>().notNull(),
    mergedInto: text('merged_into').references((): AnyPgColumn => vertical.id),
    version: integer('version').notNull().default(1),
    gbpCategories: text('gbp_categories').array().notNull().default(sql`'{}'`),
    gbpRelatedCategories: text('gbp_related_categories').array().notNull().default(sql`'{}'`),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    draftEvidence: jsonb('draft_evidence').$type<unknown>(),
    createdByAgencyId: uuid('created_by_agency_id').references(() => agency.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    reviewedAt: ts('reviewed_at'),
    reviewedBy: text('reviewed_by'),
  },
  (t) => [
    check('vertical_id_check', sql`${t.id} ~ '^[a-z][a-z0-9_]{1,39}$'`),
    check('vertical_name_check', sql`length(${t.name}) BETWEEN 2 AND 60`),
    check('vertical_status_check', sql`${t.status} IN ('reviewed','unreviewed','merged')`),
    check('vertical_version_check', sql`${t.version} > 0`),
    check('vertical_merged_check', sql`(${t.status} = 'merged') = (${t.mergedInto} IS NOT NULL)`),
    check('vertical_merged_self_check', sql`${t.mergedInto} IS NULL OR ${t.mergedInto} <> ${t.id}`),
  ],
);

export const businessArea = pgTable(
  'business_area',
  {
    verticalId: text('vertical_id').notNull().references(() => vertical.id),
    id: text('id').notNull(),
    name: text('name').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'`),
    status: text('status').$type<CatalogStatus>().notNull(),
    mergedInto: text('merged_into'),
    evidence: jsonb('evidence').$type<unknown>(),
    createdByAgencyId: uuid('created_by_agency_id').references(() => agency.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    reviewedAt: ts('reviewed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.verticalId, t.id] }),
    check('business_area_id_check', sql`${t.id} ~ '^[a-z][a-z0-9_]{1,39}$'`),
    check('business_area_name_check', sql`length(${t.name}) BETWEEN 2 AND 80`),
    check('business_area_status_check', sql`${t.status} IN ('reviewed','unreviewed','merged')`),
    check('business_area_merged_check', sql`(${t.status} = 'merged') = (${t.mergedInto} IS NOT NULL)`),
  ],
);

/** Lower-cased GBP category -> vertical. A category belongs to exactly one vertical. */
export const verticalCategory = pgTable(
  'vertical_category',
  {
    categoryLc: text('category_lc').primaryKey(),
    verticalId: text('vertical_id').notNull().references(() => vertical.id),
    kind: text('kind').$type<'primary' | 'related'>().notNull(),
  },
  (t) => [
    check('vertical_category_lc_check', sql`${t.categoryLc} = lower(btrim(${t.categoryLc})) AND length(${t.categoryLc}) > 0`),
    check('vertical_category_kind_check', sql`${t.kind} IN ('primary','related')`),
    index('vertical_category_vertical_idx').on(t.verticalId),
  ],
);

/** A generated vertical draft awaiting an agency's decision, keyed by the Google place it was drafted for. */
export const verticalDraft = pgTable(
  'vertical_draft',
  {
    placeId: text('place_id').primaryKey(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    draft: jsonb('draft').$type<unknown>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('vertical_draft_agency_day_idx').on(t.agencyId, t.createdAt)],
);
