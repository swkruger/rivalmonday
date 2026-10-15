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

export interface CheckoutSessionInput {
  customerId: string;
  basePriceId: string;
  seatPriceId: string;
  seatQty: number;
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

export interface BillingGateway {
  createCustomer(i: { agencyId: string; name: string; email?: string }): Promise<{ id: string }>;
  createCheckoutSession(i: CheckoutSessionInput): Promise<{ url: string }>;
  createPortalSession(i: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  updateSeatQuantity(subscriptionId: string, qty: number, opts: { prorate: boolean }): Promise<void>;
  getSubscription(subscriptionId: string): Promise<GatewaySubscription>;
  upcomingInvoice(subscriptionId: string): Promise<UpcomingInvoice | null>;
  listInvoices(customerId: string, limit?: number): Promise<GatewayInvoice[]>;
  createPrices(plan: PlanPriceInput): Promise<CreatedPrices>;
  createCoupon(i: CreateCouponInput): Promise<{ id: string }>;
  createPromotionCode(i: CreatePromotionCodeInput): Promise<{ id: string }>;
  deactivatePromotionCode(id: string): Promise<void>;
  attachCustomerDiscount(i: { customerId: string; couponId: string }): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): StripeEventLike;
}
