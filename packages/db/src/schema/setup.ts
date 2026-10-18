import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { contact } from './delivery';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const setupLookupSchema = z.object({
  placeId: z.string(),
  cid: z.string().nullable(),
  title: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  category: z.string().nullable(),
  phone: z.string().nullable(),
  domain: z.string().nullable(),
  rating: z.number().nullable(),
  votes: z.number().nullable(),
  lat: z.number(),
  lng: z.number(),
});
/** Phase 11a: the Google Business Profile place picked in wizard step 1 (null on the row when "can't find it"). */
export type SetupLookup = z.infer<typeof setupLookupSchema>;

export const setupSuggestionSchema = z.object({ value: z.string(), quote: z.string() });
/** `value` is a vertical-pack service id or a keyword; `quote` is the evidence text it came from. */
export type SetupSuggestion = z.infer<typeof setupSuggestionSchema>;

export const setupSuggestionsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('failed') }),
  z.object({
    status: z.literal('ready'),
    services: z.array(setupSuggestionSchema),
    keywords: z.array(setupSuggestionSchema),
    /** 14a: Google service names that match none of the vertical's areas (`quote` is the service name itself). Old rows parse as `[]`. */
    newAreas: z.array(z.object({ name: z.string(), quote: z.string() })).default([]),
    sources: z.array(z.enum(['gbp', 'reviews', 'website'])),
    generatedAt: z.string(),
  }),
]);
export type SetupSuggestions = z.infer<typeof setupSuggestionsSchema>;

export type SetupSource = 'staff' | 'agency_link' | 'platform_lead';
export type SetupSkippedStep = 'search' | 'competitors' | 'invite' | 'billing';

/**
 * Phase 11a: per-client setup-wizard state. Tenant-readable (agency + client visibility), service-role written.
 * A client without a row counts as set up (old clients, tests); migration 0067 backfills existing clients as complete.
 */
export const clientSetup = pgTable(
  'client_setup',
  {
    clientId: uuid('client_id').primaryKey().references(() => client.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    source: text('source').$type<SetupSource>().notNull().default('staff'),
    lookup: jsonb('lookup').$type<SetupLookup | null>(),
    suggestions: jsonb('suggestions').$type<SetupSuggestions>().notNull().default(sql`'{"status":"none"}'::jsonb`),
    skipped: text('skipped').array().$type<SetupSkippedStep[]>().notNull().default(sql`'{}'::text[]`),
    competitorsDoneAt: ts('competitors_done_at'),
    /** Phase 11b: the contact invited as client owner from the wizard, and the staff auth user who invited them (Cc). */
    invitedContactId: uuid('invited_contact_id').references(() => contact.id, { onDelete: 'set null' }),
    invitedBy: text('invited_by'), // auth user id (Better Auth ids are text, not uuids)
    completedAt: ts('completed_at'),
    dismissedAt: ts('dismissed_at'),
    lastChangedBy: text('last_changed_by'), // auth user id (Better Auth ids are text, not uuids)
    lastChangedRole: text('last_changed_role'),
    lastChangedAt: ts('last_changed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('client_setup_source_check', sql`${t.source} IN ('staff','agency_link','platform_lead')`),
    check('client_setup_skipped_check', sql`${t.skipped} <@ ARRAY['search','competitors','invite','billing']::text[]`),
    index('client_setup_open_idx').on(t.agencyId).where(sql`${t.completedAt} IS NULL AND ${t.dismissedAt} IS NULL`),
  ],
);

export type ClientSetupRow = typeof clientSetup.$inferSelect;
