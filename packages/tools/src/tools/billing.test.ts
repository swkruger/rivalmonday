import { fakeGateway, type FakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyBilling, client, discountCode, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const APP = 'https://app.test';
const day = 86_400_000;
const STD = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
const mk = (role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all', agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = mk('agency_admin');
const am = mk('account_manager');
const clientOwner = mk('client_owner', [IDS.clientA1]);
const clientViewer = mk('client_viewer', [IDS.clientA1]);

let gw: FakeGateway;
let planId: string;
let registry: ReturnType<typeof createToolRegistry>;
const call = (ctx: AccessContext, name: string, input: unknown = {}) => registry.invoke(ctx, name, input);
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};
const setBilling = (v: Partial<typeof agencyBilling.$inferInsert>) => dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'trialing', planId, ...v });
const billingRow = async () => (await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, IDS.agencyA)))[0];
const addCode = async (v: Partial<typeof discountCode.$inferInsert> = {}) =>
  (await dbs.owner.insert(discountCode).values({ code: 'SAVE10', stripeCouponId: 'coupon_1', percentOff: '10', appliesTo: 'both', duration: 'once', createdBy: 'test', ...v }).returning())[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  planId = (await dbs.owner.insert(plan).values({ ...STD, stripeBasePriceId: 'price_base', stripeSeatPriceId: 'price_seat' }).returning({ id: plan.id }))[0]!.id;
  gw = fakeGateway();
  registry = createToolRegistry({ app: dbs.app, service: dbs.service, billing: gw, appUrl: APP }, { audit: { record: async () => {} } });
});

const TOOLS: [string, unknown][] = [
  ['get_billing_summary', {}], ['create_checkout_session', {}], ['create_portal_session', {}], ['redeem_discount_code', { code: 'x' }], ['get_seat_report', {}],
];

describe('roles', () => {
  it.each(TOOLS)('%s: only agency_admin', async (name, input) => {
    await setBilling({ state: 'pilot', stripeCustomerId: 'cus_x' });
    for (const who of [am, clientOwner, clientViewer]) {
      const e = await fails(call(who, name, input));
      expect(['permission_denied', 'not_found']).toContain(e.code);
    }
    expect(gw.calls).toEqual([]);
  });

  it('billing tools are web-only', async () => {
    expect(registry.list(admin, { channel: 'mcp', tokenScope: 'manage' }).map((t) => t.name)).not.toContain('get_billing_summary');
  });
});

