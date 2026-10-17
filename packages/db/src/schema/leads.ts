import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { SetupLookup } from './setup';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

const previewBusinessSchema = z.object({ name: z.string(), rating: z.number().nullable(), votes: z.number().nullable() });

/** Phase 11c: the free-preview snapshot stored on `lead.preview`. */
export const leadPreviewSchema = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['none', 'pending', 'failed']) }),
  z.object({
    status: z.literal('ready'),
    self: previewBusinessSchema,
    nearby: z.array(previewBusinessSchema.extend({ distanceKm: z.number() })).max(5),
    facts: z.array(z.string()),
    summary: z.string().nullable(),
    category: z.string(),
    generatedAt: z.string(),
  }),
]);
export type LeadPreview = z.infer<typeof leadPreviewSchema>;

export type LeadSource = 'agency_link' | 'platform';
export type LeadStatus = 'unverified' | 'verified' | 'accepted' | 'declined' | 'expired';

/** Phase 11c: an agency's public intake slug. Select-only for agency staff; written by the service role. */
export const intakeLink = pgTable(
  'intake_link',
  {
    agencyId: uuid('agency_id').primaryKey().references(() => agency.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [check('intake_link_slug_check', sql`${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'`)],
);

/** Phase 11c: a prospective client's intake. `agency_id` null = platform pool (service role only). */
export const lead = pgTable(
  'lead',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    source: text('source').$type<LeadSource>().notNull(),
    ref: text('ref'),
    status: text('status').$type<LeadStatus>().notNull().default('unverified'),
    contactName: text('contact_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    message: text('message'),
    lookup: jsonb('lookup').$type<SetupLookup>().notNull(),
    preview: jsonb('preview').$type<LeadPreview>().notNull().default(sql`'{"status":"none"}'::jsonb`),
    verifyTokenHash: text('verify_token_hash'),
    verifyExpiresAt: ts('verify_expires_at'),
    viewTokenHash: text('view_token_hash'),
    verifiedAt: ts('verified_at'),
    assignedBy: text('assigned_by'), // auth user id (Better Auth ids are text, not uuids)
    assignedAt: ts('assigned_at'),
    decidedBy: text('decided_by'), // auth user id (text)
    decidedAt: ts('decided_at'),
    clientId: uuid('client_id').references(() => client.id, { onDelete: 'set null' }),
    ipHash: text('ip_hash'),
    confirmationSentAt: ts('confirmation_sent_at'),
    agencyNotifiedAt: ts('agency_notified_at'),
    declinedNotifiedAt: ts('declined_notified_at'),
    poolNotifiedAt: ts('pool_notified_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('lead_source_check', sql`${t.source} IN ('agency_link','platform')`),
    check('lead_status_check', sql`${t.status} IN ('unverified','verified','accepted','declined','expired')`),
    check('lead_ref_check', sql`char_length(${t.ref}) <= 80`),
    check('lead_contact_name_check', sql`char_length(${t.contactName}) BETWEEN 1 AND 120`),
    check('lead_email_check', sql`char_length(${t.email}) <= 320`),
    check('lead_phone_check', sql`char_length(${t.phone}) <= 40`),
    check('lead_message_check', sql`char_length(${t.message}) <= 500`),
    index('lead_agency_status_idx').on(t.agencyId, t.status, sql`${t.createdAt} DESC`),
    index('lead_pool_idx').on(sql`${t.createdAt} DESC`).where(sql`${t.agencyId} IS NULL AND ${t.status} = 'verified'`),
    uniqueIndex('lead_dedupe_idx')
      .on(sql`coalesce(${t.agencyId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.email})`, sql`(${t.lookup}->>'placeId')`)
      .where(sql`${t.status} IN ('unverified','verified')`),
  ],
);

/** Phase 11c: atomic public-intake rate counters. Service role only (no policy, all privileges revoked from app_user). */
export const intakeRate = pgTable(
  'intake_rate',
  {
    key: text('key').notNull(),
    windowStart: ts('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export type LeadRow = typeof lead.$inferSelect;
