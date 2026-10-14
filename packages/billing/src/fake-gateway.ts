import {
  type BillingGateway, type CheckoutSessionInput, type CreateCouponInput, type CreatePromotionCodeInput,
  type GatewayInvoice, type GatewaySubscription, type StripeEventLike, type UpcomingInvoice, InvalidSignature,
} from './types';

/** The only signature `fakeGateway().verifyWebhook` accepts. */
export const FAKE_WEBHOOK_SIGNATURE = 'fake-sig';

export interface FakeCall { method: string; args: unknown[] }
interface FakeCustomer { id: string; agencyId: string; name: string; email?: string; couponIds: string[] }
interface FakeCoupon extends CreateCouponInput { id: string }
interface FakePromotionCode extends CreatePromotionCodeInput { id: string; active: boolean }

export interface FakeGateway extends BillingGateway {
  readonly calls: FakeCall[];
  readonly customers: Map<string, FakeCustomer>;
  readonly subscriptions: Map<string, GatewaySubscription>;
  readonly invoices: Map<string, GatewayInvoice[]>;
  readonly coupons: Map<string, FakeCoupon>;
  readonly promotionCodes: Map<string, FakePromotionCode>;
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
  const upcoming = new Map<string, UpcomingInvoice | null>();
  let failure: Error | null = null;
  let seq = 0;
  const nid = (p: string) => `${p}_fake_${++seq}`;

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
    if (!s) throw new Error(`fake gateway: no subscription ${id}`);
    return s;
  };
  const seat = (s: GatewaySubscription) => s.items.find((i) => i.id.startsWith('si_seat'));

  const gw: FakeGateway = {
    calls, customers, subscriptions, invoices, coupons, promotionCodes,
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
      customers.set(id, { id, agencyId: i.agencyId, name: i.name, email: i.email, couponIds: [] });
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
          { id: nid('si_seat'), priceId: i.seatPriceId, quantity: i.seatQty },
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
      s.seatQuantity = qty;
      const line = seat(s);
      if (line) line.quantity = qty;
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
    async attachCustomerDiscount(i) {
      enter('attachCustomerDiscount', i);
      const c = customers.get(i.customerId);
      if (!c) throw new Error(`fake gateway: no customer ${i.customerId}`);
      c.couponIds.push(i.couponId);
    },
    verifyWebhook(rawBody, signature): StripeEventLike {
      calls.push({ method: 'verifyWebhook', args: [rawBody, signature] });
      if (signature !== FAKE_WEBHOOK_SIGNATURE) throw new InvalidSignature();
      return JSON.parse(rawBody) as StripeEventLike;
    },
  };
  return gw;
}
