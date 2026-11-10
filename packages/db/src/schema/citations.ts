import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { capture } from './evidence';
import { agency, client, competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type CitationStatus = 'listed' | 'not_found' | 'not_checked';
export type CitationRunStatus = 'running' | 'done' | 'capped' | 'failed';

/** One competitor (or a client's own business) x one directory host (18c). Global public facts; service-role writes only. */
export const citationListing = pgTable(
  'citation_listing',
  {
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    host: text('host').notNull(),
    status: text('status').$type<CitationStatus>().notNull(),
    nameMatch: boolean('name_match'),
    phoneMatch: boolean('phone_match'),
    listingUrl: text('listing_url'),
    listingTitle: text('listing_title'),
    /** Digits shown when phoneMatch = false (evidence-backed), else null. */
    shownPhone: text('shown_phone'),
    captureId: uuid('capture_id').references(() => capture.id),
    firstSeenAt: ts('first_seen_at'),
    lastSeenAt: ts('last_seen_at'),
    /** Set when not_found -> listed (catalogue rows only); read by the diff. */
    newlyFoundAt: ts('newly_found_at'),
    /** false = "Also found on" (C12). */
    inCatalogue: boolean('in_catalogue').notNull().default(true),
    checkedAt: ts('checked_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.competitorId, t.host] }),
    check('citation_listing_status_check', sql`status IN ('listed','not_found','not_checked')`),
  ],
);
export type CitationListingRow = typeof citationListing.$inferSelect;

/** One listings audit for a client (cadence, cost, "checked on"). Tenant-scoped like serp_snapshot. */
export const citationAuditRun = pgTable(
  'citation_audit_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    trigger: text('trigger').$type<'setup' | 'monthly'>().notNull(),
    status: text('status').$type<CitationRunStatus>().notNull(),
    competitorIds: uuid('competitor_ids').array().notNull(),
    calls: integer('calls').notNull().default(0),
    estUsd: numeric('est_usd', { precision: 8, scale: 4 }).notNull().default('0'),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('citation_audit_run_trigger_check', sql`trigger IN ('setup','monthly')`),
    check('citation_audit_run_status_check', sql`status IN ('running','done','capped','failed')`),
    uniqueIndex('citation_audit_run_one_live').on(t.clientId).where(sql`status = 'running'`),
    index('citation_audit_run_client_idx').on(t.clientId, t.startedAt.desc()),
  ],
);
export type CitationAuditRunRow = typeof citationAuditRun.$inferSelect;
