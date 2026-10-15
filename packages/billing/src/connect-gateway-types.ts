/** Stripe Connect (Standard accounts) gateway contract for agency -> client billing (Phase 9b). Money is integer cents. */
import type { StripeEventLike, SubscriptionStatus } from './types';

/** A Connect webhook event: the base event plus the connected account it happened on (absent for platform-level events). */
export interface ConnectEventLike extends StripeEventLike {
  account?: string;
}

export interface ConnectedAccount {
  id: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface ConnectedSubscription {
  id: string;
  status: SubscriptionStatus;
  customerId: string;
  /** Price of the first subscription item (the monthly client price). */
  priceId: string;
  /** What that price charges per month in cents (null when Stripe does not say). */
  unitAmountCents: number | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Every method except `createAccountLink` acts on the connected account `stripeAccount` (`acct_...`). */
export interface ConnectGateway {
  /** Without `accountId`, creates a `standard` account on the platform first; returns the onboarding link. */
  createAccountLink(i: { accountId?: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string; accountId: string }>;
  getAccount(i: { stripeAccount: string }): Promise<ConnectedAccount>;
  createConnectedProduct(i: { stripeAccount: string; name: string }): Promise<{ id: string }>;
  /** Monthly recurring price. `currency` defaults to `usd`. */
  createConnectedPrice(i: { stripeAccount: string; productId: string; unitAmountCents: number; currency?: string }): Promise<{ id: string }>;
  archiveConnectedPrice(i: { stripeAccount: string; priceId: string }): Promise<void>;
  /** R20: whether a stored price can still be used for a new Checkout (archived = `active: false`). Throws `resource_missing` for an unknown price. */
  getConnectedPrice(i: { stripeAccount: string; priceId: string }): Promise<{ id: string; active: boolean; unitAmountCents: number | null }>;
  /** Subscription Checkout; the one-time setup fee line only when `setupFeeCents > 0`, the application fee only when `applicationFeePercent > 0`. Link expires after 24 h. */
  createConnectedCheckout(i: {
    stripeAccount: string;
    priceId: string;
    setupFeeCents?: number;
    customerEmail: string;
    /** Stored as the session's `client_reference_id`: lets the webhook find the client of a session that was since replaced. */
    clientReferenceId?: string;
    applicationFeePercent?: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; id: string }>;
  /** Expires an open Checkout session (its link stops working). Rejects when the session is already complete. */
  expireConnectedCheckout(i: { stripeAccount: string; sessionId: string }): Promise<void>;
  /** Status of a Checkout session (`complete` = the client paid). Throws `resource_missing` for an unknown session. */
  getConnectedCheckout(i: { stripeAccount: string; sessionId: string }): Promise<{ id: string; status: 'open' | 'expired' | 'complete' }>;
  /** The Stripe customer a charge belongs to (dispute events carry only the charge id). */
  getConnectedCharge(i: { stripeAccount: string; chargeId: string }): Promise<{ id: string; customerId: string | null }>;
  /** R25: a Customer Portal configuration on the connected account (payment method update + invoice history, no cancel). */
  createConnectedPortalConfiguration(i: { stripeAccount: string }): Promise<{ id: string }>;
  /** `configuration` (R25): the account's portal configuration; without it Stripe needs a saved default on that account. */
  createConnectedPortal(i: { stripeAccount: string; customerId: string; returnUrl: string; configuration?: string }): Promise<{ url: string }>;
  getConnectedSubscription(i: { stripeAccount: string; subscriptionId: string }): Promise<ConnectedSubscription>;
  /** Swaps the first item's price. `prorate: false` only (a price change applies from the next bill). */
  updateConnectedSubscriptionPrice(i: { stripeAccount: string; subscriptionId: string; priceId: string; prorate: false }): Promise<void>;
  cancelConnectedSubscriptionAtPeriodEnd(i: { stripeAccount: string; subscriptionId: string }): Promise<void>;
  verifyConnectWebhook(rawBody: string, signature: string): ConnectEventLike;
}
