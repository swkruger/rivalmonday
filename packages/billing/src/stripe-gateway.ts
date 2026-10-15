import Stripe from 'stripe';
import type { ConnectedSubscription, ConnectEventLike } from './connect-gateway-types';
import {
  type BillingGateway, type GatewayInvoice, type GatewaySubscription, type StripeEventLike, type SubscriptionStatus,
  InvalidSignature, trialEndUsable,
} from './types';

/** Metadata on each Stripe price so a subscription's seat line can be found without storing price ids per agency. */
export const PRICE_ROLE_KEY = 'rm_role';

export interface StripeGatewayOptions {
  /** `whsec_...`; only needed for `verifyWebhook`. */
  webhookSecret?: string;
  /** `whsec_...` of the Connect webhook endpoint (`STRIPE_CONNECT_WEBHOOK_SECRET`); only needed for `verifyConnectWebhook`. */
  connectWebhookSecret?: string;
  /** Enables Stripe Tax on Checkout (`STRIPE_TAX_ENABLED === 'true'`). */
  taxEnabled?: boolean;
  /** Test seam: a pre-built (mocked) client. */
  client?: Stripe;
}

const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const date = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);
const idOf = (x: string | { id: string } | null | undefined): string => (typeof x === 'string' ? x : x?.id ?? '');

