import { sql } from 'drizzle-orm';
import { boolean, check, date, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { capture } from './evidence';
import { competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type ListedEventStatus = 'scheduled' | 'cancelled' | 'postponed' | 'sold_out';
export type ListedEventSource = 'web' | 'meta_ads' | 'google_panel';

/** One event a competitor (or the client's own business) lists, merged across sources by `event_key` (18d). Global public; service role writes. */
export const listedEvent = pgTable(
  'listed_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    eventKey: text('event_key').notNull(),
    name: text('name').notNull(),
    nameNorm: text('name_norm').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    startsAt: ts('starts_at'),
    endsAt: ts('ends_at'),
    status: text('status').$type<ListedEventStatus>().notNull().default('scheduled'),
    sources: text('sources').array().$type<ListedEventSource[]>().notNull(),
    url: text('url'),
    venue: text('venue'),
    ticketed: boolean('ticketed').notNull().default(false),
    series: boolean('series').notNull().default(false),
    firstCaptureId: uuid('first_capture_id').notNull().references(() => capture.id),
    lastCaptureId: uuid('last_capture_id').notNull().references(() => capture.id),
    statusCaptureId: uuid('status_capture_id').references(() => capture.id),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    statusChangedAt: ts('status_changed_at'),
  },
  (t) => [
    unique('listed_event_key_unique').on(t.competitorId, t.eventKey),
    index('listed_event_upcoming_idx').on(t.competitorId, t.startDate),
    check('listed_event_status_check', sql`${t.status} IN ('scheduled','cancelled','postponed','sold_out')`),
    check('listed_event_sources_check', sql`${t.sources} <@ ARRAY['web','meta_ads','google_panel']::text[] AND cardinality(${t.sources}) > 0`),
  ],
);
