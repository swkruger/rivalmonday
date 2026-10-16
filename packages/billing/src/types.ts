import type { ConnectGateway } from './connect-gateway-types';

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
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  /** Quantity of the per-seat price line (0 when the seat line is absent). */
  seatQuantity: number;
  hasDefaultPaymentMethod: boolean;
  items: SubscriptionItem[];
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
  seatPriceCents: number;
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

export interface BillingGateway extends ConnectGateway {
  createCustomer(i: { agencyId: string; name: string; email?: string }): Promise<{ id: string }>;
  /** Updates the customer's email/name/address; adds a `us_ein` tax id when `taxId` matches `US_EIN_PATTERN` (a duplicate is ignored). */
  updateCustomer(customerId: string, d: CustomerDetails): Promise<void>;
  createCheckoutSession(i: CheckoutSessionInput): Promise<{ url: string }>;
  createPortalSession(i: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Sets the seat line's quantity; adds the line (price `seatPriceId`) when the subscription has none and `qty > 0`. */
  updateSeatQuantity(subscriptionId: string, qty: number, opts: { prorate: boolean; seatPriceId?: string | null }): Promise<void>;
  getSubscription(subscriptionId: string): Promise<GatewaySubscription>;
  upcomingInvoice(subscriptionId: string): Promise<UpcomingInvoice | null>;
  listInvoices(customerId: string, limit?: number): Promise<GatewayInvoice[]>;
  createPrices(plan: PlanPriceInput): Promise<CreatedPrices>;
  createCoupon(i: CreateCouponInput): Promise<{ id: string }>;
  createPromotionCode(i: CreatePromotionCodeInput): Promise<{ id: string }>;
  deactivatePromotionCode(id: string): Promise<void>;
  /** Replaces the subscription's discounts with this coupon (subscription-level discount). */
  attachSubscriptionDiscount(i: { subscriptionId: string; couponId: string }): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): StripeEventLike;
}