export function stripeGateway(secretKey: string, opts: StripeGatewayOptions = {}): BillingGateway {
  const stripe = opts.client ?? new Stripe(secretKey, { timeout: 10_000, maxNetworkRetries: 1 });

  const seatItem = (s: Stripe.Subscription) => s.items.data.find((i) => i.price.metadata?.[PRICE_ROLE_KEY] === 'seat');

  return {
    async createCustomer(i) {
      const c = await stripe.customers.create({ name: i.name, email: i.email, metadata: { agency_id: i.agencyId } });
      return { id: c.id };
    },
    async createCheckoutSession(i) {
      const tax = opts.taxEnabled === true;
      const s = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: i.customerId,
        // A zero-quantity seat line would show as a $0 line; it is added by `updateSeatQuantity` once seats are billable.
        line_items: [{ price: i.basePriceId, quantity: 1 }, ...(i.seatQty > 0 ? [{ price: i.seatPriceId, quantity: i.seatQty }] : [])],
        subscription_data: i.trialEnd && trialEndUsable(i.trialEnd) ? { trial_end: secs(i.trialEnd) } : undefined,
        // Stripe rejects `discounts` together with `allow_promotion_codes`.
        ...(i.couponId ? { discounts: [{ coupon: i.couponId }] } : { allow_promotion_codes: i.allowPromotionCodes }),
        automatic_tax: { enabled: tax },
        // Stripe Tax needs the customer's address; with an existing customer Checkout may only save it when allowed to.
        ...(tax ? { customer_update: { address: 'auto', name: 'auto' }, billing_address_collection: 'required' } : {}),
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
      });
      if (!s.url) throw new Error('Stripe returned a Checkout session without a url');
      return { url: s.url };
    },
    async createPortalSession(i) {
      const s = await stripe.billingPortal.sessions.create({ customer: i.customerId, return_url: i.returnUrl });
      return { url: s.url };
    },
    async updateSeatQuantity(subscriptionId, qty, o) {
      const s = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
      const line = seatItem(s);
      if (!line && qty === 0) return;
      if (!line && !o.seatPriceId) throw new Error(`Subscription ${subscriptionId} has no seat line and no seat price was given`);
      await stripe.subscriptions.update(subscriptionId, {
        items: [line ? { id: line.id, quantity: qty } : { price: o.seatPriceId!, quantity: qty }],
        proration_behavior: o.prorate ? 'create_prorations' : 'none',
      });
    },
    async getSubscription(id): Promise<GatewaySubscription> {
      const s = await stripe.subscriptions.retrieve(id, { expand: ['items.data.price', 'default_payment_method'] });
      const customerId = idOf(s.customer as string | { id: string });
      const customer = await stripe.customers.retrieve(customerId);
      const customerPm = !('deleted' in customer && customer.deleted) && !!(customer as Stripe.Customer).invoice_settings?.default_payment_method;
      const items = s.items.data.map((i) => ({ id: i.id, priceId: i.price.id, quantity: i.quantity ?? 0 }));
      return {
        id: s.id,
        status: s.status as SubscriptionStatus,
        customerId,
        cancelAtPeriodEnd: s.cancel_at_period_end,
        currentPeriodEnd: date(s.items.data[0]?.current_period_end),
        trialEnd: date(s.trial_end),
        seatQuantity: seatItem(s)?.quantity ?? 0,
        hasDefaultPaymentMethod: !!s.default_payment_method || customerPm,
        items,
      };
    },
    async upcomingInvoice(subscriptionId) {
      try {
        const inv = await stripe.invoices.createPreview({ subscription: subscriptionId });
        const discountCents = (inv.total_discount_amounts ?? []).reduce((n, d) => n + d.amount, 0);
        return { amountDueCents: inv.amount_due, periodEnd: new Date(inv.period_end * 1000), discountCents };
      } catch (e) {
        if ((e as { code?: string }).code === 'invoice_upcoming_none') return null;
        throw e;
      }
    },
    async listInvoices(customerId, limit = 12): Promise<GatewayInvoice[]> {
      const r = await stripe.invoices.list({ customer: customerId, limit });
      return r.data.map((i) => ({
        id: i.id as string,
        number: i.number,
        amountPaidCents: i.amount_paid,
        status: i.status,
        hostedInvoiceUrl: i.hosted_invoice_url ?? null,
        created: new Date(i.created * 1000),
      }));
    },
    async createPrices(plan) {
      const product = async (existing: string | null | undefined, name: string, role: 'base' | 'seat') =>
        existing ?? (await stripe.products.create({ name, metadata: { plan_code: plan.code, [PRICE_ROLE_KEY]: role } })).id;
      const baseProductId = await product(plan.stripeProductId, `${plan.name} base`, 'base');
      const seatProductId = await product(plan.stripeSeatProductId, `${plan.name} seat`, 'seat');
      const price = (productId: string, cents: number, role: 'base' | 'seat', nickname: string) =>
        stripe.prices.create({
          product: productId, currency: 'usd', unit_amount: cents, recurring: { interval: 'month' }, tax_behavior: 'exclusive',
          nickname, metadata: { [PRICE_ROLE_KEY]: role, plan_code: plan.code, plan_version: String(plan.version) },
        });
      const base = await price(baseProductId, plan.basePriceCents, 'base', `${plan.name} v${plan.version} base`);
      const seat = await price(seatProductId, plan.seatPriceCents, 'seat', `${plan.name} v${plan.version} seat`);
      return { baseProductId, seatProductId, basePriceId: base.id, seatPriceId: seat.id };
    },
    async createCoupon(i) {
      if ((i.percentOff == null) === (i.amountOffCents == null)) throw new Error('Coupon needs exactly one of percentOff / amountOffCents');
      const c = await stripe.coupons.create({
        name: i.name,
        ...(i.percentOff != null ? { percent_off: i.percentOff } : { amount_off: i.amountOffCents, currency: 'usd' }),
        duration: i.duration,
        ...(i.duration === 'repeating' ? { duration_in_months: i.durationInMonths } : {}),
        ...(i.appliesToProductIds?.length ? { applies_to: { products: i.appliesToProductIds } } : {}),
        ...(i.maxRedemptions ? { max_redemptions: i.maxRedemptions } : {}),
        ...(i.redeemBy ? { redeem_by: secs(i.redeemBy) } : {}),
      });
      return { id: c.id };
    },
    async createPromotionCode(i) {
      const p = await stripe.promotionCodes.create({
        promotion: { type: 'coupon', coupon: i.couponId },
        code: i.code,
        customer: i.customerId,
        expires_at: i.expiresAt ? secs(i.expiresAt) : undefined,
        max_redemptions: i.maxRedemptions,
      });
      return { id: p.id };
    },
    async deactivatePromotionCode(id) {
      await stripe.promotionCodes.update(id, { active: false });
    },
    async attachSubscriptionDiscount(i) {
      // API 2026-08-26.dahlia removed `coupon` on customers/subscriptions; `discounts` replaces the subscription's discounts.
      await stripe.subscriptions.update(i.subscriptionId, { discounts: [{ coupon: i.couponId }] });
    },
    // Connect (Phase 9b): every client object lives on the connected account, so each call carries `{ stripeAccount }`.
    async createAccountLink(i) {
      const accountId = i.accountId ?? (await stripe.accounts.create({ type: 'standard' })).id;
      const l = await stripe.accountLinks.create({ account: accountId, refresh_url: i.refreshUrl, return_url: i.returnUrl, type: 'account_onboarding' });
      return { url: l.url, accountId };
    },
    async getAccount(i) {
      const a = await stripe.accounts.retrieve(i.stripeAccount);
      return { id: a.id, chargesEnabled: !!a.charges_enabled, detailsSubmitted: !!a.details_submitted };
    },
    async createConnectedProduct(i) {
      const p = await stripe.products.create({ name: i.name }, { stripeAccount: i.stripeAccount });
      return { id: p.id };
    },
    async createConnectedPrice(i) {
      const p = await stripe.prices.create(
        { product: i.productId, currency: i.currency ?? 'usd', unit_amount: i.unitAmountCents, recurring: { interval: 'month' } },
        { stripeAccount: i.stripeAccount },
      );
      return { id: p.id };
    },
    async archiveConnectedPrice(i) {
      await stripe.prices.update(i.priceId, { active: false }, { stripeAccount: i.stripeAccount });
    },
    async createConnectedCheckout(i) {
      const opt = { stripeAccount: i.stripeAccount };
      const setup = (i.setupFeeCents ?? 0) > 0 ? i.setupFeeCents! : 0;
      // The one-time fee is charged in the price's currency (the connected account's), so read it from the price.
      const currency = setup > 0 ? (await stripe.prices.retrieve(i.priceId, {}, opt)).currency : undefined;
      const fee = (i.applicationFeePercent ?? 0) > 0 ? i.applicationFeePercent! : 0;
      const s = await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          line_items: [
            { price: i.priceId, quantity: 1 },
            ...(setup > 0 ? [{ quantity: 1, price_data: { currency: currency!, unit_amount: setup, product_data: { name: 'Setup fee' } } }] : []),
          ],
          ...(fee > 0 ? { subscription_data: { application_fee_percent: fee } } : {}),
          customer_email: i.customerEmail,
          expires_at: Math.floor(Date.now() / 1000) + 24 * 3600 - 300, // Stripe's max is 24 h: leave clock-skew headroom (R6)
          success_url: i.successUrl,
          cancel_url: i.cancelUrl,
        },
        opt,
      );
      if (!s.url) throw new Error('Stripe returned a Checkout session without a url');
      return { url: s.url };
    },
    async createConnectedPortal(i) {
      const s = await stripe.billingPortal.sessions.create({ customer: i.customerId, return_url: i.returnUrl }, { stripeAccount: i.stripeAccount });
      return { url: s.url };
    },
    async getConnectedSubscription(i): Promise<ConnectedSubscription> {
      const s = await stripe.subscriptions.retrieve(i.subscriptionId, { expand: ['items.data.price'] }, { stripeAccount: i.stripeAccount });
      return {
        id: s.id,
        status: s.status as SubscriptionStatus,
        customerId: idOf(s.customer as string | { id: string }),
        priceId: s.items.data[0]?.price.id ?? '',
        currentPeriodEnd: date(s.items.data[0]?.current_period_end),
        cancelAtPeriodEnd: s.cancel_at_period_end,
      };
    },
    async updateConnectedSubscriptionPrice(i) {
      const opt = { stripeAccount: i.stripeAccount };
      const s = await stripe.subscriptions.retrieve(i.subscriptionId, {}, opt);
      const line = s.items.data[0];
      if (!line) throw new Error(`Connected subscription ${i.subscriptionId} has no items`);
      await stripe.subscriptions.update(i.subscriptionId, { items: [{ id: line.id, price: i.priceId }], proration_behavior: 'none' }, opt);
    },
    async cancelConnectedSubscriptionAtPeriodEnd(i) {
      await stripe.subscriptions.update(i.subscriptionId, { cancel_at_period_end: true }, { stripeAccount: i.stripeAccount });
    },
    verifyConnectWebhook(rawBody, signature): ConnectEventLike {
      if (!opts.connectWebhookSecret) throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is not configured');
      try {
        const e = stripe.webhooks.constructEvent(rawBody, signature, opts.connectWebhookSecret);
        return { id: e.id, type: e.type, created: e.created, account: e.account, data: { object: e.data.object as unknown as Record<string, unknown> } };
      } catch (err) {
        throw new InvalidSignature(err instanceof Error ? err.message : undefined);
      }
    },
    verifyWebhook(rawBody, signature): StripeEventLike {
      if (!opts.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
      try {
        const e = stripe.webhooks.constructEvent(rawBody, signature, opts.webhookSecret);
        return { id: e.id, type: e.type, created: e.created, data: { object: e.data.object as unknown as Record<string, unknown> } };
      } catch (err) {
        throw new InvalidSignature(err instanceof Error ? err.message : undefined);
      }
    },
  };
}
