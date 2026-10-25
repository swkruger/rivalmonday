import { randomBytes } from 'node:crypto';
import type { ConnectedAccount, ConnectedSubscription, ConnectEventLike } from './connect-gateway-types';
import {
  type BillingGateway, type CheckoutSessionInput, type CreateCouponInput, type CreatePromotionCodeInput, type CustomerDetails,
  type GatewayInvoice, type GatewaySubscription, type StripeEventLike, type UpcomingInvoice, InvalidSignature, normalizeUsEin,
} from './types';

/** The only signature `fakeGateway().verifyWebhook` accepts. */
export const FAKE_WEBHOOK_SIGNATURE = 'fake-sig';

export interface FakeCall { method: string; args: unknown[] }
interface FakeCustomer { id: string; agencyId: string; name: string; email?: string; address?: CustomerDetails['address']; taxId?: string }
interface FakeCoupon extends CreateCouponInput { id: string }
interface FakePromotionCode extends CreatePromotionCodeInput { id: string; active: boolean }

interface FakeConnectedPrice { id: string; stripeAccount: string; productId: string; unitAmountCents: number; currency: string; active: boolean }
export interface FakeConnectedCheckout { id: string; stripeAccount: string; status: 'open' | 'expired' | 'complete'; clientReferenceId?: string }
export interface FakeConnectedSubscription extends ConnectedSubscription { stripeAccount: string }

export interface FakeGateway extends BillingGateway {
  readonly calls: FakeCall[];
  readonly customers: Map<string, FakeCustomer>;
  readonly subscriptions: Map<string, GatewaySubscription>;
  readonly invoices: Map<string, GatewayInvoice[]>;
  readonly coupons: Map<string, FakeCoupon>;
  readonly promotionCodes: Map<string, FakePromotionCode>;
  /** Coupons attached per subscription by `attachSubscriptionDiscount` (latest call replaces, like Stripe). */
  readonly subscriptionCoupons: Map<string, string[]>;
  /** Connect: connected accounts by id (`createAccountLink` adds one with charges disabled). */
  readonly connectedAccounts: Map<string, ConnectedAccount>;
  readonly connectedProducts: Map<string, { id: string; stripeAccount: string; name: string }>;
  readonly connectedPrices: Map<string, FakeConnectedPrice>;
  /** Connect: subscriptions by id (ids are unique across accounts; reads check the account matches). */
  readonly connectedSubscriptions: Map<string, FakeConnectedSubscription>;
  /** Connect: Checkout sessions by id (`expireConnectedCheckout` flips `open` to `expired`). */
  readonly connectedCheckouts: Map<string, FakeConnectedCheckout>;
  /** Connect: charges by id, for dispute lookups. */
  readonly connectedCharges: Map<string, { id: string; stripeAccount: string; customerId: string | null }>;
  /** Connect: Customer Portal configurations by id (R25). */
  readonly connectedPortalConfigurations: Map<string, { id: string; stripeAccount: string }>;
  /** Adds or updates a connected account (defaults: charges disabled, details not submitted). */
  seedConnectedAccount(a: Partial<ConnectedAccount> & { id: string }): ConnectedAccount;
  /** Registers a price on a connected account (defaults: product `prod_fake`, `usd`, active). Checkout refuses unknown prices. */
  seedConnectedPrice(p: { id: string; stripeAccount: string; unitAmountCents: number; productId?: string; currency?: string; active?: boolean }): FakeConnectedPrice;
  /** Stand-in for the user finishing Stripe's hosted onboarding: charges enabled, details submitted. */
  completeOnboarding(accountId: string): ConnectedAccount;
  seedConnectedCharge(c: { id: string; stripeAccount: string; customerId: string | null }): void;
  seedConnectedSubscription(s: Partial<ConnectedSubscription> & { id: string; stripeAccount: string; customerId: string }): FakeConnectedSubscription;
  /** The next gateway method call (any method) rejects with `error`; later calls succeed. */
  failNext(error?: Error): void;
  /** Every `swapSubscriptionPlan` call, in order. */
  readonly swaps: Array<{ subscriptionId: string; basePriceId: string; seatPriceId: string; seatQuantity: number }>;
  seedSubscription(sub: Partial<GatewaySubscription> & { id: string; customerId: string }): GatewaySubscription;
  seedInvoice(customerId: string, inv: Partial<GatewayInvoice> & { id: string }): GatewayInvoice;
  seedUpcoming(subscriptionId: string, upcoming: UpcomingInvoice | null): void;
  callsTo(method: string): FakeCall[];
  /** Subscription ids (platform or connected) whose collection is currently paused. */
  readonly pausedCollection: Set<string>;
  /** `pauseCollection` / `resumeCollection` for this subscription id reject (sticky until `clearCollectionFailures`). */
  failCollectionFor(subscriptionId: string, error?: Error): void;
  clearCollectionFailures(): void;
}

