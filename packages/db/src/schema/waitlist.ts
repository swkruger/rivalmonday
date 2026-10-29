import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agencyInviteLink } from './billing';
import { vertical } from './catalog';
import { lead } from './leads';
import { client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const WAITLIST_KINDS = ['agency', 'business'] as const;
export const WAITLIST_STATUSES = ['new', 'invited', 'assigned', 'declined'] as const;
export const SAMPLE_STATUSES = ['requested', 'approved', 'sent', 'declined', 'failed'] as const;
export const CLIENT_COUNT_BANDS = ['1-5', '6-15', '16-50', '50+'] as const;
export type WaitlistKind = (typeof WAITLIST_KINDS)[number];
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];
export type ClientCountBand = (typeof CLIENT_COUNT_BANDS)[number];

/**
 * Phase 17a: pilot waitlist (agencies and local businesses). Platform class: forced RLS, no policy, no `app_user`
 * privilege; written and read by the service role only.
 */
export const waitlistEntry = pgTable(
  'waitlist_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<WaitlistKind>().notNull(),
    status: text('status').$type<WaitlistStatus>().notNull().default('new'),
    contactName: text('contact_name').notNull(),
    email: text('email').notNull(),
    orgName: text('org_name').notNull(),
    website: text('website'),
    location: text('location'),
    verticalId: text('vertical_id').references(() => vertical.id, { onDelete: 'set null' }),
    verticalOther: text('vertical_other'),
    clientCountBand: text('client_count_band').$type<ClientCountBand>(),
    sampleRequested: boolean('sample_requested').notNull().default(false),
    sampleBusinessName: text('sample_business_name'),
    sampleLocation: text('sample_location'),
    sampleWebsite: text('sample_website'),
    sampleStatus: text('sample_status').$type<SampleStatus>(),
    sampleClientId: uuid('sample_client_id').references(() => client.id, { onDelete: 'set null' }),
    sampleApprovedAt: ts('sample_approved_at'),
    sampleSentAt: ts('sample_sent_at'),
    inviteLinkId: uuid('invite_link_id').references(() => agencyInviteLink.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id').references(() => lead.id, { onDelete: 'set null' }),
    source: text('source'),
    ipHash: text('ip_hash').notNull(),
    confirmTokenHash: text('confirm_token_hash'),
    confirmExpiresAt: ts('confirm_expires_at'),
    emailConfirmedAt: ts('email_confirmed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    decidedAt: ts('decided_at'),
    decidedBy: text('decided_by'), // auth user id (Better Auth ids are text, not uuids)
  },
  (t) => [
    check('waitlist_entry_kind_check', sql`kind IN ('agency','business')`),
    check('waitlist_entry_status_check', sql`status IN ('new','invited','assigned','declined')`),
    check('waitlist_entry_sample_status_check', sql`sample_status IS NULL OR sample_status IN ('requested','approved','sent','declined','failed')`),
    check('waitlist_entry_sample_consistent', sql`sample_requested = (sample_status IS NOT NULL)`),
    check('waitlist_entry_agency_only', sql`kind = 'agency' OR (NOT sample_requested AND client_count_band IS NULL AND invite_link_id IS NULL)`),
    check('waitlist_entry_business_only', sql`kind = 'business' OR (vertical_id IS NULL AND vertical_other IS NULL AND lead_id IS NULL)`),
    check('waitlist_entry_band_check', sql`client_count_band IS NULL OR client_count_band IN ('1-5','6-15','16-50','50+')`),
    check('waitlist_entry_email_check', sql`email = lower(email) AND char_length(email) BETWEEN 3 AND 254`),
    check(
      'waitlist_entry_text_check',
      sql`char_length(contact_name) BETWEEN 1 AND 120 AND char_length(org_name) BETWEEN 1 AND 120
    AND coalesce(char_length(website), 0) <= 253 AND coalesce(char_length(location), 0) <= 120 AND coalesce(char_length(vertical_other), 0) <= 80
    AND coalesce(char_length(sample_business_name), 0) <= 120 AND coalesce(char_length(sample_location), 0) <= 120
    AND coalesce(char_length(sample_website), 0) <= 253 AND coalesce(char_length(source), 0) <= 200`,
    ),
    uniqueIndex('waitlist_entry_kind_email_unique').on(t.kind, t.email),
    index('waitlist_entry_kind_status_idx').on(t.kind, t.status, t.createdAt.desc()),
    index('waitlist_entry_sample_idx').on(t.sampleStatus, t.createdAt.desc()).where(sql`sample_requested`),
    uniqueIndex('waitlist_entry_confirm_token_idx').on(t.confirmTokenHash).where(sql`confirm_token_hash IS NOT NULL`),
  ],
);
export type WaitlistEntryRow = typeof waitlistEntry.$inferSelect;