describe('get_billing_summary', () => {
  it('defaults to pilot with no billing row', async () => {
    const r = (await call(admin, 'get_billing_summary')) as Record<string, any>;
    expect(r.state).toBe('pilot');
    expect(r.plan).toEqual({ name: 'Standard', version: 1, basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900 });
    expect(r.dates).toEqual({ trialEndsAt: null, pilotEndsAt: null, pastDueSince: null, pausesOn: null, cancelAt: null });
    expect(r.seats).toEqual({ used: 2, included: 3, extra: 0 });
    expect(r.nextInvoice).toBeNull();
    expect(r.discount).toBeNull();
    expect(r.recentInvoices).toEqual([]);
    expect(gw.calls).toEqual([]);
  });

  it('reports dates, pausesOn, discount, invoice and upcoming', async () => {
    const since = new Date(Date.now() - 2 * day);
    await addCode();
    await setBilling({ state: 'past_due', pastDueSince: since, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', attachedCouponId: 'coupon_1' });
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1' });
    const periodEnd = new Date(Date.now() + 5 * day);
    gw.seedUpcoming('sub_1', { amountDueCents: 12345, periodEnd, discountCents: 500 });
    for (let i = 0; i < 7; i++) gw.seedInvoice('cus_1', { id: `in_${i}`, amountPaidCents: 100 + i });
    const r = (await call(admin, 'get_billing_summary')) as Record<string, any>;
    expect(r.state).toBe('past_due');
    expect(r.dates.pastDueSince).toBe(since.toISOString());
    expect(r.dates.pausesOn).toBe(new Date(since.getTime() + 7 * day).toISOString());
    expect(r.nextInvoice).toEqual({ amountDueCents: 12345, periodEnd: periodEnd.toISOString(), discountCents: 500 });
    expect(r.discount).toEqual({ code: 'SAVE10', couponId: 'coupon_1' });
    expect(r.recentInvoices).toHaveLength(5);
    expect(Object.keys(r.recentInvoices[0]).sort()).toEqual(['amountPaidCents', 'created', 'hostedInvoiceUrl', 'id', 'number', 'status']);
    expect(typeof r.recentInvoices[0].created).toBe('string');
  });

  it('degrades a failing gateway call to null / [] without failing the tool', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await setBilling({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1' });
    gw.seedInvoice('cus_1', { id: 'in_1' });
    gw.failNext(); // upcomingInvoice is called first
    const r1 = (await call(admin, 'get_billing_summary')) as Record<string, any>;
    expect(r1.nextInvoice).toBeNull();
    expect(r1.recentInvoices).toHaveLength(1);
    gw.listInvoices = async () => { throw new Error('boom'); };
    const r2 = (await call(admin, 'get_billing_summary')) as Record<string, any>;
    expect(r2.recentInvoices).toEqual([]);
  });
});

describe('create_checkout_session', () => {
  it('creates the customer once and passes seats, trial end and promo codes', async () => {
    const trialEnd = new Date(Date.now() + 10 * day);
    await setBilling({ state: 'trialing', trialEndsAt: trialEnd });
    const r = (await call(admin, 'create_checkout_session')) as { url: string };
    expect(r.url).toMatch(/^https?:/);
    const row = (await billingRow())!;
    expect(row.stripeCustomerId).toMatch(/^cus_/);
    await call(admin, 'create_checkout_session');
    expect(gw.callsTo('createCustomer')).toHaveLength(1);
    const input = gw.callsTo('createCheckoutSession')[0]!.args[0] as Record<string, any>;
    expect(input).toMatchObject({
      customerId: row.stripeCustomerId, basePriceId: 'price_base', seatPriceId: 'price_seat', seatQty: 0, allowPromotionCodes: true,
      successUrl: `${APP}/agency/settings/billing?done=1`, cancelUrl: `${APP}/agency/settings/billing`,
    });
    expect(input.trialEnd).toEqual(trialEnd);
    expect(input.couponId).toBeUndefined();
  });

  it('omits a trial end less than 49 h away (Stripe needs 48 h) (I2)', async () => {
    await setBilling({ state: 'trialing', trialEndsAt: new Date(Date.now() + 30 * 3600_000) });
    await call(admin, 'create_checkout_session');
    expect((gw.callsTo('createCheckoutSession')[0]!.args[0] as Record<string, any>).trialEnd).toBeUndefined();
  });

  it('seatQty = active - included; no trial end when it has passed', async () => {
    await dbs.owner.insert(client).values([0, 1, 2].map((i) => ({ agencyId: IDS.agencyA, name: `Extra ${i}`, verticalId: 'hvac_plumbing', status: 'active' as const })));
    await setBilling({ state: 'trialing', trialEndsAt: new Date(Date.now() - day) });
    await call(admin, 'create_checkout_session');
    const input = gw.callsTo('createCheckoutSession')[0]!.args[0] as Record<string, any>;
    expect(input.seatQty).toBe(2); // 5 active - 3 included
    expect(input.trialEnd).toBeUndefined();
  });

  it('uses the attached coupon and disables promotion codes', async () => {
    await setBilling({ state: 'pilot', attachedCouponId: 'coupon_9' });
    await call(admin, 'create_checkout_session');
    const input = gw.callsTo('createCheckoutSession')[0]!.args[0] as Record<string, any>;
    expect(input).toMatchObject({ couponId: 'coupon_9', allowPromotionCodes: false });
  });

  it('works with no billing row (pilot default) and stores the customer', async () => {
    await call(admin, 'create_checkout_session');
    expect((await billingRow())).toMatchObject({ state: 'pilot', stripeCustomerId: expect.stringMatching(/^cus_/) });
  });

  it('syncs the plan prices when they are missing', async () => {
    await dbs.owner.update(plan).set({ stripeBasePriceId: null, stripeSeatPriceId: null });
    await setBilling({ state: 'pilot' });
    await call(admin, 'create_checkout_session');
    expect(gw.callsTo('createPrices')).toHaveLength(1);
    const input = gw.callsTo('createCheckoutSession')[0]!.args[0] as Record<string, any>;
    expect(input.basePriceId).toMatch(/\w/);
    expect(input.basePriceId).not.toBe('price_base');
  });

  it.each([['past_due', 'active'], ['trialing', 'trialing'], ['past_due', 'unpaid']] as const)('refuses with conflict when %s agency has a live (%s) subscription', async (state, status) => {
    await setBilling({ state, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', status });
    expect((await fails(call(admin, 'create_checkout_session'))).code).toBe('conflict');
    expect(gw.callsTo('createCheckoutSession')).toEqual([]);
  });

  it('allows a new checkout when the old subscription is canceled', async () => {
    await setBilling({ state: 'past_due', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', status: 'canceled' });
    await call(admin, 'create_checkout_session');
    expect(gw.callsTo('createCheckoutSession')).toHaveLength(1);
  });

  it('fails closed when the subscription lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await setBilling({ state: 'past_due', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', status: 'canceled' });
    gw.failNext();
    expect((await fails(call(admin, 'create_checkout_session'))).code).toBe('internal');
    expect(gw.callsTo('createCheckoutSession')).toEqual([]);
  });

  it('refuses with conflict when already active with a subscription', async () => {
    await setBilling({ state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1' });
    expect((await fails(call(admin, 'create_checkout_session'))).code).toBe('conflict');
    expect(gw.callsTo('createCheckoutSession')).toEqual([]);
  });
});

describe('create_portal_session', () => {
  it('requires a customer', async () => {
    await setBilling({ state: 'pilot' });
    expect((await fails(call(admin, 'create_portal_session'))).code).toBe('conflict');
  });

  it('returns the portal url with the billing return url', async () => {
    await setBilling({ state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    const r = (await call(admin, 'create_portal_session')) as { url: string };
    expect(r.url).toMatch(/^https?:/);
    expect(gw.callsTo('createPortalSession')[0]!.args[0]).toEqual({ customerId: 'cus_1', returnUrl: `${APP}/agency/settings/billing?done=1` });
  });
});

describe('redeem_discount_code', () => {
  const MSG = "That code isn't valid for your account.";
  const invalid = async (code: string) => {
    const e = await fails(call(admin, 'redeem_discount_code', { code }));
    expect(e.code).toBe('invalid_code');
    expect(e.message).toBe(MSG);
    expect(gw.callsTo('attachSubscriptionDiscount')).toEqual([]);
    expect((await billingRow())?.attachedCouponId ?? null).toBeNull();
  };

  it('gives one identical error for unknown, revoked, expired and other-agency codes', async () => {
    await setBilling({ state: 'pilot' });
    await addCode({ code: 'REVOKED', revokedAt: new Date() });
    await addCode({ code: 'EXPIRED', expiresAt: new Date(Date.now() - day) });
    await addCode({ code: 'OTHER', restrictedAgencyIds: [IDS.agencyB] });
    for (const c of ['NOPE', 'REVOKED', 'EXPIRED', 'OTHER']) await invalid(c);
  });

  it('without a subscription stores the coupon for checkout', async () => {
    await addCode({ restrictedAgencyIds: [IDS.agencyA] });
    expect(await call(admin, 'redeem_discount_code', { code: 'save10' })).toEqual({ applied: true, appliesAtCheckout: true });
    const row = (await billingRow())!;
    expect(row.attachedCouponId).toBe('coupon_1');
    expect(row.stripeCustomerId).toMatch(/^cus_/);
    expect(gw.callsTo('attachSubscriptionDiscount')).toEqual([]);
  });

  it('with a subscription attaches the coupon to the subscription now (I1)', async () => {
    await addCode();
    const { id } = await gw.createCustomer({ agencyId: IDS.agencyA, name: 'A' });
    gw.seedSubscription({ id: 'sub_1', customerId: id });
    await setBilling({ state: 'active', stripeCustomerId: id, stripeSubscriptionId: 'sub_1' });
    expect(await call(admin, 'redeem_discount_code', { code: 'SAVE10' })).toEqual({ applied: true, appliesAtCheckout: false });
    expect(gw.callsTo('attachSubscriptionDiscount')[0]!.args[0]).toEqual({ subscriptionId: 'sub_1', couponId: 'coupon_1' });
    expect(gw.subscriptionCoupons.get('sub_1')).toEqual(['coupon_1']);
    expect((await billingRow())!.attachedCouponId).toBe('coupon_1');
  });
});

describe('billing not configured (R27: no gateway)', () => {
  const NOT_CONFIGURED = 'Billing is not configured.';
  beforeEach(() => {
    registry = createToolRegistry({ app: dbs.app, service: dbs.service, appUrl: APP }, { audit: { record: async () => {} } });
  });

  it.each([['create_checkout_session', {}], ['create_portal_session', {}], ['redeem_discount_code', { code: 'SAVE10' }]] as const)('%s refuses with conflict', async (name, input) => {
    await addCode();
    await setBilling({ state: 'trialing', stripeCustomerId: 'cus_1' });
    const e = await fails(call(admin, name, input));
    expect(e).toMatchObject({ code: 'conflict', message: NOT_CONFIGURED });
    expect((await billingRow())!.attachedCouponId).toBeNull();
  });

  it('get_billing_summary still renders from the database (no invoices, no estimate)', async () => {
    await setBilling({ state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    const r = (await call(admin, 'get_billing_summary')) as Record<string, any>;
    expect(r).toMatchObject({ state: 'active', nextInvoice: null, recentInvoices: [] });
  });
});

describe('get_seat_report', () => {
  it('lists active clients sorted by name with created_at as activatedAt', async () => {
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA2));
    const created = new Date('2026-09-01T00:00:00Z');
    await dbs.owner.insert(client).values([
      { agencyId: IDS.agencyA, name: 'Zed Plumbing', verticalId: 'hvac_plumbing', status: 'active', createdAt: created },
      { agencyId: IDS.agencyA, name: 'Aaa Dental', verticalId: 'dental', status: 'active', createdAt: created },
      { agencyId: IDS.agencyB, name: 'Other agency', verticalId: 'dental', status: 'active' },
    ]);
    const r = (await call(admin, 'get_seat_report')) as { clients: { id: string; name: string; activatedAt: string }[] };
    const names = r.clients.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain('Zed Plumbing');
    expect(names).not.toContain('Other agency');
    expect(r.clients.map((c) => c.id)).not.toContain(IDS.clientA2);
    expect(r.clients.find((c) => c.name === 'Aaa Dental')!.activatedAt).toBe(created.toISOString());
  });
});