export interface FakeGatewayOptions {
  /**
   * E2E wiring only (`BILLING_FAKE_GATEWAY=1`): a link for an existing account finishes its onboarding, so the browser
   * flow "Connect Stripe" -> "Finish Stripe setup" reaches "connected" with no Stripe. Off by default (Stripe-like).
   */
  completeOnboardingOnRelink?: boolean;
}

export function fakeGateway(opts: FakeGatewayOptions = {}): FakeGateway {
  const calls: FakeCall[] = [];
  const swaps: FakeGateway['swaps'] = [];
  const customers = new Map<string, FakeCustomer>();
  const subscriptions = new Map<string, GatewaySubscription>();
  const invoices = new Map<string, GatewayInvoice[]>();
  const coupons = new Map<string, FakeCoupon>();
  const promotionCodes = new Map<string, FakePromotionCode>();
  const subscriptionCoupons = new Map<string, string[]>();
  const upcoming = new Map<string, UpcomingInvoice | null>();
  const connectedAccounts = new Map<string, ConnectedAccount>();
  const connectedProducts = new Map<string, { id: string; stripeAccount: string; name: string }>();
  const connectedPrices = new Map<string, FakeConnectedPrice>();
  const connectedSubscriptions = new Map<string, FakeConnectedSubscription>();
  const connectedCheckouts = new Map<string, FakeConnectedCheckout>();
  const connectedCharges = new Map<string, { id: string; stripeAccount: string; customerId: string | null }>();
  const connectedPortalConfigurations = new Map<string, { id: string; stripeAccount: string }>();
  let failure: Error | null = null;
  const pausedCollection = new Set<string>();
  const collectionFailures = new Map<string, Error>();
  /** Random suffix (R27): a fake id must never look like, or collide with, one minted by another process. */
  const nid = (p: string) => `${p}_fake_${randomBytes(4).toString('hex')}`;

  /** Records the call and fires a queued failure. Runs first in every method. */
  function enter(method: string, ...args: unknown[]): void {
    calls.push({ method, args });
    if (failure) {
      const e = failure;
      failure = null;
      throw e;
    }
  }
  const sub = (id: string): GatewaySubscription => {
    const s = subscriptions.get(id);
    if (!s) throw Object.assign(new Error(`fake gateway: no subscription ${id}`), { code: 'resource_missing' });
    return s;
  };
  const missing = (what: string, id: string) => Object.assign(new Error(`fake gateway: no ${what} ${id}`), { code: 'resource_missing' });
  /** Stripe reports an account the platform cannot reach (unknown, or access revoked) as `account_invalid`, not `resource_missing`. */
  const account = (id: string): ConnectedAccount => {
    const a = connectedAccounts.get(id);
    if (!a) throw Object.assign(new Error(`fake gateway: no access to account ${id}`), { code: 'account_invalid' });
    return a;
  };
  const connectedSub = (acct: string, id: string): FakeConnectedSubscription => {
    account(acct);
    const s = connectedSubscriptions.get(id);
    if (!s || s.stripeAccount !== acct) throw missing('subscription', id);
    return s;
  };
  const connectedPrice = (acct: string, id: string): FakeConnectedPrice => {
    const p = connectedPrices.get(id);
    if (!p || p.stripeAccount !== acct) throw missing('price', id);
    return p;
  };
  /** Like Stripe: a new Checkout line or subscription item needs an existing, active price on that account. */
  const usablePrice = (acct: string, id: string): FakeConnectedPrice => {
    const p = connectedPrice(acct, id);
    if (!p.active) throw Object.assign(new Error(`fake gateway: price ${id} is inactive`), { code: 'price_inactive' });
    return p;
  };
  /** Pause/resume target check: the configured failure, then the subscription must exist (on the account, for Connect). */
  const collectionSub = (id: string, acct?: string): void => {
    const f = collectionFailures.get(id);
    if (f) throw f;
    if (acct) connectedSub(acct, id);
    else sub(id);
  };
  const seat = (s: GatewaySubscription) => s.items.find((i) => i.id.startsWith('si_seat'));

  const gw: FakeGateway = {
    calls, swaps, customers, subscriptions, invoices, coupons, promotionCodes, subscriptionCoupons,
    connectedAccounts, connectedProducts, connectedPrices, connectedSubscriptions, connectedCheckouts, connectedCharges, connectedPortalConfigurations,
    seedConnectedCharge(c) { connectedCharges.set(c.id, c); },
    seedConnectedPrice(p) {
      const price: FakeConnectedPrice = { productId: 'prod_fake', currency: 'usd', active: true, ...p };
      connectedPrices.set(price.id, price);
      return price;
    },
    completeOnboarding(accountId) {
      account(accountId);
      return gw.seedConnectedAccount({ id: accountId, chargesEnabled: true, detailsSubmitted: true });
    },
    seedConnectedAccount(a) {
      const acct: ConnectedAccount = { chargesEnabled: false, detailsSubmitted: false, ...connectedAccounts.get(a.id), ...a };
      connectedAccounts.set(acct.id, acct);
      return acct;
    },
    seedConnectedSubscription(p) {
      const s: FakeConnectedSubscription = {
        status: 'active', priceId: 'price_connected_fake', unitAmountCents: null, currentPeriodEnd: new Date(Date.now() + 30 * 864e5), cancelAtPeriodEnd: false, ...p,
      };
      connectedSubscriptions.set(s.id, s);
      return s;
    },
    failNext(error = new Error('fake gateway failure')) { failure = error; },
    callsTo: (m) => calls.filter((c) => c.method === m),
    pausedCollection,
    failCollectionFor(id, error = new Error('fake gateway collection failure')) { collectionFailures.set(id, error); },
    clearCollectionFailures() { collectionFailures.clear(); },
    seedSubscription(p) {
      const s: GatewaySubscription = {
        status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: new Date(Date.now() + 30 * 864e5), trialEnd: null,
        seatQuantity: 0, hasDefaultPaymentMethod: true, items: [], ...p,
      };
      if (!p.items) s.items = [{ id: nid('si_seat'), priceId: 'price_seat_fake', quantity: s.seatQuantity }];
      subscriptions.set(s.id, s);
      return s;
    },
    seedInvoice(customerId, p) {
      const inv: GatewayInvoice = { number: null, amountPaidCents: 0, status: 'paid', hostedInvoiceUrl: null, created: new Date(), ...p };
      invoices.set(customerId, [inv, ...(invoices.get(customerId) ?? [])]);
      return inv;
    },
    seedUpcoming: (id, u) => { upcoming.set(id, u); },

    async createCustomer(i) {
      enter('createCustomer', i);
      const id = nid('cus');
      customers.set(id, { id, agencyId: i.agencyId, name: i.name, email: i.email });
      return { id };
    },
    async updateCustomer(customerId, d) {
      enter('updateCustomer', customerId, d);
      const c = customers.get(customerId);
      if (!c) throw missing('customer', customerId);
      // Mirrors the Stripe gateway: only a valid US EIN is recorded, in `NN-NNNNNNN` form.
      const ein = normalizeUsEin(d.taxId);
      customers.set(customerId, {
        ...c,
        ...(d.email !== undefined ? { email: d.email } : {}),
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.address ? { address: d.address } : {}),
        ...(ein ? { taxId: ein } : {}),
      });
    },
    async createCheckoutSession(i: CheckoutSessionInput) {
      enter('createCheckoutSession', i);
      const subId = nid('sub');
      const hasCard = true; // the fake "customer" always completes checkout with a card
      gw.seedSubscription({
        id: subId, customerId: i.customerId, status: i.trialEnd ? 'trialing' : 'active', trialEnd: i.trialEnd ?? null,
        seatQuantity: i.seatQty, hasDefaultPaymentMethod: hasCard,
        items: [
          { id: nid('si_base'), priceId: i.basePriceId, quantity: 1 },
          ...(i.seatQty > 0 ? [{ id: nid('si_seat'), priceId: i.seatPriceId, quantity: i.seatQty }] : []),
        ],
      });
      return { url: `${i.successUrl}${i.successUrl.includes('?') ? '&' : '?'}fake_checkout=${subId}` };
    },
    async pauseCollection(id, o) {
      enter('pauseCollection', id, o);
      collectionSub(id, o?.stripeAccount);
      pausedCollection.add(id);
    },
    async resumeCollection(id, o) {
      enter('resumeCollection', id, o);
      collectionSub(id, o?.stripeAccount);
      pausedCollection.delete(id);
    },
    async createPortalSession(i) {
      enter('createPortalSession', i);
      return { url: `${i.returnUrl}${i.returnUrl.includes('?') ? '&' : '?'}fake_portal=1` };
    },
    async updateSeatQuantity(id, qty, opts) {
      enter('updateSeatQuantity', id, qty, opts);
      const s = sub(id);
      const line = seat(s);
      if (!line && qty === 0) return;
      if (!line && !opts.seatPriceId) throw new Error(`fake gateway: subscription ${id} has no seat line and no seat price was given`);
      s.seatQuantity = qty;
      if (line) line.quantity = qty;
      else s.items.push({ id: nid('si_seat'), priceId: opts.seatPriceId!, quantity: qty });
    },
    async swapSubscriptionPlan(id, i) {
      enter('swapSubscriptionPlan', id, i);
      const s = sub(id);
      const base = s.items.find((x) => !x.id.startsWith('si_seat'));
      if (!base) throw new Error(`fake gateway: subscription ${id} has no base line`);
      swaps.push({ subscriptionId: id, ...i });
      base.priceId = i.basePriceId;
      const line = seat(s);
      if (line && i.seatQuantity > 0) { line.priceId = i.seatPriceId; line.quantity = i.seatQuantity; }
      else if (line) s.items = s.items.filter((x) => x !== line);
      else if (i.seatQuantity > 0) s.items.push({ id: nid('si_seat'), priceId: i.seatPriceId, quantity: i.seatQuantity });
      s.seatQuantity = i.seatQuantity;
      return { currentPeriodEnd: s.currentPeriodEnd };
    },
    async getSubscription(id) {
      enter('getSubscription', id);
      const s = sub(id);
      return { ...s, items: s.items.map((i) => ({ ...i })) };
    },
    async upcomingInvoice(id) {
      enter('upcomingInvoice', id);
      sub(id);
      return upcoming.get(id) ?? null;
    },
    async listInvoices(customerId, limit = 12) {
      enter('listInvoices', customerId, limit);
      return (invoices.get(customerId) ?? []).slice(0, limit);
    },
    async createPrices(plan) {
      enter('createPrices', plan);
      return { baseProductId: plan.stripeProductId ?? nid('prod_base'), seatProductId: plan.stripeSeatProductId ?? nid('prod_seat'), basePriceId: nid('price_base'), seatPriceId: nid('price_seat') };
    },
    async createCoupon(i) {
      enter('createCoupon', i);
      if (i.duration === 'repeating' && !i.durationInMonths) throw new Error('fake gateway: repeating coupon needs durationInMonths');
      const id = nid('coupon');
      coupons.set(id, { ...i, id });
      return { id };
    },
    async createPromotionCode(i) {
      enter('createPromotionCode', i);
      if (!coupons.has(i.couponId)) throw new Error(`fake gateway: no coupon ${i.couponId}`);
      const id = nid('promo');
      promotionCodes.set(id, { ...i, id, active: true });
      return { id };
    },
    async deactivatePromotionCode(id) {
      enter('deactivatePromotionCode', id);
      const p = promotionCodes.get(id);
      if (p) p.active = false;
    },
    async attachSubscriptionDiscount(i) {
      enter('attachSubscriptionDiscount', i);
      sub(i.subscriptionId);
      subscriptionCoupons.set(i.subscriptionId, [i.couponId]);
    },
    async createAccountLink(i) {
      enter('createAccountLink', i);
      // A first link creates the account (charges disabled). Onboarding finishes only via `completeOnboarding`, or on a
      // re-link when the E2E opt-in `completeOnboardingOnRelink` is set.
      const accountId = i.accountId ?? gw.seedConnectedAccount({ id: nid('acct') }).id;
      account(accountId);
      if (i.accountId && opts.completeOnboardingOnRelink) gw.completeOnboarding(accountId);
      return { url: `${i.returnUrl}${i.returnUrl.includes('?') ? '&' : '?'}fake_connect_onboarding=${accountId}`, accountId };
    },
    async getAccount(i) {
      enter('getAccount', i);
      return { ...account(i.stripeAccount) };
    },
    async createConnectedProduct(i) {
      enter('createConnectedProduct', i);
      account(i.stripeAccount);
      const id = nid('prod_conn');
      connectedProducts.set(id, { id, stripeAccount: i.stripeAccount, name: i.name });
      return { id };
    },
    async createConnectedPrice(i) {
      enter('createConnectedPrice', i);
      account(i.stripeAccount);
      const id = nid('price_conn');
      connectedPrices.set(id, { id, stripeAccount: i.stripeAccount, productId: i.productId, unitAmountCents: i.unitAmountCents, currency: i.currency ?? 'usd', active: true });
      return { id };
    },
    async archiveConnectedPrice(i) {
      enter('archiveConnectedPrice', i);
      account(i.stripeAccount);
      connectedPrice(i.stripeAccount, i.priceId).active = false;
    },
    async getConnectedPrice(i) {
      enter('getConnectedPrice', i);
      account(i.stripeAccount);
      const p = connectedPrice(i.stripeAccount, i.priceId);
      return { id: p.id, active: p.active, unitAmountCents: p.unitAmountCents };
    },
    async createConnectedCheckout(i) {
      enter('createConnectedCheckout', i);
      account(i.stripeAccount);
      usablePrice(i.stripeAccount, i.priceId);
      const subId = nid('sub_conn');
      gw.seedConnectedSubscription({ id: subId, stripeAccount: i.stripeAccount, customerId: nid('cus_conn'), priceId: i.priceId });
      const id = nid('cs');
      connectedCheckouts.set(id, { id, stripeAccount: i.stripeAccount, status: 'open', ...(i.clientReferenceId && { clientReferenceId: i.clientReferenceId }) });
      return { id, url: `${i.successUrl}${i.successUrl.includes('?') ? '&' : '?'}fake_connect_checkout=${subId}` };
    },
    async expireConnectedCheckout(i) {
      enter('expireConnectedCheckout', i);
      account(i.stripeAccount);
      const c = connectedCheckouts.get(i.sessionId);
      if (!c || c.stripeAccount !== i.stripeAccount) throw missing('checkout session', i.sessionId);
      if (c.status === 'complete') throw Object.assign(new Error('fake gateway: session already complete'), { code: 'resource_invalid_request_error' });
      c.status = 'expired';
    },
    async getConnectedCheckout(i) {
      enter('getConnectedCheckout', i);
      account(i.stripeAccount);
      const c = connectedCheckouts.get(i.sessionId);
      if (!c || c.stripeAccount !== i.stripeAccount) throw missing('checkout session', i.sessionId);
      return { id: c.id, status: c.status };
    },
    async getConnectedCharge(i) {
      enter('getConnectedCharge', i);
      account(i.stripeAccount);
      const c = connectedCharges.get(i.chargeId);
      if (!c || c.stripeAccount !== i.stripeAccount) throw missing('charge', i.chargeId);
      return { id: c.id, customerId: c.customerId };
    },
    async createConnectedPortalConfiguration(i) {
      enter('createConnectedPortalConfiguration', i);
      account(i.stripeAccount);
      const id = nid('bpc');
      connectedPortalConfigurations.set(id, { id, stripeAccount: i.stripeAccount });
      return { id };
    },
    async createConnectedPortal(i) {
      enter('createConnectedPortal', i);
      account(i.stripeAccount);
      if (i.configuration && connectedPortalConfigurations.get(i.configuration)?.stripeAccount !== i.stripeAccount) throw missing('portal configuration', i.configuration);
      return { url: `${i.returnUrl}${i.returnUrl.includes('?') ? '&' : '?'}fake_portal=1` };
    },
    async getConnectedSubscription(i) {
      enter('getConnectedSubscription', i);
      const { stripeAccount: _acct, ...s } = connectedSub(i.stripeAccount, i.subscriptionId);
      return { ...s, unitAmountCents: s.unitAmountCents ?? connectedPrices.get(s.priceId)?.unitAmountCents ?? null };
    },
    async updateConnectedSubscriptionPrice(i) {
      enter('updateConnectedSubscriptionPrice', i);
      const s = connectedSub(i.stripeAccount, i.subscriptionId);
      usablePrice(i.stripeAccount, i.priceId);
      s.priceId = i.priceId;
    },
    async cancelConnectedSubscriptionAtPeriodEnd(i) {
      enter('cancelConnectedSubscriptionAtPeriodEnd', i);
      connectedSub(i.stripeAccount, i.subscriptionId).cancelAtPeriodEnd = true;
    },
    verifyConnectWebhook(rawBody, signature): ConnectEventLike {
      calls.push({ method: 'verifyConnectWebhook', args: [rawBody, signature] });
      if (signature !== FAKE_WEBHOOK_SIGNATURE) throw new InvalidSignature();
      return JSON.parse(rawBody) as ConnectEventLike;
    },
    verifyWebhook(rawBody, signature): StripeEventLike {
      calls.push({ method: 'verifyWebhook', args: [rawBody, signature] });
      if (signature !== FAKE_WEBHOOK_SIGNATURE) throw new InvalidSignature();
      return JSON.parse(rawBody) as StripeEventLike;
    },
  };
  return gw;
}
