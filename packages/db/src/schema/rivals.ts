import { sql } from 'drizzle-orm';
import { check, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agency, client, competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type DiscoveryRunStatus = 'queued' | 'searching' | 'checking' | 'finalising' | 'done' | 'failed';
export type Tier = 'top' | 'watch' | 'minor';
/** `discovery_run.progress`; hiddenList holds the first 50 hidden candidates (reason = HiddenReason code). */
export type DiscoveryRunProgress = {
  searchesDone?: number; searchesTotal?: number; checksDone?: number; checksTotal?: number;
  hiddenList?: { name: string; reason: string }[];
};

/** One competitor-discovery run for a client (Phase 12a). Tenant-readable, service-role written. */
export const discoveryRun = pgTable(
  'discovery_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    status: text('status').$type<DiscoveryRunStatus>().notNull().default('queued'),
    trigger: text('trigger').$type<'auto' | 'manual' | 'convert'>().notNull(),
    keywords: jsonb('keywords').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    gridSize: integer('grid_size'),
    progress: jsonb('progress').$type<DiscoveryRunProgress>().notNull().default(sql`'{}'::jsonb`),
    kept: integer('kept'),
    /** {wrong_category, outside_area, self, closed, thin} counts. */
    hidden: jsonb('hidden').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    error: text('error'),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('discovery_run_status_check', sql`${t.status} IN ('queued','searching','checking','finalising','done','failed')`),
    check('discovery_run_trigger_check', sql`${t.trigger} IN ('auto','manual','convert')`),
    index('discovery_run_agency_day_idx').on(t.agencyId, t.startedAt),
    uniqueIndex('discovery_run_one_live').on(t.clientId).where(sql`${t.status} IN ('queued','searching','checking','finalising')`),
  ],
);

/** Latest rating of a tracked competitor for a client. Tenant-readable, service-role written. */
export const competitorSignal = pgTable(
  'competitor_signal',
  {
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    tier: text('tier').$type<Tier>().notNull(),
    overlap: doublePrecision('overlap'),
    activity: doublePrecision('activity'),
    signals: jsonb('signals').$type<Record<string, unknown>>().notNull(),
    computedAt: ts('computed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.competitorId] }),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('competitor_signal_tier_check', sql`${t.tier} IN ('top','watch','minor')`),
  ],
);

export type DiscoveryRunRow = typeof discoveryRun.$inferSelect;
export type CompetitorSignalRow = typeof competitorSignal.$inferSelect;
