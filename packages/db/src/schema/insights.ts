import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { capture, trackedPage } from './evidence';
import { review } from './sources';
import { competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const competitorRef = () => uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' });

export type ThemeProposalStatus = 'proposed' | 'approved' | 'rejected' | 'none';
export type PriceQualifier = 'exact' | 'from' | 'up_to';

/** Themes and sentiment of one review for one vertical (spec §6.5). Global, derived; written by the review_themes stage. */
export const reviewAnalysis = pgTable(
  'review_analysis',
  {
    reviewId: uuid('review_id').notNull().references(() => review.id, { onDelete: 'cascade' }),
    verticalId: text('vertical_id').notNull(),
    competitorId: competitorRef(),
    /** sha256 of the analysed text (an edited review is re-analysed and this row replaced). */
    textSha: text('text_sha').notNull(),
    /** Theme ids asked with enough confidence — the denominator of a theme's share. */
    asked: jsonb('asked').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Theme ids the review talks about (subset of `asked`). */
    themes: jsonb('themes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Raises a topic none of the asked themes covers (feeds theme discovery). */
    other: boolean('other').notNull().default(false),
    /** 0 very negative … 4 very positive; null when below confidence. */
    sentiment: integer('sentiment'),
    confidence: doublePrecision('confidence').notNull(),
    needsReview: boolean('needs_review').notNull().default(false),
    analysisVersion: integer('analysis_version').notNull(),
    analyzedAt: ts('analyzed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.verticalId] }), index('review_analysis_competitor_idx').on(t.competitorId, t.verticalId)],
);

/** An LLM-proposed review theme awaiting AM approval (spec §6.5 theme discovery). Per vertical, platform-wide. Service role only. */
export const themeProposal = pgTable(
  'theme_proposal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    verticalId: text('vertical_id').notNull(),
    /** Slug; '' for a 'none' row (the model found no new theme). */
    themeId: text('theme_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    status: text('status').$type<ThemeProposalStatus>().notNull().default('proposed'),
    /** Unthemed "other" reviews that triggered the proposal. */
    otherCount: integer('other_count').notNull(),
    sampleReviewIds: jsonb('sample_review_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: ts('created_at').notNull().defaultNow(),
    decidedAt: ts('decided_at'),
    decidedBy: text('decided_by'),
  },
  (t) => [
    uniqueIndex('theme_proposal_live_unique').on(t.verticalId, t.themeId).where(sql`status IN ('proposed', 'approved')`),
    index('theme_proposal_vertical_idx').on(t.verticalId, t.createdAt),
  ],
);

/** Service mapping of a priced web block, by block text hash (spec §6.6). A block is mapped once. Service role only. */
export const priceBlockMap = pgTable(
  'price_block_map',
  {
    textSha: text('text_sha').notNull(),
    verticalId: text('vertical_id').notNull(),
    /** Null = no single service, or the mapping was below confidence (never re-asked). */
    serviceId: text('service_id'),
    confidence: doublePrecision('confidence').notNull(),
    needsReview: boolean('needs_review').notNull().default(false),
    mappedAt: ts('mapped_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.textSha, t.verticalId] })],
);

/** A price a competitor shows for a service, as a span of captures (spec §6.6 price_point time series). Global public fact. */
export const pricePoint = pgTable(
  'price_point',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: competitorRef(),
    trackedPageId: uuid('tracked_page_id').notNull().references(() => trackedPage.id, { onDelete: 'cascade' }),
    verticalId: text('vertical_id').notNull(),
    serviceId: text('service_id').notNull(),
    amount: doublePrecision('amount').notNull(),
    /** 'USD' or 'USD/<per unit>' (numeric rule layer units). */
    unit: text('unit').notNull(),
    qualifier: text('qualifier').$type<PriceQualifier>().notNull(),
    /** The block presents it as an offer (special, sale, coupon …). */
    promo: boolean('promo').notNull().default(false),
    raw: text('raw').notNull(),
    /** Redacted ~80 characters around the price. */
    context: text('context').notNull(),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    firstCaptureId: uuid('first_capture_id').notNull().references(() => capture.id),
    lastCaptureId: uuid('last_capture_id').notNull().references(() => capture.id),
    /** Capture time of the first later capture of the page that no longer showed this price. */
    endedAt: ts('ended_at'),
    endedCaptureId: uuid('ended_capture_id').references(() => capture.id),
  },
  (t) => [
    uniqueIndex('price_point_open_unique').on(t.trackedPageId, t.verticalId, t.serviceId, t.unit, t.qualifier, t.amount).where(sql`ended_at IS NULL`),
    index('price_point_series_idx').on(t.competitorId, t.verticalId, t.serviceId, t.firstSeenAt),
  ],
);
