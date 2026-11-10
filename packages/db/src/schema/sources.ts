import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { competitorSuggestion } from './client-intel';
import { capture, evidence } from './evidence';
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
export const vendorTask = pgTable(
  'vendor_task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendor: text('vendor').notNull(),
    kind: text('kind').notNull(), // 'google_reviews' | 'google_jobs'
    externalTaskId: text('external_task_id').notNull().unique(),
    /** Exactly one of competitorId / suggestionId is set (vendor_task_subject_check). */
    competitorId: uuid('competitor_id').references(() => competitor.id, { onDelete: 'cascade' }),
    suggestionId: uuid('suggestion_id').references(() => competitorSuggestion.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // pending | done | failed
    postedAt: ts('posted_at').notNull().defaultNow(),
    completedAt: ts('completed_at'),
    error: text('error'),
  },
  () => [check('vendor_task_subject_check', sql`(competitor_id IS NULL) <> (suggestion_id IS NULL)`)],
);

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
    /** Event the ad promotes (18a-1), from the ad text; null when none. */
    event: jsonb('event').$type<{ name: string; startsAt: string | null } | null>(),
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

/** One Google Business Profile post with our own first/last-seen history (18b-1). Global public; service role writes. */
export const gbpPost = pgTable(
  'gbp_post',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    externalId: text('external_id').notNull(),
    text: text('text'),
    url: text('url'),
    buttonUrl: text('button_url'),
    postedAt: ts('posted_at'),
    firstCaptureId: uuid('first_capture_id').notNull().references(() => capture.id),
    lastCaptureId: uuid('last_capture_id').notNull().references(() => capture.id),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    endedCaptureId: uuid('ended_capture_id').references(() => capture.id),
    endedAt: ts('ended_at'),
  },
  (t) => [unique('gbp_post_external_unique').on(t.competitorId, t.externalId), index('gbp_post_competitor_idx').on(t.competitorId).where(sql`ended_at IS NULL`)],
);

export const AD_IMAGE_STATUSES = ['pending', 'rejected', 'triaged'] as const;
export type AdImageStatus = (typeof AD_IMAGE_STATUSES)[number];
export const AD_IMAGE_FAIL_REASONS = ['too_large', 'bad_type', 'bad_image', 'expired', 'robots', 'ssrf'] as const;
export type AdImageFailReason = (typeof AD_IMAGE_FAIL_REASONS)[number];
export const AD_IMAGE_READ_STATUSES = ['read', 'no_price', 'unconfirmed', 'failed'] as const;
export type AdImageReadStatus = (typeof AD_IMAGE_READ_STATUSES)[number];

const inList = (xs: readonly string[]) => sql.raw(xs.map((x) => `'${x}'`).join(', '));

/** One image of an ad (18a-3): fetched, triaged by Jev, stored as evidence only when it shows no person. Global public; service role writes. */
export const adImage = pgTable(
  'ad_image',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adId: uuid('ad_id').notNull().references(() => ad.id, { onDelete: 'cascade' }),
    competitorId: competitorRef(),
    /** sha256 of the normalised source URL; with adId it identifies the image. */
    sourceUrlSha: text('source_url_sha').notNull(),
    status: text('status').$type<AdImageStatus>().notNull().default('pending'),
    failReason: text('fail_reason').$type<AdImageFailReason>(),
    /** sha256 of the fetched bytes (dedupe across ads). */
    sourceSha256: text('source_sha256'),
    showsPerson: boolean('shows_person'),
    showsPrice: boolean('shows_price'),
    showsOffer: boolean('shows_offer'),
    theme: text('theme'),
    serviceIds: jsonb('service_ids').$type<Record<string, string | null>>(),
    triage: jsonb('triage').$type<{ provider: string; model: string; confidences: Record<string, number>; copiedFrom?: string }>(),
    evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'restrict' }),
    readStatus: text('read_status').$type<AdImageReadStatus>(),
    readAt: ts('read_at'),
    triagedAt: ts('triaged_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('ad_image_ad_url_unique').on(t.adId, t.sourceUrlSha),
    index('ad_image_source_sha_idx').on(t.sourceSha256),
    index('ad_image_competitor_stored_idx').on(t.competitorId, t.sourceSha256).where(sql`evidence_id IS NOT NULL`),
    index('ad_image_competitor_read_idx').on(t.competitorId, t.readAt),
    check('ad_image_status_check', sql`status IN (${inList(AD_IMAGE_STATUSES)})`),
    check('ad_image_fail_reason_check', sql`fail_reason IS NULL OR fail_reason IN (${inList(AD_IMAGE_FAIL_REASONS)})`),
    check('ad_image_rejected_reason', sql`(status = 'rejected') = (fail_reason IS NOT NULL)`),
    check('ad_image_read_status_check', sql`read_status IS NULL OR read_status IN (${inList(AD_IMAGE_READ_STATUSES)})`),
    check('ad_image_person_unstored', sql`shows_person IS NOT TRUE OR evidence_id IS NULL`),
  ],
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
