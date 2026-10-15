import { fakeGateway, type FakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyBilling, agencyConnect, clientBilling, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PAUSED_WRITE_ALLOW_LIST } from '../billing-guard';
import { createToolRegistry } from '../registry';
import { BILLING_NOT_CONFIGURED_MESSAGE } from './billing';
import { CONNECT_FIRST_MESSAGE } from './client-billing';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const APP = 'https://app.test';
const STD = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
const mk = (role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all', agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = mk('agency_admin');
const am = mk('account_manager');
const clientOwner = mk('client_owner', [IDS.clientA1]);
const clientViewer = mk('client_viewer', [IDS.clientA1]);

let gw: FakeGateway;
let registry: ReturnType<typeof createToolRegistry>;
const audit = { audit: { record: async () => {} } };
const call = (ctx: AccessContext, name: string, input: unknown = {}) => registry.invoke(ctx, name, input);
const noGateway = () => createToolRegistry({ app: dbs.app, service: dbs.service, appUrl: APP }, audit);
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};
const connectRow = async () => (await dbs.owner.select().from(agencyConnect).where(eq(agencyConnect.agencyId, IDS.agencyA)))[0];
const seedConnect = async (v: Partial<typeof agencyConnect.$inferInsert> = {}) => {
  gw.seedConnectedAccount({ id: 'acct_1', chargesEnabled: true, detailsSubmitted: true });
  await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, detailsSubmitted: true, connectedAt: new Date(), ...v });
};
const linkArg = () => gw.callsTo('createAccountLink')[0]!.args[0] as { accountId?: string; refreshUrl: string; returnUrl: string };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  gw = fakeGateway();
  registry = createToolRegistry({ app: dbs.app, service: dbs.service, billing: gw, appUrl: APP }, audit);
});

const TOOLS: [string, unknown][] = [
  ['get_connect_status', {}], ['start_stripe_connect', {}], ['disconnect_stripe', { confirm: true }], ['set_client_billing_defaults', { priceCents: 9900 }],
];

describe('roles', () => {
  it.each(TOOLS)('%s: only agency_admin', async (name, input) => {
    await seedConnect();
    for (const who of [am, clientOwner, clientViewer]) {
      const e = await fails(call(who, name, input));
      expect(['permission_denied', 'not_found']).toContain(e.code);
    }
    expect(gw.calls).toEqual([]);
    expect((await connectRow())?.status).toBe('connected');
  });

  it('another agency admin only ever touches their own row', async () => {
    await seedConnect();
    await call(mk('agency_admin', 'all', IDS.agencyB), 'start_stripe_connect');
    expect((await connectRow())?.stripeAccountId).toBe('acct_1');
  });
});

describe('get_connect_status', () => {
  it('reports not_connected with no row', async () => {
    expect(await call(admin, 'get_connect_status')).toMatchObject({ status: 'not_connected', chargesEnabled: false, billingConfigured: true });
  });

  it('merges live account flags into the stored status without writing', async () => {
    await seedConnect({ status: 'pending', chargesEnabled: false, detailsSubmitted: false, connectedAt: null });
    expect(await call(admin, 'get_connect_status')).toMatchObject({ status: 'connected', chargesEnabled: true, detailsSubmitted: true });
    expect((await connectRow())?.status).toBe('pending');
  });

  it('a connected account that lost charges shows restricted', async () => {
    await seedConnect();
    gw.seedConnectedAccount({ id: 'acct_1', chargesEnabled: false });
    expect(await call(admin, 'get_connect_status')).toMatchObject({ status: 'restricted', chargesEnabled: false });
  });

  it('degrades to stored state when the lookup fails or there is no gateway', async () => {
    await seedConnect({ status: 'pending', chargesEnabled: false, detailsSubmitted: false, defaultPriceCents: 9900 });
    gw.failNext();
    expect(await call(admin, 'get_connect_status')).toMatchObject({ status: 'pending', defaultPriceCents: 9900, billingConfigured: true });
    expect(await noGateway().invoke(admin, 'get_connect_status', {})).toMatchObject({ status: 'pending', billingConfigured: false });
  });
});

