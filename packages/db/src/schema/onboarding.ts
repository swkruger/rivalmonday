import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agencyInviteLink } from './billing';
import { agency } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type OnboardingStep = 'profile' | 'team' | 'plan' | 'branding';
export type OnboardingSource = 'open' | 'invite' | 'legacy';

/**
 * Phase 10: an agency sign-up awaiting email verification. Service role only (forced RLS, no policy, nothing for
 * app_user). `ip_hash` is HMAC-SHA256(ip, auth secret); the raw IP is never stored.
 */
export const pendingSignup = pgTable(
  'pending_signup',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    agencyName: text('agency_name').notNull(),
    contactName: text('contact_name'),
    inviteLinkId: uuid('invite_link_id').references(() => agencyInviteLink.id),
    source: text('source').$type<'open' | 'invite'>().notNull(),
    ipHash: text('ip_hash').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    completedAgencyId: uuid('completed_agency_id').references(() => agency.id, { onDelete: 'set null' }),
    completedAt: ts('completed_at'),
  },
  (t) => [
    check('pending_signup_agency_name_check', sql`length(${t.agencyName}) BETWEEN 1 AND 120`),
    check('pending_signup_contact_name_check', sql`length(${t.contactName}) <= 120`),
    check('pending_signup_source_check', sql`${t.source} IN ('open','invite')`),
    uniqueIndex('pending_signup_open_email_uq').on(t.email).where(sql`${t.completedAt} IS NULL`),
    index('pending_signup_ip_idx').on(t.ipHash, t.createdAt),
  ],
);

/** Phase 10: agency business profile. Agency admin writes via RLS; account managers read. tax_id/billing_* never reach clients. */
export const agencyProfile = pgTable('agency_profile', {
  agencyId: uuid('agency_id').primaryKey().references(() => agency.id, { onDelete: 'cascade' }),
  legalName: text('legal_name'),
  website: text('website'),
  contactName: text('contact_name'),
  contactRole: text('contact_role'),
  contactEmail: text('contact_email'),
  phone: text('phone'),
  line1: text('line1'),
  line2: text('line2'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  country: text('country').notNull().default('US'),
  timezone: text('timezone').notNull().default('America/New_York'),
  verticals: text('verticals').array().notNull().default(sql`'{}'`),
  billingEmail: text('billing_email'),
  billingSameAsPostal: boolean('billing_same_as_postal').notNull().default(true),
  billingLine1: text('billing_line1'),
  billingLine2: text('billing_line2'),
  billingCity: text('billing_city'),
  billingRegion: text('billing_region'),
  billingPostalCode: text('billing_postal_code'),
  billingCountry: text('billing_country'),
  taxId: text('tax_id'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Phase 10: wizard/checklist progress per agency. app_user may only SELECT; writes run on the service connection inside tools. */
export const agencyOnboarding = pgTable(
  'agency_onboarding',
  {
    agencyId: uuid('agency_id').primaryKey().references(() => agency.id, { onDelete: 'cascade' }),
    source: text('source').$type<OnboardingSource>().notNull(),
    inviteLinkId: uuid('invite_link_id').references(() => agencyInviteLink.id),
    profileDoneAt: ts('profile_done_at'),
    profileSkippedAt: ts('profile_skipped_at'),
    teamDoneAt: ts('team_done_at'),
    teamSkippedAt: ts('team_skipped_at'),
    planDoneAt: ts('plan_done_at'),
    planSkippedAt: ts('plan_skipped_at'),
    brandingDoneAt: ts('branding_done_at'),
    brandingSkippedAt: ts('branding_skipped_at'),
    /** Phase 16: set by finish_onboarding when the agency wizard is done (nudges continue until completedAt). */
    wizardFinishedAt: ts('wizard_finished_at'),
    firstClientAt: ts('first_client_at'),
    dismissedAt: ts('dismissed_at'),
    completedAt: ts('completed_at'),
    redirectedAt: ts('redirected_at'),
    nudgesSent: smallint('nudges_sent').notNull().default(0),
    unsubscribedAt: ts('unsubscribed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('agency_onboarding_source_check', sql`${t.source} IN ('open','invite','legacy')`),
    check('agency_onboarding_nudges_sent_check', sql`${t.nudgesSent} BETWEEN 0 AND 3`),
  ],
);

export type PendingSignupRow = typeof pendingSignup.$inferSelect;
export type AgencyProfileRow = typeof agencyProfile.$inferSelect;
export type AgencyOnboardingRow = typeof agencyOnboarding.$inferSelect;
