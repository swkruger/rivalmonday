import { sql } from 'drizzle-orm';
import { type AnyPgColumn, boolean, check, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { AgencyBranding } from './delivery';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const CLIENT_STATUSES = ['active', 'prospect'] as const;
/** 5b-2 decision 8: a prospect is a client being pitched — it gets one snapshot and no recurring work until converted. */
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

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
  /** Per-agency white-label settings (spec §5.1), edited by Phase 5. */
  branding: jsonb('branding').$type<AgencyBranding | null>(),
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
    /** The client's own business as a global competitor row (reviews + GBP only), for the spec §6.5 benchmark. Never in client_competitor. */
    selfCompetitorId: uuid('self_competitor_id').references((): AnyPgColumn => competitor.id, { onDelete: 'set null' }),
    /** IANA time zone of the business (Phase 4a): briefs are generated Thursday night and delivered Monday morning local time. */
    timezone: text('timezone').notNull().default('America/Chicago'),
    /** Spec §9.3 client alert mode — an agency decision (service role only, no app_user column grant). */
    alertMode: text('alert_mode').notNull().default('after_am_check'),
    /** Spec §9.1.6: send an untouched ready brief automatically on Monday 07:00 local. Agency decision. */
    briefAutoSend: boolean('brief_auto_send').notNull().default(false),
    /** 5b-2 decision 8 (service role only). */
    status: text('status').$type<ClientStatus>().notNull().default('active'),
    /** 5b-2 decision 6: monthly AI + vendor spend cap in USD (warning at 80 %; enforcement is Phase 7). Service role only. */
    monthlyCapUsd: doublePrecision('monthly_cap_usd').notNull().default(15),
    /** 5b-2 decision 6: how many competitors this client may track (spec §4.1 "tier limit configurable"). Service role only. */
    competitorLimit: integer('competitor_limit').notNull().default(5),
    createdAt: createdAt(),
  },
  (t) => [
    index('client_agency_idx').on(t.agencyId),
    // Lets client_competitor take a composite FK (client_id, agency_id) so the DB itself
    // enforces that a client_competitor row's agency_id matches its client's real agency —
    // RLS alone can't catch a cross-tenant client_id since FK checks run as the table owner.
    unique('client_id_agency_id_unique').on(t.id, t.agencyId),
    // Phase 3d decision 13: numbers, 0 ≤ brief < alert ≤ 100. The `?` key-existence checks come first so a
    // missing key makes the AND chain FALSE outright — without them, jsonb_typeof/->> on an absent key
    // yields NULL, and NULL inside this OR is silently treated as "satisfies the check" by Postgres.
    check(
      'client_score_thresholds_check',
      sql`score_thresholds IS NULL OR (
        (score_thresholds ? 'alert') AND (score_thresholds ? 'brief')
        AND jsonb_typeof(score_thresholds->'alert') = 'number' AND jsonb_typeof(score_thresholds->'brief') = 'number'
        AND (score_thresholds->>'brief')::numeric >= 0 AND (score_thresholds->>'alert')::numeric <= 100
        AND (score_thresholds->>'brief')::numeric < (score_thresholds->>'alert')::numeric)`,
    ),
    // Shape only (Area/City[/Sub]); the application also validates with Intl before use and falls back to the default.
    check('client_timezone_check', sql`timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$' OR timezone = 'UTC'`),
    check('client_alert_mode_check', sql`alert_mode IN ('direct', 'after_am_check', 'digest_only')`),
    check('client_status_check', sql`status IN ('active', 'prospect')`),
    check('client_monthly_cap_check', sql`monthly_cap_usd > 0 AND monthly_cap_usd <= 10000`),
    check('client_competitor_limit_check', sql`competitor_limit BETWEEN 1 AND 10`),
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
