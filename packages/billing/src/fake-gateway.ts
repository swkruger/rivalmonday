import { randomBytes } from 'node:crypto';
import type { ConnectedAccount, ConnectedSubscription, ConnectEventLike } from './connect-gateway-types';
import {
  type BillingGateway, type CheckoutSessionInput, type CreateCouponInput, type CreatePromotionCodeInput,
  type GatewayInvoice, type GatewaySubscription, type StripeEventLike, type UpcomingInvoice, InvalidSignature,
} from './types';

/** The only signature `fakeGateway().verifyWebhook` accepts. */
export const FAKE_WEBHOOK_SIGNATURE = 'fake-sig';

export interface FakeCall { method: string; args: unknown[] }
interface FakeCustomer { id: string; agencyId: string; name: string; email?: string }
interface FakeCoupon extends CreateCouponInput { id: string }
interface FakePromotionCode extends CreatePromotionCodeInput { id: string; active: boolean }

interface FakeConnectedPrice { id: string; stripeAccount: string; productId: string; unitAmountCents: number; currency: string; active: boolean }
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
  /** Adds or updates a connected account (defaults: charges disabled, details not submitted). */
  seedConnectedAccount(a: Partial<ConnectedAccount> & { id: string }): ConnectedAccount;
  seedConnectedSubscription(s: Partial<ConnectedSubscription> & { id: string; stripeAccount: string; customerId: string }): FakeConnectedSubscription;
  /** The next gateway method call (any method) rejects with `error`; later calls succeed. */
  failNext(error?: Error): void;
  seedSubscription(sub: Partial<GatewaySubscription> & { id: string; customerId: string }): GatewaySubscription;
  seedInvoice(customerId: string, inv: Partial<GatewayInvoice> & { id: string }): GatewayInvoice;
  seedUpcoming(subscriptionId: string, upcoming: UpcomingInvoice | null): void;
  callsTo(method: string): FakeCall[];
}

export function fakeGateway(): FakeGateway {
  const calls: FakeCall[] = [];
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
  let failure: Error | null = null;
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
  const account = (id: string): ConnectedAccount => {
    const a = connectedAccounts.get(id);
    if (!a) throw missing('account', id);
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
  const seat = (s: GatewaySubscription) => s.items.find((i) => i.id.startsWith('si_seat'));

  const gw: FakeGateway = {
    calls, customers, subscriptions, invoices, coupons, promotionCodes, subscriptionCoupons,
    connectedAccounts, connectedProducts, connectedPrices, connectedSubscriptions,
    seedConnectedAccount(a) {
      const acct: ConnectedAccount = { chargesEnabled: false, detailsSubmitted: false, ...connectedAccounts.get(a.id), ...a };
      connectedAccounts.set(acct.id, acct);
      return acct;
    },
    seedConnectedSubscription(p) {
      const s: FakeConnectedSubscription = {
        status: 'active', priceId: 'price_connected_fake', currentPeriodEnd: new Date(Date.now() + 30 * 864e5), cancelAtPeriodEnd: false, ...p,
      };
      connectedSubscriptions.set(s.id, s);
      return s;
    },
    failNext(error = new Error('fake gateway failure')) { failure = error; },
    callsTo: (m) => calls.filter((c) => c.method === m),
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
      const accountId = i.accountId ?? gw.seedConnectedAccount({ id: nid('acct') }).id;
      account(accountId);
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
    async createConnectedCheckout(i) {
      enter('createConnectedCheckout', i);
      account(i.stripeAccount);
      const subId = nid('sub_conn');
      gw.seedConnectedSubscription({ id: subId, stripeAccount: i.stripeAccount, customerId: nid('cus_conn'), priceId: i.priceId });
      return { url: `${i.successUrl}${i.successUrl.includes('?') ? '&' : '?'}fake_connect_checkout=${subId}` };
    },
    async createConnectedPortal(i) {
      enter('createConnectedPortal', i);
      account(i.stripeAccount);
      return { url: `${i.returnUrl}${i.returnUrl.includes('?') ? '&' : '?'}fake_portal=1` };
    },
    async getConnectedSubscription(i) {
      enter('getConnectedSubscription', i);
      const { stripeAccount: _acct, ...s } = connectedSub(i.stripeAccount, i.subscriptionId);
      return s;
    },
    async updateConnectedSubscriptionPrice(i) {
      enter('updateConnectedSubscriptionPrice', i);
      connectedSub(i.stripeAccount, i.subscriptionId).priceId = i.priceId;
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
