import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { capture } from './evidence';
import { competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const competitorRef = () => uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' });

/** Per-competitor schedule of each vendor source. Service role only. */
export const competitorSource = pgTable(
  'competitor_source',
  {
    competitorId: competitorRef(),
    source: text('source').notNull(), // SourceKind
    active: boolean('active').notNull().default(true),
    nextDueAt: ts('next_due_at').notNull().defaultNow(),
    lastRunAt: ts('last_run_at'),
    lastStatus: text('last_status'),
  },
  (t) => [primaryKey({ columns: [t.competitorId, t.source] }), index('competitor_source_due_idx').on(t.active, t.nextDueAt)],
);

/** Pending asynchronous vendor tasks (DataForSEO task_post). Service role only. */
export const vendorTask = pgTable('vendor_task', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendor: text('vendor').notNull(),
  kind: text('kind').notNull(), // 'google_reviews' | 'google_jobs'
  externalTaskId: text('external_task_id').notNull().unique(),
  competitorId: competitorRef(),
  status: text('status').notNull().default('pending'), // pending | done | failed
  postedAt: ts('posted_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
  error: text('error'),
});

/** A typed fact extracted from a capture (GBP profile, job posting, …). Immutable. */
export const observation = pgTable(
  'observation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    captureId: uuid('capture_id').notNull().references(() => capture.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    observedAt: ts('observed_at').notNull().defaultNow(),
  },
  (t) => [unique('observation_capture_kind_key_unique').on(t.captureId, t.kind, t.key), index('observation_competitor_kind_idx').on(t.competitorId, t.kind, t.observedAt)],
);

/** One public review. Reviewer identity is a salted hash only (spec §4.5). */
export const review = pgTable(
  'review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    source: text('source').notNull().default('google'),
    dedupeKey: text('dedupe_key').notNull(),
    externalId: text('external_id'),
    rating: integer('rating'),
    text: text('text'),
    reviewerHash: text('reviewer_hash'),
    postedAt: ts('posted_at'),
    ownerAnswer: text('owner_answer'),
    ownerAnsweredAt: ts('owner_answered_at'),
    firstCaptureId: uuid('first_capture_id').references(() => capture.id, { onDelete: 'set null' }),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [unique('review_dedupe_unique').on(t.competitorId, t.source, t.dedupeKey), index('review_competitor_posted_idx').on(t.competitorId, t.postedAt)],
);

/** One ad creative with our own first/last-seen history (inactive US ads vanish from Meta's library). */
export const ad = pgTable(
  'ad',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    platform: text('platform').notNull(), // 'meta' | 'google'
    externalId: text('external_id').notNull(),
    advertiserId: text('advertiser_id'),
    format: text('format'),
    title: text('title'),
    text: text('text'),
    mediaUrls: jsonb('media_urls').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    landingUrl: text('landing_url'),
    publisherPlatforms: jsonb('publisher_platforms').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    startedAt: ts('started_at'),
    endedAt: ts('ended_at'),
    isActive: boolean('is_active').notNull().default(true),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    firstCaptureId: uuid('first_capture_id').references(() => capture.id, { onDelete: 'set null' }),
    lastCaptureId: uuid('last_capture_id').references(() => capture.id, { onDelete: 'set null' }),
    /** The capture whose collection ended this ad (Meta: missing from the active set; Google: unseen too long). Cleared if the ad returns. */
    endedCaptureId: uuid('ended_capture_id').references(() => capture.id, { onDelete: 'set null' }),
  },
  (t) => [unique('ad_platform_external_unique').on(t.platform, t.externalId), index('ad_competitor_active_idx').on(t.competitorId, t.isActive)],
);

/** The replaced version of an edited review (3b carry-over): the review row always holds the latest text. Immutable. */
export const reviewRevision = pgTable(
  'review_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id').notNull().references(() => review.id, { onDelete: 'cascade' }),
    competitorId: competitorRef(),
    rating: integer('rating'),
    text: text('text'),
    replacedAt: ts('replaced_at').notNull().defaultNow(),
    replacedByCaptureId: uuid('replaced_by_capture_id').references(() => capture.id, { onDelete: 'set null' }),
  },
  (t) => [index('review_revision_review_idx').on(t.reviewId, t.replacedAt)],
);
