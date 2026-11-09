import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
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
    /** 'gone' | 'duplicate' | 'replaced' | 'manual'; set iff `active` is false. The CHECK is hand SQL in 0102 (after its backfill), not declared here. */
    inactiveReason: text('inactive_reason'),
    /** When the page first appeared on the site (new_page detection). */
    appearedAt: timestamp('appeared_at', { withTimezone: true }),
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
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'restrict' }),
    trackedPageId: uuid('tracked_page_id').references(() => trackedPage.id, { onDelete: 'restrict' }),
    source: text('source').notNull(), // 'web' | vendor source ids in Phase 2b
    url: text('url'),
    status: text('status').notNull(), // CaptureStatus
    httpStatus: integer('http_status'),
    error: text('error'),
    collectorVersion: text('collector_version').notNull(),
    /** Spec §4.4: blocks retention deletion. The only column of a capture that may ever change. */
    legalHold: boolean('legal_hold').notNull().default(false),
    /** Hash of the page's markup (web readiness 18a-2); null for captures made before it. */
    markupSha: text('markup_sha'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('capture_competitor_time_idx').on(t.competitorId, t.capturedAt),
    index('capture_page_time_idx').on(t.trackedPageId, t.capturedAt),
  ],
);

/** Evidence artefact kinds (evidence.kind is a plain string column). */
export const EVIDENCE_KINDS = ['html', 'text', 'screenshot', 'vendor_json', 'image'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** A stored artefact of a capture (html, text, screenshot, vendor json). Immutable. */
export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    captureId: uuid('capture_id').notNull().references(() => capture.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(), // 'html' | 'text' | 'screenshot' | 'vendor_json' | 'image' (ad image, 18a-3)
    objectKey: text('object_key').notNull(),
    sha256: text('sha256').notNull(),
    bytes: integer('bytes').notNull(),
    contentType: text('content_type').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('evidence_capture_kind_unique').on(t.captureId, t.kind), index('evidence_sha_idx').on(t.sha256)],
);

/** URLs seen on a competitor's site (sitemap/nav discovery). Service-role only. */
export const siteUrl = pgTable(
  'site_url',
  {
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    urlKey: text('url_key').notNull(),
    url: text('url').notNull(),
    source: text('source').notNull(), // 'sitemap' | 'nav'
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'site_url_pk', columns: [t.competitorId, t.urlKey] }),
    check('site_url_source_check', sql`source IN ('sitemap', 'nav')`),
  ],
);

/** Per-competitor site discovery schedule and last-run summary. Service-role only. */
export const siteDiscovery = pgTable(
  'site_discovery',
  {
    competitorId: uuid('competitor_id').primaryKey().references(() => competitor.id, { onDelete: 'cascade' }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull().defaultNow(),
    homepageStatus: text('homepage_status'),
    urls: integer('urls').notNull().default(0),
    truncated: boolean('truncated').notNull().default(false),
    runs: integer('runs').notNull().default(0),
  },
  (t) => [index('site_discovery_due_idx').on(t.nextDueAt)],
);