describe('start_stripe_connect', () => {
  it('creates a pending row, stores the account id and returns the onboarding url with return/refresh urls', async () => {
    const r = (await call(admin, 'start_stripe_connect')) as { url: string };
    expect(linkArg()).toMatchObject({ refreshUrl: `${APP}/agency/settings/billing?connect=retry`, returnUrl: `${APP}/agency/settings/billing?connect=done` });
    expect(linkArg().accountId).toBeUndefined();
    const row = (await connectRow())!;
    expect(row).toMatchObject({ status: 'pending', chargesEnabled: false });
    expect(row.stripeAccountId).toMatch(/^acct_/);
    expect(r.url).toContain(row.stripeAccountId!);
  });

  it('retry reuses the stored account id and does not downgrade a connected account', async () => {
    await seedConnect();
    await call(admin, 'start_stripe_connect');
    expect(linkArg().accountId).toBe('acct_1');
    expect(await connectRow()).toMatchObject({ status: 'connected', stripeAccountId: 'acct_1' });
  });

  it('after a disconnect it starts a fresh account and clears the old product/price', async () => {
    await seedConnect({ status: 'disconnected', disconnectedAt: new Date(), chargesEnabled: false, stripeProductId: 'prod_old', stripeDefaultPriceId: 'price_old', defaultPriceCents: 9900 });
    await call(admin, 'start_stripe_connect');
    expect(linkArg().accountId).toBeUndefined();
    const row = (await connectRow())!;
    expect(row).toMatchObject({ status: 'pending', disconnectedAt: null, stripeProductId: null, stripeDefaultPriceId: null, defaultPriceCents: 9900 });
    expect(row.stripeAccountId).not.toBe('acct_1');
  });

  it('refuses conflict without a gateway', async () => {
    const e = await fails(noGateway().invoke(admin, 'start_stripe_connect', {}));
    expect(e).toMatchObject({ code: 'conflict', message: BILLING_NOT_CONFIGURED_MESSAGE });
    expect(await connectRow()).toBeUndefined();
  });
});

describe('disconnect_stripe', () => {
  const addCb = (clientId: string, state: 'active' | 'off') => dbs.owner.insert(clientBilling).values({ clientId, agencyId: IDS.agencyA, state });

  it('requires confirm: true', async () => {
    await seedConnect();
    expect((await fails(call(admin, 'disconnect_stripe', {}))).code).toBe('invalid_input');
    expect((await fails(call(admin, 'disconnect_stripe', { confirm: false }))).code).toBe('invalid_input');
    expect((await connectRow())?.status).toBe('connected');
  });

  it('cascades client billing states, makes no Stripe calls and is idempotent', async () => {
    await seedConnect();
    await addCb(IDS.clientA1, 'active');
    await addCb(IDS.clientA2, 'off');
    expect(await call(admin, 'disconnect_stripe', { confirm: true })).toEqual({ ok: true, changed: true });
    expect(await connectRow()).toMatchObject({ status: 'disconnected', chargesEnabled: false });
    const states = Object.fromEntries((await dbs.owner.select().from(clientBilling)).map((r) => [r.clientId, r.state]));
    expect(states).toEqual({ [IDS.clientA1]: 'disconnected', [IDS.clientA2]: 'off' });
    expect(gw.calls).toEqual([]);
    expect(await call(admin, 'disconnect_stripe', { confirm: true })).toEqual({ ok: true, changed: false });
  });

  it('works without a gateway', async () => {
    await seedConnect();
    expect(await noGateway().invoke(admin, 'disconnect_stripe', { confirm: true })).toEqual({ ok: true, changed: true });
  });
});

