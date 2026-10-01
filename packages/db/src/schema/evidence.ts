import { boolean, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { competitor } from './tenancy';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** A competitor page we monitor. Global public data, shared by every client tracking the competitor. */
export const trackedPage = pgTable(
  'tracked_page',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    pageType: text('page_type').notNull(),
    source: text('source').notNull(), // 'sitemap' | 'nav' | 'manual'
    pinned: boolean('pinned').notNull().default(false),
    active: boolean('active').notNull().default(true),
    cadence: text('cadence').notNull(), // 'daily' | 'weekly'
    nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull().defaultNow(),
    lastCapturedAt: timestamp('last_captured_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('tracked_page_competitor_url_unique').on(t.competitorId, t.url),
    index('tracked_page_due_idx').on(t.active, t.nextDueAt),
  ],
);

/** One collection attempt (web page, vendor call). Immutable. */
export const capture = pgTable(
  'capture',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    trackedPageId: uuid('tracked_page_id').references(() => trackedPage.id, { onDelete: 'set null' }),
    source: text('source').notNull(), // 'web' | vendor source ids in Phase 2b
    url: text('url'),
    status: text('status').notNull(), // CaptureStatus
    httpStatus: integer('http_status'),
    error: text('error'),
    collectorVersion: text('collector_version').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('capture_competitor_time_idx').on(t.competitorId, t.capturedAt),
    index('capture_page_time_idx').on(t.trackedPageId, t.capturedAt),
  ],
);

/** A stored artefact of a capture (html, text, screenshot, vendor json). Immutable. */
export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    captureId: uuid('capture_id').notNull().references(() => capture.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'html' | 'text' | 'screenshot' | 'vendor_json'
    objectKey: text('object_key').notNull(),
    sha256: text('sha256').notNull(),
    bytes: integer('bytes').notNull(),
    contentType: text('content_type').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('evidence_capture_kind_unique').on(t.captureId, t.kind), index('evidence_sha_idx').on(t.sha256)],
);
