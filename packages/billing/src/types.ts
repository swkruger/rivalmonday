import type { ConnectGateway } from './connect-gateway-types';
import type { BillingInterval, SeatTier } from './pricing';

/** Gateway contract for platform → agency billing. All money is integer cents (USD). */

export class InvalidSignature extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message);
    this.name = 'InvalidSignature';
  }
}

/** The slice of a Stripe event the webhook handler reads. */
export interface StripeEventLike {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';

export interface SubscriptionItem {
  id: string;
  priceId: string;
  quantity: number;
}

export interface GatewaySubscription {
  id: string;
  status: SubscriptionStatus;
  customerId: string;
  cancelAtPeriodEnd: boolean;
  /** Start of the current billing period (Stripe item `current_period_start`); optional for older fixtures. */
  currentPeriodStart?: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  /** Quantity of the per-seat price line (0 when the seat line is absent). */
  seatQuantity: number;
  /** Billing interval of the base line (`price.recurring.interval`). */
  interval: BillingInterval;
  hasDefaultPaymentMethod: boolean;
  items: SubscriptionItem[];
}

/** `switched: false` = the immediate charge failed and Stripe kept the monthly prices (`currentPeriodEnd` is then null). */
export interface IntervalSwitchResult {
  switched: boolean;
  currentPeriodEnd: Date | null;
}

export interface UpcomingInvoice {
  amountDueCents: number;
  periodEnd: Date;
  discountCents: number;
}

export interface GatewayInvoice {
  id: string;
  number: string | null;
  amountPaidCents: number;
  status: string | null;
  hostedInvoiceUrl: string | null;
  created: Date;
}

/** Stripe rejects a Checkout `subscription_data.trial_end` less than 48 h ahead; one hour of slack covers the redirect. */
export const MIN_TRIAL_END_LEAD_MS = 49 * 3_600_000;
export const trialEndUsable = (trialEnd: Date, now: Date = new Date()): boolean => trialEnd.getTime() > now.getTime() + MIN_TRIAL_END_LEAD_MS;

export interface CheckoutSessionInput {
  customerId: string;
  basePriceId: string;
  seatPriceId: string;
  /** 0 = no seat line on the subscription (Stripe would bill a zero line; `updateSeatQuantity` adds it later). */
  seatQty: number;
  /** Billing interval the passed price ids belong to (callers pick the matching ids). */
  interval: BillingInterval;
  /** Dropped unless at least `MIN_TRIAL_END_LEAD_MS` ahead (Stripe requires 48 h). */
  trialEnd?: Date;
  couponId?: string;
  allowPromotionCodes: boolean;
  successUrl: string;
  cancelUrl: string;
}

export interface PlanPriceInput {
  code: string;
  version: number;
  name: string;
  basePriceCents: number;
  /** Graduated seat price: `upTo` = cumulative extra clients, last tier null. */
  seatTiers: SeatTier[];
  /** Yearly base price; null = the plan has no yearly prices. Yearly seat tiers are 12 x the monthly tiers. */
  basePriceYearCents: number | null;
  /** Existing base product (reused across plan versions); created only when missing. */
  stripeProductId?: string | null;
  /** Existing seat product (reused across plan versions); created only when missing. */
  stripeSeatProductId?: string | null;
}

export interface CreatedPrices {
  baseProductId: string;
  seatProductId: string;
  basePriceId: string;
  seatPriceId: string;
  /** null when the plan has no yearly base. */
  basePriceYearId: string | null;
  seatPriceYearId: string | null;
}

export interface CreateCouponInput {
  percentOff?: number;
  amountOffCents?: number;
  duration: 'once' | 'repeating' | 'forever';
  /** Required when duration is `repeating`. */
  durationInMonths?: number;
  /** Product ids the coupon is restricted to: base -> [baseProductId], seats -> [seatProductId], both -> both. Empty/omitted = all. */
  appliesToProductIds?: string[];
  name?: string;
  /** Caps direct attaches too (the promotion code carries its own copy). */
  maxRedemptions?: number;
  redeemBy?: Date;
}

export interface CreatePromotionCodeInput {
  couponId: string;
  code: string;
  customerId?: string;
  expiresAt?: Date;
  maxRedemptions?: number;
}

/** Phase 10 f7: an agency's billing details copied to its Stripe customer before Checkout. Absent fields are left as they are. */
export interface CustomerDetails {
  email?: string;
  name?: string;
  address?: { line1: string; line2?: string; city: string; state: string; postal_code: string; country: string };
  /** Sent to Stripe only when it looks like a US EIN (`US_EIN_PATTERN`); anything else is ignored. */
  taxId?: string;
}

export const US_EIN_PATTERN = /^\d{2}-?\d{7}$/;

/** A US EIN in Stripe's `NN-NNNNNNN` form, or null when `raw` is not one (`US_EIN_PATTERN` after trimming). */
export function normalizeUsEin(raw: string | null | undefined): string | null {
  const v = raw?.trim() ?? '';
  if (!US_EIN_PATTERN.test(v)) return null;
  const digits = v.replace('-', '');
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export interface BillingGateway extends ConnectGateway {
  createCustomer(i: { agencyId: string; name: string; email?: string }): Promise<{ id: string }>;
  /**
   * Updates the customer's email/name/address; adds a `us_ein` tax id (normalised to `NN-NNNNNNN`) when `taxId` matches
   * `US_EIN_PATTERN` and the customer does not already have it.
   */
  updateCustomer(customerId: string, d: CustomerDetails): Promise<void>;
  createCheckoutSession(i: CheckoutSessionInput): Promise<{ url: string }>;
  createPortalSession(i: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Sets the seat line's quantity (`invoiceNow` + `prorate`: `always_invoice`); adds the line (price `seatPriceId`) when the subscription has none and `qty > 0`. */
  updateSeatQuantity(subscriptionId: string, qty: number, opts: { prorate: boolean; seatPriceId?: string | null; invoiceNow?: boolean }): Promise<void>;
  /**
   * Moves the subscription to another plan version's prices: base line -> `basePriceId`, seat line -> `seatPriceId` at
   * `seatQuantity` (added when absent and > 0, removed at 0). No proration: the new prices apply from the next billing date.
   * Throws when the subscription has no base line.
   */
  swapSubscriptionPlan(subscriptionId: string, i: { basePriceId: string; seatPriceId: string; seatQuantity: number }): Promise<{ currentPeriodEnd: Date | null }>;
  /**
   * Moves a monthly subscription to the same plan's yearly prices (swap semantics) with `proration_behavior: 'always_invoice'`
   * and `payment_behavior: 'pending_if_incomplete'`: the prorated difference is charged immediately and the yearly prices
   * apply only if that payment succeeds. A failed charge leaves a Stripe `pending_update` (or a card error) and returns
   * `{ switched: false }`: the subscription stays monthly. Throws when the subscription has no base line.
   */
  switchSubscriptionInterval(subscriptionId: string, i: { basePriceId: string; seatPriceId: string; seatQuantity: number }): Promise<IntervalSwitchResult>;
  getSubscription(subscriptionId: string): Promise<GatewaySubscription>;
  upcomingInvoice(subscriptionId: string): Promise<UpcomingInvoice | null>;
  listInvoices(customerId: string, limit?: number): Promise<GatewayInvoice[]>;
  createPrices(plan: PlanPriceInput): Promise<CreatedPrices>;
  createCoupon(i: CreateCouponInput): Promise<{ id: string }>;
  createPromotionCode(i: CreatePromotionCodeInput): Promise<{ id: string }>;
  deactivatePromotionCode(id: string): Promise<void>;
  /** Replaces the subscription's discounts with this coupon (subscription-level discount). */
  attachSubscriptionDiscount(i: { subscriptionId: string; couponId: string }): Promise<void>;
  /** Phase 15c3a: stops invoicing without cancelling (`pause_collection: { behavior: 'void' }`); `stripeAccount` targets a client's Connect subscription. */
  pauseCollection(subscriptionId: string, o?: { stripeAccount?: string }): Promise<void>;
  /** Undoes `pauseCollection` (`pause_collection: ''`). */
  resumeCollection(subscriptionId: string, o?: { stripeAccount?: string }): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): StripeEventLike;
}