describe('set_client_billing_defaults', () => {
  it('refuses before Stripe is connected', async () => {
    expect(await fails(call(admin, 'set_client_billing_defaults', { priceCents: 9900 }))).toMatchObject({ code: 'conflict', message: CONNECT_FIRST_MESSAGE });
    await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, status: 'disconnected' });
    expect((await fails(call(admin, 'set_client_billing_defaults', { priceCents: 9900 }))).message).toBe(CONNECT_FIRST_MESSAGE);
    expect(gw.calls).toEqual([]);
  });

  it('first call creates the product then the price on the connected account and stores ids and amounts', async () => {
    await seedConnect();
    const r = await call(admin, 'set_client_billing_defaults', { priceCents: 9900, setupFeeCents: 5000, autoPauseAfterDays: 14 });
    expect(r).toMatchObject({ ok: true, defaultPriceCents: 9900, defaultSetupFeeCents: 5000, autoPauseAfterDays: 14, priceChanged: true });
    expect(gw.calls.map((c) => c.method)).toEqual(['createConnectedProduct', 'createConnectedPrice']);
    expect(gw.calls[0]!.args[0]).toMatchObject({ stripeAccount: 'acct_1' });
    const row = (await connectRow())!;
    expect(gw.calls[1]!.args[0]).toMatchObject({ stripeAccount: 'acct_1', unitAmountCents: 9900, productId: row.stripeProductId, currency: 'usd' });
    expect(row).toMatchObject({ defaultPriceCents: 9900, defaultSetupFeeCents: 5000, autoPauseAfterDays: 14 });
    expect(gw.connectedPrices.get(row.stripeDefaultPriceId!)).toMatchObject({ stripeAccount: 'acct_1', unitAmountCents: 9900, active: true });
    expect(gw.connectedProducts.get(row.stripeProductId!)!.name).not.toMatch(/rival monday/i);
  });

  it('a changed price creates a new price and archives the old one, reusing the product', async () => {
    await seedConnect();
    await call(admin, 'set_client_billing_defaults', { priceCents: 9900 });
    const old = (await connectRow())!;
    gw.calls.length = 0;
    await call(admin, 'set_client_billing_defaults', { priceCents: 12900 });
    expect(gw.calls.map((c) => c.method)).toEqual(['createConnectedPrice', 'archiveConnectedPrice']);
    const row = (await connectRow())!;
    expect(row.stripeProductId).toBe(old.stripeProductId);
    expect(row.stripeDefaultPriceId).not.toBe(old.stripeDefaultPriceId);
    expect(gw.connectedPrices.get(old.stripeDefaultPriceId!)!.active).toBe(false);
    expect(gw.connectedPrices.get(row.stripeDefaultPriceId!)).toMatchObject({ active: true, unitAmountCents: 12900 });
    expect(row.defaultPriceCents).toBe(12900);
  });

  it('an unchanged price makes no Stripe calls but still saves the other settings; omitted fields stay', async () => {
    await seedConnect();
    await call(admin, 'set_client_billing_defaults', { priceCents: 9900, setupFeeCents: 5000, autoPauseAfterDays: 14 });
    gw.calls.length = 0;
    const r = await call(admin, 'set_client_billing_defaults', { priceCents: 9900, autoPauseAfterDays: null });
    expect(r).toMatchObject({ priceChanged: false, defaultSetupFeeCents: 5000, autoPauseAfterDays: null });
    expect(gw.calls).toEqual([]);
    expect(await connectRow()).toMatchObject({ defaultSetupFeeCents: 5000, autoPauseAfterDays: null });
  });

  it('a Stripe failure maps to internal, saves nothing, and a retry succeeds', async () => {
    await seedConnect();
    gw.failNext();
    expect((await fails(call(admin, 'set_client_billing_defaults', { priceCents: 9900 }))).code).toBe('internal');
    expect(await connectRow()).toMatchObject({ stripeProductId: null, defaultPriceCents: null });
    await call(admin, 'set_client_billing_defaults', { priceCents: 9900 });
    expect((await connectRow())?.defaultPriceCents).toBe(9900);
  });

  it('a price failure after the product exists keeps the product id so a retry does not duplicate it', async () => {
    await seedConnect();
    const orig = gw.createConnectedPrice;
    gw.createConnectedPrice = async () => { throw new Error('boom'); };
    expect((await fails(call(admin, 'set_client_billing_defaults', { priceCents: 9900 }))).code).toBe('internal');
    gw.createConnectedPrice = orig;
    expect((await connectRow())?.stripeProductId).toBeTruthy();
    await call(admin, 'set_client_billing_defaults', { priceCents: 9900 });
    expect(gw.callsTo('createConnectedProduct')).toHaveLength(1);
  });

  it('validates input: price integer 0..10,000,000, setup fee >= 0, auto-pause 1..90 or null', async () => {
    await seedConnect();
    for (const bad of [{ priceCents: -1 }, { priceCents: 1.5 }, { priceCents: 10_000_001 }, { priceCents: 100, setupFeeCents: -5 }, { priceCents: 100, autoPauseAfterDays: 0 }, { priceCents: 100, autoPauseAfterDays: 91 }, {}]) {
      expect((await fails(call(admin, 'set_client_billing_defaults', bad))).code).toBe('invalid_input');
    }
    expect(gw.calls).toEqual([]);
  });

  it('refuses conflict without a gateway', async () => {
    await seedConnect();
    expect(await fails(noGateway().invoke(admin, 'set_client_billing_defaults', { priceCents: 9900 }))).toMatchObject({ code: 'conflict', message: BILLING_NOT_CONFIGURED_MESSAGE });
  });
});

describe('paused agency guard (A13)', () => {
  it('disconnect_stripe stays allowed; start and defaults are blocked', async () => {
    expect(PAUSED_WRITE_ALLOW_LIST).toContain('disconnect_stripe');
    expect(PAUSED_WRITE_ALLOW_LIST).not.toContain('start_stripe_connect');
    expect(PAUSED_WRITE_ALLOW_LIST).not.toContain('set_client_billing_defaults');
    const planId = (await dbs.owner.insert(plan).values(STD).returning({ id: plan.id }))[0]!.id;
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'read_only', planId });
    await seedConnect();
    expect((await fails(call(admin, 'start_stripe_connect'))).code).toBe('service_paused');
    expect((await fails(call(admin, 'set_client_billing_defaults', { priceCents: 100 }))).code).toBe('service_paused');
    expect(await call(admin, 'disconnect_stripe', { confirm: true })).toEqual({ ok: true, changed: true });
  });
});
