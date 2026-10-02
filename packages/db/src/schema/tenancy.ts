import { sql } from 'drizzle-orm';
import { foreignKey, index, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export interface ServiceArea {
  center: { lat: number; lng: number };
  radiusKm: number;
  zips: string[];
  /** Towns/cities served, matched case-insensitively against event text by the territory-expansion move (spec §6.4). */
  towns?: string[];
}

/** Per-client routing thresholds (spec §6.3 "thresholds per client"); null = vertical pack defaults. */
export interface ScoreThresholds {
  alert: number;
  brief: number;
}

export const agency = pgTable('agency', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const client = pgTable(
  'client',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    verticalId: text('vertical_id').notNull(),
    features: jsonb('features').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    services: jsonb('services').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    keywords: jsonb('keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    serviceArea: jsonb('service_area').$type<ServiceArea | null>(),
    placeId: text('place_id'),
    scoreThresholds: jsonb('score_thresholds').$type<ScoreThresholds | null>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('client_agency_idx').on(t.agencyId),
    // Lets client_competitor take a composite FK (client_id, agency_id) so the DB itself
    // enforces that a client_competitor row's agency_id matches its client's real agency —
    // RLS alone can't catch a cross-tenant client_id since FK checks run as the table owner.
    unique('client_id_agency_id_unique').on(t.id, t.agencyId),
  ],
);

/** Global, public-data entity. Captured once, shared by every client that tracks it (spec §4.3). */
export const competitor = pgTable('competitor', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain').unique(),
  placeId: text('place_id').unique(),
  cid: text('cid').unique(),
  /** Every Facebook page whose ads belong to this competitor (franchise brands run ads from franchisee pages). */
  metaPageIds: jsonb('meta_page_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Google Ads Transparency advertiser ids pinned to this competitor; when set, ads are queried by id, not by domain. */
  googleAdvertiserIds: jsonb('google_advertiser_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

export const clientCompetitor = pgTable(
  'client_competitor',
  {
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.competitorId] }),
    index('client_competitor_agency_idx').on(t.agencyId),
    index('client_competitor_competitor_idx').on(t.competitorId),
    // Composite FK ties client_id to its agency_id via client's own (id, agency_id) unique
    // constraint, so the database rejects a row whose agency_id doesn't match the client's
    // real agency — closes the cross-tenant insert gap FK-on-client_id-alone left open.
    foreignKey({
      columns: [t.clientId, t.agencyId],
      foreignColumns: [client.id, client.agencyId],
    }).onDelete('cascade'),
  ],
);
