import { doublePrecision, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { capture } from './evidence';
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
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    unique('competitor_suggestion_client_place_unique').on(t.clientId, t.placeId),
    index('competitor_suggestion_agency_idx').on(t.agencyId),
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
    status: text('status').notNull().default('running'), // running | done | failed
    snapshots: integer('snapshots').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    index('rank_scan_client_idx').on(t.clientId, t.finishedAt),
  ],
);

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
