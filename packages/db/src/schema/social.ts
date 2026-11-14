import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { capture } from './evidence';
import { competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type SocialNetwork = 'facebook' | 'instagram';
export type SocialAccountStatus = 'confirmed' | 'suggested' | 'rejected';
export type SocialConfirmedBy = 'website' | 'agency';

/** A competitor's (or the client's own business's) Facebook/Instagram account, confirmed before anything reads it (18e). Global public; service role writes. */
export const socialAccount = pgTable(
  'social_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    network: text('network').$type<SocialNetwork>().notNull(),
    handle: text('handle').notNull(),
    externalId: text('external_id'),
    url: text('url').notNull(),
    status: text('status').$type<SocialAccountStatus>().notNull(),
    confirmedBy: text('confirmed_by').$type<SocialConfirmedBy>(),
    /** Better Auth user id (text, not uuid). */
    confirmedByUser: text('confirmed_by_user'),
    gated: boolean('gated').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    lastPulledAt: ts('last_pulled_at'),
  },
  (t) => [
    unique('social_account_handle_unique').on(t.competitorId, t.network, t.handle),
    uniqueIndex('social_account_one_confirmed').on(t.competitorId, t.network).where(sql`${t.status} = 'confirmed'`),
    check('social_account_network_check', sql`${t.network} IN ('facebook','instagram')`),
    check('social_account_status_check', sql`${t.status} IN ('confirmed','suggested','rejected')`),
    check('social_account_confirmed_by_check', sql`${t.confirmedBy} IS NULL OR ${t.confirmedBy} IN ('website','agency')`),
  ],
);

/** One public post of a confirmed account, stored as published (model input only via `redactForModel`). Global public; service role writes. */
export const socialPost = pgTable(
  'social_post',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    network: text('network').$type<SocialNetwork>().notNull(),
    postId: text('post_id').notNull(),
    postedAt: ts('posted_at').notNull(),
    text: text('text').notNull().default(''),
    url: text('url').notNull(),
    isVideo: boolean('is_video').notNull().default(false),
    reactions: integer('reactions'),
    comments: integer('comments'),
    firstCaptureId: uuid('first_capture_id').notNull().references(() => capture.id),
    firstSeenAt: ts('first_seen_at').notNull(),
  },
  (t) => [
    unique('social_post_network_post_unique').on(t.network, t.postId),
    index('social_post_competitor_posted_idx').on(t.competitorId, t.postedAt.desc()),
    check('social_post_network_check', sql`${t.network} IN ('facebook','instagram')`),
  ],
);
