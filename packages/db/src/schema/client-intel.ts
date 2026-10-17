import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, doublePrecision, foreignKey, index, integer, jsonb, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { capture } from './evidence';
import { type Tier, discoveryRun } from './rivals';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export interface RankResult {
  rank: number;
  placeId: string | null;
  cid: string | null;
  domain: string | null;
  title: string;
}

/** Candidate competitors found in local search for a client. Tenant-owned. */
export const competitorSuggestion = pgTable(
  'competitor_suggestion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    name: text('name').notNull(),
    domain: text('domain'),
    placeId: text('place_id'),
    cid: text('cid'),
    rating: doublePrecision('rating'),
    votes: integer('votes'),
    appearances: integer('appearances').notNull(),
    bestRank: integer('best_rank'),
    overlapScore: doublePrecision('overlap_score').notNull(),
    status: text('status').notNull().default('suggested'), // suggested | accepted | dismissed
    createdAt: ts('created_at').notNull().defaultNow(),
    // Phase 12a discovery & rating (service-role written; app_user still updates only `status`).
    runId: uuid('run_id').references((): AnyPgColumn => discoveryRun.id, { onDelete: 'set null' }),
    category: text('category'),
    distanceKm: doublePrecision('distance_km'),
    overlap: doublePrecision('overlap'),
    activity: doublePrecision('activity'),
    tier: text('tier').$type<Tier>(), // CHECK (top|watch|minor) in the migration
    signals: jsonb('signals').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    adMatches: jsonb('ad_matches').$type<Array<{ platform: 'google' | 'meta'; accountId: string; name: string; strength: 'strong' | 'weak' }>>().notNull().default(sql`'[]'::jsonb`),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    unique('competitor_suggestion_client_place_unique').on(t.clientId, t.placeId),
    index('competitor_suggestion_agency_idx').on(t.agencyId),
    check('competitor_suggestion_tier_check', sql`${t.tier} IN ('top','watch','minor')`),
    // The status CHECK constraint and the column-scoped UPDATE grant live only in
    // migrations/0011_suggestion_status_only.sql: adding `check(...)` here makes
    // `drizzle-kit generate` propose a duplicate ADD CONSTRAINT migration (verified),
    // since the snapshot has no record of that hand-written, custom-SQL migration.
  ],
);

/** One geo-grid rank scan run of a client (groups its snapshots so rank deltas compare scan to scan). Tenant-scoped. */
export const rankScan = pgTable(
  'rank_scan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    status: text('status').$type<RankScanStatus>().notNull().default('running'),
    /** Phase 13b: weekly scheduled scan or an agency 'Scan now'. */
    trigger: text('trigger').$type<RankScanTrigger>().notNull().default('scheduled'),
    requestedBy: text('requested_by'),
    /** Settings the scan ran with (null on pre-13b rows that could not be backfilled). */
    gridSize: smallint('grid_size'),
    radiusKm: doublePrecision('radius_km'),
    keywords: jsonb('keywords').$type<string[]>(),
    estimatedUsd: doublePrecision('estimated_usd'),
    snapshots: integer('snapshots').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    index('rank_scan_client_idx').on(t.clientId, t.finishedAt),
    uniqueIndex('rank_scan_running_unique').on(t.clientId).where(sql`status = 'running'`),
    check('rank_scan_trigger_check', sql`"trigger" IN ('scheduled', 'manual')`),
    check('rank_scan_status_check', sql`status IN ('running', 'done', 'failed', 'skipped')`),
  ],
);

export type RankScanTrigger = 'scheduled' | 'manual';
export type RankScanStatus = 'running' | 'done' | 'failed' | 'skipped';
export type RankMapBounds = { west: number; south: number; east: number; north: number };

/** Static map background of a client's rank grid (Stadia static image in the evidence store). Service-role written; tenant reads via RLS. */
export const rankMapImage = pgTable(
  'rank_map_image',
  {
    clientId: uuid('client_id').primaryKey(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    settingsHash: text('settings_hash').notNull(),
    objectKey: text('object_key').notNull(),
    bounds: jsonb('bounds').$type<RankMapBounds>().notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
  },
  (t) => [foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade')],
);
export type RankMapImageRow = typeof rankMapImage.$inferSelect;

/** Local-pack results for one keyword at one grid point. Tenant-scoped (keywords reveal client strategy). */
export const rankSnapshot = pgTable(
  'rank_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    keyword: text('keyword').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    captureId: uuid('capture_id').references(() => capture.id, { onDelete: 'set null' }),
    scanId: uuid('scan_id').references(() => rankScan.id, { onDelete: 'cascade' }),
    results: jsonb('results').$type<RankResult[]>().notNull(),
    capturedAt: ts('captured_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    index('rank_snapshot_client_idx').on(t.clientId, t.keyword, t.capturedAt),
  ],
);

export interface ProspectRank { keyword: string; found: number; top3: number; averageRank: number | null }
export interface ProspectBusiness {
  competitorId: string;
  name: string;
  self: boolean;
  gbp: { rating: number | null; reviews: number | null; category: string | null; extraCategories: number } | null;
  /** null = not checked (no domain / no Meta page to look up). */
  ads: { google: number | null; meta: number | null };
  ranks: ProspectRank[];
}
/** 5b-2 decision 11: deterministic landscape report — no model text. */
export interface ProspectReportData {
  generatedAt: string;
  keywords: string[];
  /** Grid points per keyword (9 for the 3×3 scan). */
  points: number;
  scanId: string | null;
  businesses: ProspectBusiness[];
  notes: string[];
}

export const prospectReport = pgTable(
  'prospect_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    status: text('status').$type<'running' | 'ready' | 'failed'>().notNull(),
    data: jsonb('data').$type<ProspectReportData | null>(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('prospect_report_status_check', sql`status IN ('running', 'ready', 'failed')`),
    index('prospect_report_client_idx').on(t.clientId, t.createdAt),
  ],
);
