import { sql } from 'drizzle-orm';
import {
  boolean, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, vector,
} from 'drizzle-orm/pg-core';
import { capture, trackedPage } from './evidence';
import { agency, client, competitor, type ScoreThresholds } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const competitorRef = () => uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' });

/** Width of every engine embedding (ai.yaml `embeddings.dimensions` must match). */
export const EMBEDDING_DIMENSIONS = 512;
const embedding = () => vector('embedding', { dimensions: EMBEDDING_DIMENSIONS });

export type NumericKind = 'price' | 'percent' | 'duration' | 'date';

/** A number stated on a page (spec §6.1 numeric rule layer). `value` is a number except for dates (YYYY-MM-DD or MM-DD). */
export interface NumericFact {
  kind: NumericKind;
  value: number | string;
  unit: string;
  raw: string;
  context: string;
}

export interface NumericChange {
  kind: NumericKind;
  before: NumericFact | null;
  after: NumericFact | null;
  /** Percent change for price pairs, one decimal; null otherwise. */
  pct: number | null;
}

/** Spec §6.3: every score stores its factor breakdown for explainability. */
export interface ScoreFactors {
  typeWeight: number;
  size: number;
  serviceOverlap: number;
  territoryOverlap: number;
  relevance: number;
  novelty: number;
  maxSimilarity: number | null;
  needsReviewCap: boolean;
  thresholds: ScoreThresholds;
  scoringVersion: number;
}

/** Idempotency ledger for engine stages (spec §6: keyed by subject, stage and stage version). Service role only. */
export const stageRun = pgTable(
  'stage_run',
  {
    stage: text('stage').notNull(),
    stageVersion: integer('stage_version').notNull(),
    subjectId: uuid('subject_id').notNull(),
    status: text('status').notNull(), // running | done | failed
    attempts: integer('attempts').notNull().default(1),
    error: text('error'),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [primaryKey({ columns: [t.stage, t.stageVersion, t.subjectId] }), index('stage_run_status_idx').on(t.status, t.startedAt)],
);

/** Main-content blocks extracted from one web capture's HTML evidence. Global, derived. */
export const captureBlock = pgTable(
  'capture_block',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    captureId: uuid('capture_id').notNull().references(() => capture.id, { onDelete: 'cascade' }),
    competitorId: competitorRef(),
    trackedPageId: uuid('tracked_page_id').notNull().references(() => trackedPage.id, { onDelete: 'cascade' }),
    ord: integer('ord').notNull(),
    blockKey: text('block_key').notNull(),
    path: text('path').notNull(),
    text: text('text').notNull(),
    textSha: text('text_sha').notNull(),
    embedding: embedding(),
  },
  (t) => [unique('capture_block_capture_ord_unique').on(t.captureId, t.ord), index('capture_block_page_key_idx').on(t.trackedPageId, t.blockKey)],
);

/** Learned volatile regions of a tracked page (spec §6.1). Service role only. */
export const volatileBlock = pgTable(
  'volatile_block',
  {
    trackedPageId: uuid('tracked_page_id').notNull().references(() => trackedPage.id, { onDelete: 'cascade' }),
    blockKey: text('block_key').notNull(),
    maskedAt: ts('masked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.trackedPageId, t.blockKey] })],
);

/** A candidate change found by a diff stage, before tagging. Global, derived. */
export const detectedChange = pgTable(
  'detected_change',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    trackedPageId: uuid('tracked_page_id').references(() => trackedPage.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'web' (3b adds structured sources)
    kind: text('kind').notNull(), // added | removed | modified
    beforeCaptureId: uuid('before_capture_id').references(() => capture.id),
    afterCaptureId: uuid('after_capture_id').notNull().references(() => capture.id),
    blockKey: text('block_key'),
    beforeText: text('before_text'),
    afterText: text('after_text'),
    similarity: doublePrecision('similarity'),
    numericChanges: jsonb('numeric_changes').$type<NumericChange[]>().notNull().default(sql`'[]'::jsonb`),
    flags: jsonb('flags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('pending'), // pending | event | cosmetic
    stageVersion: integer('stage_version').notNull(),
    detectedAt: ts('detected_at').notNull().defaultNow(),
  },
  (t) => [
    unique('detected_change_unique').on(t.afterCaptureId, t.kind, t.blockKey, t.stageVersion),
    index('detected_change_status_idx').on(t.status, t.detectedAt),
    index('detected_change_page_key_idx').on(t.trackedPageId, t.blockKey),
  ],
);

/** A tagged, meaningful competitor event (spec §6.2). Global public fact; private scores live in event_score. */
export const changeEvent = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    changeType: text('change_type').notNull(), // ChangeType
    /** Service id per vertical pack id (null = no single service). */
    services: jsonb('services').$type<Record<string, string | null>>().notNull().default(sql`'{}'::jsonb`),
    summary: text('summary').notNull(),
    facts: jsonb('facts').$type<NumericChange[]>().notNull().default(sql`'[]'::jsonb`),
    zips: jsonb('zips').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    embedding: embedding(),
    confidence: doublePrecision('confidence').notNull(),
    needsReview: boolean('needs_review').notNull().default(false),
    occurredAt: ts('occurred_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('event_competitor_time_idx').on(t.competitorId, t.occurredAt), index('event_created_idx').on(t.createdAt)],
);

/** Evidence chain: which detected changes an event is built from (3b merges several into one event). */
export const eventChange = pgTable(
  'event_change',
  {
    eventId: uuid('event_id').notNull().references(() => changeEvent.id, { onDelete: 'cascade' }),
    changeId: uuid('change_id').notNull().references(() => detectedChange.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.changeId] }), unique('event_change_change_unique').on(t.changeId)],
);

/** Per-client score and route of an event (spec §6.3). Tenant-private. */
export const eventScore = pgTable(
  'event_score',
  {
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    eventId: uuid('event_id').notNull().references(() => changeEvent.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    route: text('route').notNull(), // alert | brief | archive
    factors: jsonb('factors').$type<ScoreFactors>().notNull(),
    packVersion: integer('pack_version').notNull(),
    scoredAt: ts('scored_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.eventId] }),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    index('event_score_agency_idx').on(t.agencyId),
    index('event_score_client_route_idx').on(t.clientId, t.route, t.scoredAt),
  ],
);

/** Decisions still below threshold after the cascade (spec §7.3 → AM review queue; UI in Phase 5). Service role only. */
export const decisionReview = pgTable(
  'decision_review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectType: text('subject_type').notNull(), // 'detected_change'
    subjectId: uuid('subject_id').notNull(),
    keys: jsonb('keys').$type<string[]>().notNull(),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    resolvedAt: ts('resolved_at'),
  },
  (t) => [index('decision_review_open_idx').on(t.resolvedAt, t.createdAt)],
);
