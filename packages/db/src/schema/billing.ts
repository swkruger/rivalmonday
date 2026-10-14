import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agency } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const BILLING_STATES = ['pilot', 'trialing', 'active', 'past_due', 'read_only', 'suspended', 'cancelled'] as const;
export type BillingState = (typeof BILLING_STATES)[number];

/** Phase 9a: versioned platform plans. Service role only (forced RLS, no policy, nothing for app_user). */
export const plan = pgTable(
  'plan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    basePriceCents: integer('base_price_cents').notNull(),
    includedSeats: integer('included_seats').notNull(),
    seatPriceCents: integer('seat_price_cents').notNull(),
    trialDays: integer('trial_days').notNull(),
    stripeProductId: text('stripe_product_id'),
    stripeBasePriceId: text('stripe_base_price_id'),
    stripeSeatPriceId: text('stripe_seat_price_id'),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    unique('plan_code_version_uq').on(t.code, t.version),
    uniqueIndex('plan_current_uq').on(t.code).where(sql`${t.isCurrent}`),
    check('plan_base_price_cents_check', sql`${t.basePriceCents} >= 0`),
    check('plan_included_seats_check', sql`${t.includedSeats} >= 0`),
    check('plan_seat_price_cents_check', sql`${t.seatPriceCents} >= 0`),
    check('plan_trial_days_check', sql`${t.trialDays} BETWEEN 0 AND 90`),
  ],
);

/** Phase 9a: one billing row per agency (a missing row is treated as a serviceable pilot). */
export const agencyBilling = pgTable(
  'agency_billing',
  {
    agencyId: uuid('agency_id').primaryKey().references(() => agency.id, { onDelete: 'cascade' }),
    state: text('state').$type<BillingState>().notNull(),
    planId: uuid('plan_id').references(() => plan.id),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    trialEndsAt: ts('trial_ends_at'),
    pilotEndsAt: ts('pilot_ends_at'),
    pastDueSince: ts('past_due_since'),
    cancelAt: ts('cancel_at'),
    reviewFlaggedAt: ts('review_flagged_at'),
    billableSeatsSynced: integer('billable_seats_synced'),
    seatSyncPending: boolean('seat_sync_pending').notNull().default(false),
    attachedCouponId: text('attached_coupon_id'),
    seatCapExempt: boolean('seat_cap_exempt').notNull().default(false),
    /** Newest Stripe event timestamp applied to this row (guards against out-of-order webhooks). */
    lastStripeEventAt: ts('last_stripe_event_at'),
    stateChangedAt: ts('state_changed_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('agency_billing_state_check', sql`${t.state} IN ('pilot','trialing','active','past_due','read_only','suspended','cancelled')`)],
);

/** Phase 9a: append-only log of billing state transitions. */
export const agencyBillingEvent = pgTable(
  'agency_billing_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    reason: text('reason').notNull(),
    actor: text('actor').notNull(),
    stripeEventId: text('stripe_event_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('agency_billing_event_agency_idx').on(t.agencyId, t.createdAt)],
);

/** Phase 9a: processed Stripe webhook events (dedupe by event id). */
export const stripeEvent = pgTable('stripe_event', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: ts('received_at').notNull().defaultNow(),
  processedAt: ts('processed_at'),
  error: text('error'),
});

export const discountCode = pgTable(
  'discount_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    stripeCouponId: text('stripe_coupon_id').notNull(),
    stripePromotionCodeId: text('stripe_promotion_code_id'),
    /** numeric(5,2); returned as a string (drizzle numeric default). */
    percentOff: numeric('percent_off', { precision: 5, scale: 2 }),
    amountOffCents: integer('amount_off_cents'),
    appliesTo: text('applies_to').$type<'base' | 'seats' | 'both'>().notNull(),
    duration: text('duration').$type<'once' | 'repeating' | 'forever'>().notNull(),
    durationMonths: integer('duration_months'),
    /** NULL = any agency. */
    restrictedAgencyIds: uuid('restricted_agency_ids').array(),
    expiresAt: ts('expires_at'),
    maxRedemptions: integer('max_redemptions'),
    createdAt: ts('created_at').notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    check('discount_code_applies_to_check', sql`${t.appliesTo} IN ('base','seats','both')`),
    check('discount_code_duration_check', sql`${t.duration} IN ('once','repeating','forever')`),
    check('discount_code_off_xor_check', sql`(${t.percentOff} IS NULL) <> (${t.amountOffCents} IS NULL)`),
  ],
);

export const agencyInviteLink = pgTable(
  'agency_invite_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPrefix: text('token_prefix').notNull(),
    offer: text('offer').$type<'pilot' | 'trial'>().notNull(),
    pilotEndsAt: ts('pilot_ends_at'),
    discountCodeId: uuid('discount_code_id').references(() => discountCode.id),
    emailLock: text('email_lock'),
    maxUses: integer('max_uses').notNull().default(1),
    uses: integer('uses').notNull().default(0),
    expiresAt: ts('expires_at').notNull(),
    note: text('note'),
    createdAt: ts('created_at').notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    check('agency_invite_link_offer_check', sql`${t.offer} IN ('pilot','trial')`),
    check('agency_invite_link_max_uses_check', sql`${t.maxUses} >= 1`),
  ],
);

/** Phase 9a (R1): billing email outbox; one row per dedupe_key. */
export const billingNotice = pgTable('billing_notice', {
  id: uuid('id').primaryKey().defaultRandom(),
  agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  params: jsonb('params').notNull().default({}),
  dedupeKey: text('dedupe_key').notNull().unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  sentAt: ts('sent_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export type PlanRow = typeof plan.$inferSelect;
export type AgencyBillingRow = typeof agencyBilling.$inferSelect;
export type AgencyBillingEventRow = typeof agencyBillingEvent.$inferSelect;
export type DiscountCodeRow = typeof discountCode.$inferSelect;
export type AgencyInviteLinkRow = typeof agencyInviteLink.$inferSelect;
export type BillingNoticeRow = typeof billingNotice.$inferSelect;
