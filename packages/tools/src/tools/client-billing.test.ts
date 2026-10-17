import { fakeGateway, type FakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agencyBilling, agencyConnect, billingNotice, client, clientBilling, clientSetup, invitation, membership, plan, platformSetting } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAUSED_WRITE_ALLOW_LIST } from '../billing-guard';
import { createToolRegistry } from '../registry';
import { BILLING_NOT_CONFIGURED_MESSAGE } from './billing';
import { clientOwnerEmails, CONNECT_FIRST_MESSAGE, preferredOwnerEmail, PAYMENT_PROCESSING_MESSAGE, STRIPE_FAILED_MESSAGE } from './client-billing';

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
  try { await p; } catch (e) { return e as { code?: string; message: string; userFacing?: boolean }; }
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

  it('R26: persists live account flags when they differ from the stored state (connected_at set once)', async () => {
    await seedConnect({ status: 'pending', chargesEnabled: false, detailsSubmitted: false, connectedAt: null });
    expect(await call(admin, 'get_connect_status')).toMatchObject({ status: 'connected', chargesEnabled: true, detailsSubmitted: true });
    const row = (await connectRow())!;
    expect(row).toMatchObject({ status: 'connected', chargesEnabled: true, detailsSubmitted: true });
    expect(row.connectedAt).toBeInstanceOf(Date);
  });

  it('R26: no write when nothing differs, and none in a read-only support session', async () => {
    await seedConnect();
    const before = (await connectRow())!.updatedAt;
    await call(admin, 'get_connect_status');
    expect((await connectRow())!.updatedAt).toEqual(before);
    await dbs.owner.update(agencyConnect).set({ status: 'pending', chargesEnabled: false });
    const support = createAccessContext({ agencyId: IDS.agencyA, userId: 'u-op', role: 'agency_admin', clientScope: 'all', features: [], support: { sessionId: '00000000-0000-4000-8000-000000000001', platformUserId: 'u-op' } });
    expect(await call(support, 'get_connect_status')).toMatchObject({ status: 'connected' });
    expect((await connectRow())!.status).toBe('pending');
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

  it('R24: after an admin disconnect it reuses the same account and keeps its product, price and portal configuration', async () => {
    await seedConnect({ status: 'disconnected', disconnectedAt: new Date(), chargesEnabled: false, stripeProductId: 'prod_old', stripeDefaultPriceId: 'price_old', portalConfigurationId: 'bpc_old', defaultPriceCents: 9900 });
    await call(admin, 'start_stripe_connect');
    expect(linkArg().accountId).toBe('acct_1');
    expect(await connectRow()).toMatchObject({ stripeAccountId: 'acct_1', status: 'pending', disconnectedAt: null, stripeProductId: 'prod_old', stripeDefaultPriceId: 'price_old', portalConfigurationId: 'bpc_old', defaultPriceCents: 9900 });
    // The live state then shows the account is still connected (and persists it, R26).
    expect(await call(admin, 'get_connect_status')).toMatchObject({ status: 'connected' });
    expect((await connectRow())!.status).toBe('connected');
  });

  it('R24: after deauthorization (account forgotten) it onboards a fresh account', async () => {
    await seedConnect({ status: 'disconnected', disconnectedAt: new Date(), chargesEnabled: false, stripeAccountId: null, defaultPriceCents: 9900 });
    await call(admin, 'start_stripe_connect');
    expect(linkArg().accountId).toBeUndefined();
    const row = (await connectRow())!;
    expect(row).toMatchObject({ status: 'pending', disconnectedAt: null, stripeProductId: null, stripeDefaultPriceId: null, defaultPriceCents: 9900 });
    expect(row.stripeAccountId).toMatch(/^acct_/);
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
    expect(gw.calls.map((c) => c.method)).toEqual(['createConnectedProduct', 'createConnectedPrice', 'createConnectedPortalConfiguration']); // R25
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

  it('R25: the first save creates the Customer Portal configuration on the connected account, once; a failure there does not fail the save', async () => {
    await seedConnect();
    await call(admin, 'set_client_billing_defaults', { priceCents: 9900 });
    const id = (await connectRow())!.portalConfigurationId;
    expect(id).toMatch(/^bpc_/);
    expect(gw.connectedPortalConfigurations.get(id!)).toMatchObject({ stripeAccount: 'acct_1' });
    await call(admin, 'set_client_billing_defaults', { priceCents: 12900 });
    expect(gw.callsTo('createConnectedPortalConfiguration')).toHaveLength(1);
    await dbs.owner.update(agencyConnect).set({ portalConfigurationId: null });
    const orig = gw.createConnectedPortalConfiguration;
    gw.createConnectedPortalConfiguration = async () => { throw new Error('boom'); };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await call(admin, 'set_client_billing_defaults', { priceCents: 12900, autoPauseAfterDays: 5 })).toMatchObject({ ok: true, autoPauseAfterDays: 5 });
    log.mockRestore();
    gw.createConnectedPortalConfiguration = orig;
    expect((await connectRow())!.portalConfigurationId).toBeNull();
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
    // R19: the decided copy reaches the form inline instead of the error page.
    expect(await fails(call(admin, 'set_client_billing_defaults', { priceCents: 9900 }))).toMatchObject({ code: 'internal', message: STRIPE_FAILED_MESSAGE, userFacing: true });
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

describe('set_client_billing_defaults: disconnect race', () => {
  it('a disconnect landing during the Stripe call is not overwritten by the final save', async () => {
    await seedConnect({ stripeProductId: 'prod_1', stripeDefaultPriceId: 'price_old', defaultPriceCents: 9900 });
    const create = gw.createConnectedPrice.bind(gw);
    gw.createConnectedPrice = async (i) => {
      await dbs.owner.update(agencyConnect).set({ status: 'disconnected', chargesEnabled: false });
      return create(i);
    };
    const e = await fails(call(admin, 'set_client_billing_defaults', { priceCents: 5000 }));
    expect(e).toMatchObject({ code: 'conflict', message: CONNECT_FIRST_MESSAGE });
    expect(await connectRow()).toMatchObject({ status: 'disconnected', defaultPriceCents: 9900, stripeDefaultPriceId: 'price_old' });
  });
});

const BILLING_TOOLS: [string, (c: string) => unknown][] = [
  ['enable_client_billing', (c) => ({ clientId: c })],
  ['disable_client_billing', (c) => ({ clientId: c, confirm: true })],
  ['resend_client_payment_link', (c) => ({ clientId: c })],
  ['set_client_price', (c) => ({ clientId: c, priceCents: 5000, applyTo: 'new_only' })],
];

describe('per-client billing tools (Task 5)', () => {
  let planId: string;
  const A1 = IDS.clientA1;
  const A2 = IDS.clientA2;
  const row = async (id: string) => (await dbs.owner.select().from(clientBilling).where(eq(clientBilling.clientId, id)))[0];
  const notices = () => dbs.owner.select().from(billingNotice);
  const addUser = async (id: string, email: string, clientId: string, at: Date) => {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${id}, ${email}, true) on conflict (id) do update set email = excluded.email`);
    await dbs.owner.insert(membership).values({ userId: id, agencyId: IDS.agencyA, role: 'client_owner', clientId, createdBy: 'seed', createdAt: at });
  };
  const checkoutArg = (n = 0) => gw.callsTo('createConnectedCheckout')[n]!.args[0] as Record<string, unknown>;
  const ready = async (v: Partial<typeof agencyConnect.$inferInsert> = {}) => {
    gw.seedConnectedAccount({ id: 'acct_1' });
    gw.seedConnectedPrice({ id: 'price_def', stripeAccount: 'acct_1', productId: 'prod_1', unitAmountCents: v.defaultPriceCents ?? 9900 });
    await seedConnect({ stripeProductId: 'prod_1', stripeDefaultPriceId: 'price_def', defaultPriceCents: 9900, defaultSetupFeeCents: 0, ...v });
  };

  beforeEach(async () => {
    planId = (await dbs.owner.insert(plan).values(STD).returning({ id: plan.id }))[0]!.id;
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active', planId, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billableSeatsSynced: 0 });
    await addUser('o1', 'first@owner.test', A1, new Date('2026-01-01'));
    await addUser('o2', 'second@owner.test', A1, new Date('2026-02-01'));
  });

  describe('roles', () => {
    it.each(BILLING_TOOLS)('%s: agency_admin only', async (name, input) => {
      await ready();
      for (const who of [am, clientOwner, clientViewer]) expect(['permission_denied', 'not_found']).toContain((await fails(call(who, name, input(A1)))).code);
      expect(gw.calls).toEqual([]);
    });
    it('get_client_revenue: agency_admin only', async () => {
      for (const who of [am, clientOwner]) expect(['permission_denied', 'not_found']).toContain((await fails(call(who, 'get_client_revenue'))).code);
    });
    it('list_client_billing_status: not for client roles', async () => {
      for (const who of [clientOwner, clientViewer]) expect(['permission_denied', 'not_found']).toContain((await fails(call(who, 'list_client_billing_status'))).code);
    });
    it('another agency cannot touch this client (not_found)', async () => {
      await ready();
      expect((await fails(call(mk('agency_admin', 'all', IDS.agencyB), 'enable_client_billing', { clientId: A1 }))).code).toBe('not_found');
    });
  });

  describe('no gateway (A5)', () => {
    it.each(BILLING_TOOLS)('%s refuses conflict', async (name, input) => {
      await ready();
      const e = await fails(noGateway().invoke(admin, name, input(A1)));
      expect(e).toMatchObject({ code: 'conflict', message: BILLING_NOT_CONFIGURED_MESSAGE });
    });
    it('revenue and status read stored data only', async () => {
      await ready();
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, priceCents: 9900, billedPriceCents: 9900, stripeSubscriptionId: 'sub_x' });
      const r = noGateway();
      expect(await r.invoke(admin, 'get_client_revenue', {})).toMatchObject({ mrrCents: 9900, payingCount: 1 });
      expect(await r.invoke(admin, 'list_client_billing_status', {})).toMatchObject({ clients: expect.any(Array) });
    });
  });

  describe('enable_client_billing: eligibility (f8) and recipients', () => {
    it.each(['trialing', 'past_due', 'cancelled'] as const)('9a state %s -> billing_not_eligible with the exact copy', async (state) => {
      await ready();
      await dbs.owner.update(agencyBilling).set({ state });
      const e = await fails(call(admin, 'enable_client_billing', { clientId: A1 }));
      expect(e).toMatchObject({ code: 'billing_not_eligible', message: 'Client billing is available once your Rival Monday subscription is active.' });
      expect(gw.calls).toEqual([]);
    });
    it('a read-only agency is stopped by the paused-write guard', async () => {
      await ready();
      await dbs.owner.update(agencyBilling).set({ state: 'read_only' });
      expect((await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).code).toBe('service_paused');
    });
    it('a pilot agency is eligible', async () => {
      await ready();
      await dbs.owner.update(agencyBilling).set({ state: 'pilot' });
      expect(await call(admin, 'enable_client_billing', { clientId: A1 })).toMatchObject({ ok: true, state: 'invited' });
    });
    it('charges not enabled or account not connected -> connect_not_ready "Finish your Stripe setup first."', async () => {
      await ready({ status: 'restricted', chargesEnabled: false });
      const e = await fails(call(admin, 'enable_client_billing', { clientId: A1 }));
      expect(e).toMatchObject({ code: 'connect_not_ready', message: 'Finish your Stripe setup first.' });
      expect(gw.calls).toEqual([]);
    });
    it('no Connect at all -> "Connect Stripe first."', async () => {
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: CONNECT_FIRST_MESSAGE });
    });
    it('no client owner -> no_client_owner "Invite the business owner first."', async () => {
      await ready();
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A2 }))).toMatchObject({ code: 'no_client_owner', message: 'Invite the business owner first.' });
      expect(gw.callsTo('createConnectedCheckout')).toEqual([]);
    });
    it('no default price and no override -> conflict with the set-defaults copy', async () => {
      await ready({ stripeDefaultPriceId: null, defaultPriceCents: null });
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: 'Set a default price first, or give this client a price.' });
    });
    it('already billing (invited/active/payment_needed) -> conflict', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      expect((await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).code).toBe('conflict');
    });
  });

  describe('R19: decided refusal copy is user-facing (passes through forms/MCP)', () => {
    it('conflict refusals carry userFacing; the Stripe failure is an inline internal message', async () => {
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: CONNECT_FIRST_MESSAGE, userFacing: true });
      await ready({ stripeDefaultPriceId: null, defaultPriceCents: null });
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: 'Set a default price first, or give this client a price.', userFacing: true });
      expect(await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: 'No payment link is pending for this client.', userFacing: true });
      await dbs.owner.update(agencyConnect).set({ stripeDefaultPriceId: 'price_def', defaultPriceCents: 9900 });
      await call(admin, 'enable_client_billing', { clientId: A1 });
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: 'Billing is already on for this client.', userFacing: true });
      gw.failNext();
      expect(await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).toMatchObject({ code: 'internal', message: STRIPE_FAILED_MESSAGE, userFacing: true });
      expect(await fails(noGateway().invoke(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: BILLING_NOT_CONFIGURED_MESSAGE, userFacing: true });
    });
  });

  describe('R20: Checkout price resolution at creation time', () => {
    it('after the default price changes, a resend for a client invited at the old default uses the current default', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      expect(checkoutArg(0).priceId).toBe('price_def');
      await call(admin, 'set_client_billing_defaults', { priceCents: 12900 });
      expect(gw.connectedPrices.get('price_def')!.active).toBe(false);
      const current = (await connectRow())!.stripeDefaultPriceId!;
      expect(await call(admin, 'resend_client_payment_link', { clientId: A1 })).toMatchObject({ ok: true, state: 'invited' });
      expect(checkoutArg(1).priceId).toBe(current);
      expect(await row(A1)).toMatchObject({ priceCents: 12900, stripePriceId: current });
    });
    it('re-enabling a cancelled client whose stored price was an archived default uses the current default', async () => {
      await ready();
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'cancelled', enabled: false, priceCents: 9900, stripePriceId: 'price_def', lastPaidAt: new Date() });
      await call(admin, 'set_client_billing_defaults', { priceCents: 12900 });
      const current = (await connectRow())!.stripeDefaultPriceId!;
      expect(await call(admin, 'enable_client_billing', { clientId: A1 })).toMatchObject({ ok: true, priceCents: 12900 });
      expect(checkoutArg().priceId).toBe(current);
    });
    it('a live per-client override is kept on resend', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1, priceCents: 15000 });
      const override = (await row(A1))!.stripePriceId!;
      await call(admin, 'set_client_billing_defaults', { priceCents: 12900 });
      await call(admin, 'resend_client_payment_link', { clientId: A1 });
      expect(checkoutArg(1).priceId).toBe(override);
      expect(await row(A1)).toMatchObject({ priceCents: 15000, stripePriceId: override });
    });
    it('set_client_price never moves a subscription onto an archived stored price', async () => {
      await ready();
      gw.seedConnectedPrice({ id: 'price_old', stripeAccount: 'acct_1', unitAmountCents: 7000, active: false });
      gw.seedConnectedSubscription({ id: 'sub_9', stripeAccount: 'acct_1', customerId: 'cus_9', priceId: 'price_def' });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, priceCents: 7000, billedPriceCents: 9900, stripePriceId: 'price_old', stripeSubscriptionId: 'sub_9' });
      expect(await call(admin, 'set_client_price', { clientId: A1, priceCents: 7000, applyTo: 'next_bill' })).toMatchObject({ ok: true, appliedToSubscription: true });
      const moved = gw.connectedSubscriptions.get('sub_9')!.priceId;
      expect(moved).not.toBe('price_old');
      expect(gw.connectedPrices.get(moved)).toMatchObject({ active: true, unitAmountCents: 7000 });
    });
  });

  describe('R21: an invited client with a tracked subscription (first payment still processing)', () => {
    const processing = async () => {
      await ready();
      gw.seedConnectedSubscription({ id: 'sub_ach', stripeAccount: 'acct_1', customerId: 'cus_ach', priceId: 'price_def' });
      gw.connectedCheckouts.set('cs_paid', { id: 'cs_paid', stripeAccount: 'acct_1', status: 'complete' });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'invited', enabled: true, priceCents: 9900, stripePriceId: 'price_def', checkoutSessionId: 'cs_paid', stripeCustomerId: 'cus_ach', stripeSubscriptionId: 'sub_ach' });
    };
    it('disable cancels the subscription at period end and keeps tracking it', async () => {
      await processing();
      expect(await call(admin, 'disable_client_billing', { clientId: A1, confirm: true })).toMatchObject({ ok: true, state: 'invited', cancelAtPeriodEnd: true });
      expect(gw.connectedSubscriptions.get('sub_ach')!.cancelAtPeriodEnd).toBe(true);
      expect(await row(A1)).toMatchObject({ enabled: false, state: 'invited', stripeSubscriptionId: 'sub_ach' });
      expect(gw.callsTo('expireConnectedCheckout')).toEqual([]);
      // Turning billing back on waits for that subscription to end.
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: "This client's subscription ends at the end of the billing period. Turn billing on again after that." });
    });
    it('resend and a price change refuse with the processing copy and mail nothing', async () => {
      await processing();
      expect(await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: PAYMENT_PROCESSING_MESSAGE, userFacing: true });
      for (const applyTo of ['next_bill', 'new_only'] as const) {
        expect(await fails(call(admin, 'set_client_price', { clientId: A1, priceCents: 7000, applyTo }))).toMatchObject({ code: 'conflict', message: PAYMENT_PROCESSING_MESSAGE });
      }
      expect(gw.callsTo('createConnectedCheckout')).toEqual([]);
      expect(await notices()).toEqual([]);
      expect(await row(A1)).toMatchObject({ priceCents: 9900, checkoutSessionId: 'cs_paid' });
    });
    it('a resend racing the async Checkout completion is refused inside the transaction and its new session expired', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      const create = gw.createConnectedCheckout.bind(gw);
      gw.createConnectedCheckout = async (i) => {
        const r = await create(i);
        await dbs.owner.update(clientBilling).set({ stripeSubscriptionId: 'sub_ach', stripeCustomerId: 'cus_ach' }).where(eq(clientBilling.clientId, A1));
        return r;
      };
      expect(await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: PAYMENT_PROCESSING_MESSAGE });
      expect([...gw.connectedCheckouts.values()].map((c) => c.status)).toEqual(['open', 'expired']);
    });
  });

  describe('enable_client_billing: Checkout and outbox', () => {
    const invite = (email: string, v: Partial<typeof invitation.$inferInsert> = {}) =>
      dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, email, role: 'client_owner', clientId: A2, invitedBy: 'a1', expiresAt: new Date(Date.now() + 14 * 864e5), ...v });
    it('includes a pending invitation', async () => {
      await invite('Pending@Owner.test');
      await invite('first@owner.test', { clientId: A1 });
      expect(await clientOwnerEmails(dbs.owner, A2, new Date())).toEqual(['pending@owner.test']);
      expect(await clientOwnerEmails(dbs.owner, A1, new Date())).toEqual(['first@owner.test', 'second@owner.test']);
    });
    it('excludes expired and revoked invitations', async () => {
      await invite('expired@owner.test', { expiresAt: new Date(Date.now() - 1000) });
      await invite('revoked@owner.test', { revokedAt: new Date() });
      await invite('accepted@owner.test', { acceptedAt: new Date() });
      await invite('viewer@owner.test', { role: 'client_viewer' });
      expect(await clientOwnerEmails(dbs.owner, A2, new Date())).toEqual([]);
    });
    it('enable_client_billing with priceCents and setupFeeCents for a pending owner sends one payment link at that price', async () => {
      await ready();
      await invite('pending@owner.test');
      const r = await call(admin, 'enable_client_billing', { clientId: A2, priceCents: 15000, setupFeeCents: 1000 });
      expect(r).toMatchObject({ ok: true, state: 'invited', priceCents: 15000, setupFeeCents: 1000, recipients: 1 });
      expect(checkoutArg()).toMatchObject({ customerEmail: 'pending@owner.test', setupFeeCents: 1000 });
      const n = await notices();
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ audience: 'client', clientId: A2, kind: 'client-payment-link' });
    });
    it('enable_client_billing with a per-client price works when the agency never saved defaults', async () => {
      await seedConnect();
      await invite('pending@owner.test');
      const r = await call(admin, 'enable_client_billing', { clientId: A2, priceCents: 15000 });
      expect(r).toMatchObject({ ok: true, state: 'invited', priceCents: 15000 });
      expect(gw.callsTo('createConnectedProduct')).toHaveLength(1);
      const productId = (await connectRow())!.stripeProductId;
      expect(productId).toMatch(/^prod_conn/);
      expect(gw.callsTo('createConnectedPrice')[0]!.args[0]).toMatchObject({ productId, unitAmountCents: 15000 });
      // A later per-client price reuses the stored product.
      await call(admin, 'enable_client_billing', { clientId: A1, priceCents: 12000 });
      expect(gw.callsTo('createConnectedProduct')).toHaveLength(1);
      expect(gw.callsTo('createConnectedPrice')[1]!.args[0]).toMatchObject({ productId, unitAmountCents: 12000 });
    });
    it('Checkout customerEmail prefers an accepted owner over a pending invitation', async () => {
      await ready();
      await addUser('oz', 'z@owner.test', A2, new Date('2026-01-01'));
      await invite('a@owner.test');
      await call(admin, 'enable_client_billing', { clientId: A2 });
      expect(checkoutArg()).toMatchObject({ customerEmail: 'z@owner.test' });
      expect(await clientOwnerEmails(dbs.owner, A2, new Date())).toEqual(['a@owner.test', 'z@owner.test']);
      expect(await preferredOwnerEmail(dbs.owner, A2, new Date())).toBe('z@owner.test');
      await dbs.owner.delete(membership).where(eq(membership.userId, 'oz'));
      expect(await preferredOwnerEmail(dbs.owner, A2, new Date())).toBe('a@owner.test');
      expect(await preferredOwnerEmail(dbs.owner, IDS.clientB1, new Date())).toBeNull();
    });
    it('turning billing on as the last open setup step completes the setup (Phase 11b §8)', async () => {
      await ready();
      await invite('pending@owner.test');
      await dbs.owner.update(client).set({ keywords: ['ac'], serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 5, zips: [] }, placeId: 'ChIJx' }).where(eq(client.id, A2));
      await dbs.owner.insert(clientSetup).values({ clientId: A2, agencyId: IDS.agencyA, skipped: ['search', 'invite'], competitorsDoneAt: new Date() });
      await call(admin, 'enable_client_billing', { clientId: A2 });
      expect((await dbs.owner.select().from(clientSetup).where(eq(clientSetup.clientId, A2)))[0]!.completedAt).toBeInstanceOf(Date);
    });
    it('uses the default price, invites the first owner by email, sets invited and queues one client notice with the link', async () => {
      await ready({ defaultSetupFeeCents: 2500 });
      const r = await call(admin, 'enable_client_billing', { clientId: A1 });
      expect(r).toMatchObject({ ok: true, state: 'invited', priceCents: 9900, setupFeeCents: 2500, recipients: 2 });
      expect(JSON.stringify(r)).not.toContain('fake_connect_checkout');
      expect(gw.callsTo('createConnectedPrice')).toEqual([]);
      expect(checkoutArg()).toMatchObject({ stripeAccount: 'acct_1', priceId: 'price_def', setupFeeCents: 2500, customerEmail: 'first@owner.test' });
      expect(checkoutArg().applicationFeePercent).toBeUndefined();
      expect(await row(A1)).toMatchObject({ enabled: true, state: 'invited', priceCents: 9900, setupFeeCents: 2500, stripePriceId: 'price_def' });
      const n = await notices();
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ audience: 'client', clientId: A1, kind: 'client-payment-link', agencyId: IDS.agencyA });
      expect(n[0]!.params).toMatchObject({ checkoutUrl: expect.stringContaining('fake_connect_checkout') });
    });
    it('Checkout returns to the client billing page (success and cancel)', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      expect(checkoutArg()).toMatchObject({ successUrl: `${APP}/c/${A1}/settings/billing?checkout=done`, cancelUrl: `${APP}/c/${A1}/settings/billing?checkout=cancelled` });
    });
    it('a price override creates a per-client connected price and stores it', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1, priceCents: 15000, setupFeeCents: 0 });
      const p = gw.callsTo('createConnectedPrice')[0]!.args[0] as Record<string, unknown>;
      expect(p).toMatchObject({ stripeAccount: 'acct_1', productId: 'prod_1', unitAmountCents: 15000 });
      const created = (await row(A1))!;
      expect(created).toMatchObject({ priceCents: 15000, setupFeeCents: 0 });
      expect(created.stripePriceId).not.toBe('price_def');
      expect(checkoutArg()).toMatchObject({ priceId: created.stripePriceId });
      expect(checkoutArg().setupFeeCents).toBeUndefined();
    });
    it('an override equal to the agency default reuses the default price', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1, priceCents: 9900 });
      expect(gw.callsTo('createConnectedPrice')).toEqual([]);
      expect(checkoutArg().priceId).toBe('price_def');
    });
    it('application fee: global setting applies, a per-agency value wins (even 0), only sent when > 0', async () => {
      await ready();
      await dbs.owner.insert(platformSetting).values({ key: 'connect_application_fee_percent', value: 2.5, updatedBy: 't' }).onConflictDoUpdate({ target: platformSetting.key, set: { value: 2.5 } });
      await call(admin, 'enable_client_billing', { clientId: A1 });
      expect(checkoutArg(0).applicationFeePercent).toBe(2.5);
      await dbs.owner.update(agencyConnect).set({ applicationFeePercent: '1.00' });
      await call(admin, 'resend_client_payment_link', { clientId: A1 });
      expect(checkoutArg(1).applicationFeePercent).toBe(1);
      await dbs.owner.update(agencyConnect).set({ applicationFeePercent: '0.00' });
      await call(admin, 'resend_client_payment_link', { clientId: A1 });
      expect(checkoutArg(2).applicationFeePercent).toBeUndefined();
    });
    it('a Stripe failure maps to internal and leaves no state or notice behind', async () => {
      await ready();
      gw.failNext();
      expect((await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).code).toBe('internal');
      expect(await row(A1)).toBeUndefined();
      expect(await notices()).toEqual([]);
    });
    it('rejects non-integer or out-of-range price overrides', async () => {
      await ready();
      for (const priceCents of [-1, 1.5, 10_000_001]) expect((await fails(call(admin, 'enable_client_billing', { clientId: A1, priceCents }))).code).toBe('invalid_input');
    });
  });

  describe('resend_client_payment_link', () => {
    it('regenerates the Checkout link and replaces the unsent notice', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      await call(admin, 'resend_client_payment_link', { clientId: A1 });
      expect(gw.callsTo('createConnectedCheckout')).toHaveLength(2);
      const n = await notices();
      expect(n).toHaveLength(1);
      expect(n[0]!.params).toMatchObject({ checkoutUrl: expect.stringContaining('fake_connect_checkout') });
      expect(checkoutArg(1)).toMatchObject({ priceId: 'price_def', customerEmail: 'first@owner.test' });
    });
    it('only while a link is pending (state invited)', async () => {
      await ready();
      expect((await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).code).toBe('conflict');
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, stripeSubscriptionId: 'sub_z' });
      expect((await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).code).toBe('conflict');
    });
  });

  describe('disable_client_billing', () => {
    it('requires confirm: true', async () => {
      await ready();
      expect((await fails(call(admin, 'disable_client_billing', { clientId: A1 }))).code).toBe('invalid_input');
    });
    it('an invited client with no subscription goes straight to off; the pending link is never mailed', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      expect(await call(admin, 'disable_client_billing', { clientId: A1, confirm: true })).toMatchObject({ ok: true, state: 'off', cancelAtPeriodEnd: false });
      expect(await row(A1)).toMatchObject({ enabled: false, state: 'off' });
      expect(gw.callsTo('cancelConnectedSubscriptionAtPeriodEnd')).toEqual([]);
      expect(await notices()).toEqual([]);
    });
    it('an active subscription is cancelled at period end; state waits for the webhook but billing shows off', async () => {
      await ready();
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, priceCents: 9900, stripeSubscriptionId: 'sub_9', stripeCustomerId: 'cus_9' });
      gw.seedConnectedSubscription({ id: 'sub_9', stripeAccount: 'acct_1', customerId: 'cus_9' });
      expect(await call(admin, 'disable_client_billing', { clientId: A1, confirm: true })).toMatchObject({ ok: true, state: 'active', cancelAtPeriodEnd: true });
      expect(gw.callsTo('cancelConnectedSubscriptionAtPeriodEnd')[0]!.args[0]).toMatchObject({ stripeAccount: 'acct_1', subscriptionId: 'sub_9' });
      expect(await row(A1)).toMatchObject({ enabled: false, state: 'active' });
    });
    it('a Stripe failure leaves billing enabled', async () => {
      await ready();
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, stripeSubscriptionId: 'sub_9' });
      gw.failNext();
      expect((await fails(call(admin, 'disable_client_billing', { clientId: A1, confirm: true }))).code).toBe('internal');
      expect((await row(A1))!.enabled).toBe(true);
    });
    it('after a disconnect it is local only (no Stripe call)', async () => {
      await ready({ status: 'disconnected', chargesEnabled: false });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'disconnected', enabled: true, stripeSubscriptionId: 'sub_9' });
      await call(admin, 'disable_client_billing', { clientId: A1, confirm: true });
      expect(gw.calls).toEqual([]);
      expect(await row(A1)).toMatchObject({ enabled: false, state: 'disconnected' });
    });
    it('is idempotent', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      await call(admin, 'disable_client_billing', { clientId: A1, confirm: true });
      expect(await call(admin, 'disable_client_billing', { clientId: A1, confirm: true })).toMatchObject({ ok: true, state: 'off' });
    });
  });

  describe('set_client_price (Review focus 2)', () => {
    const subscribed = async () => {
      await ready();
      gw.seedConnectedSubscription({ id: 'sub_9', stripeAccount: 'acct_1', customerId: 'cus_9', priceId: 'price_def' });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, priceCents: 9900, billedPriceCents: 9900, stripePriceId: 'price_def', stripeSubscriptionId: 'sub_9' });
    };
    it('next_bill: new price on the existing subscription, no proration, no new Checkout', async () => {
      await subscribed();
      expect(await call(admin, 'set_client_price', { clientId: A1, priceCents: 12000, applyTo: 'next_bill' })).toMatchObject({ ok: true, priceCents: 12000, appliedToSubscription: true });
      const u = gw.callsTo('updateConnectedSubscriptionPrice')[0]!.args[0] as Record<string, unknown>;
      expect(u).toMatchObject({ stripeAccount: 'acct_1', subscriptionId: 'sub_9', prorate: false });
      const r = (await row(A1))!;
      expect(r).toMatchObject({ priceCents: 12000, billedPriceCents: 12000, state: 'active' });
      expect(u.priceId).toBe(r.stripePriceId);
      expect(gw.callsTo('createConnectedCheckout')).toEqual([]);
    });
    it('new_only: sets only the next-Checkout price; the billed price (and revenue) stay what Stripe bills', async () => {
      await subscribed();
      expect(await call(admin, 'set_client_price', { clientId: A1, priceCents: 12000, applyTo: 'new_only' })).toMatchObject({ ok: true, priceCents: 12000, appliedToSubscription: false });
      expect(gw.callsTo('updateConnectedSubscriptionPrice')).toEqual([]);
      expect(await row(A1)).toMatchObject({ priceCents: 12000, billedPriceCents: 9900 });
      expect(await call(admin, 'get_client_revenue')).toMatchObject({ mrrCents: 9900 });
      expect(gw.callsTo('archiveConnectedPrice')).toEqual([]);
    });
    it('an unchanged amount creates no new Stripe price', async () => {
      await subscribed();
      await call(admin, 'set_client_price', { clientId: A1, priceCents: 9900, applyTo: 'next_bill' });
      expect(gw.callsTo('createConnectedPrice')).toEqual([]);
      expect(gw.callsTo('updateConnectedSubscriptionPrice')).toEqual([]);
      await call(admin, 'set_client_price', { clientId: A1, priceCents: 12000, applyTo: 'new_only' });
      expect(gw.callsTo('createConnectedPrice')).toHaveLength(1);
      await call(admin, 'set_client_price', { clientId: A1, priceCents: 12000, applyTo: 'new_only' });
      expect(gw.callsTo('createConnectedPrice')).toHaveLength(1);
    });
    it.each(['next_bill', 'new_only'] as const)('while invited (%s): expires the old session and mails a fresh link at the new price', async (applyTo) => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      const oldSession = (await row(A1))!.checkoutSessionId!;
      const r = await call(admin, 'set_client_price', { clientId: A1, priceCents: 7000, applyTo });
      expect(r).toMatchObject({ ok: true, appliedToSubscription: false, linkResent: true });
      expect(gw.connectedCheckouts.get(oldSession)?.status).toBe('expired');
      const after = (await row(A1))!;
      expect(after).toMatchObject({ state: 'invited', priceCents: 7000, billedPriceCents: null });
      expect(after.checkoutSessionId).not.toBe(oldSession);
      expect(checkoutArg(1).priceId).toBe(after.stripePriceId);
      const n = await notices();
      expect(n).toHaveLength(1);
      expect(n[0]).toMatchObject({ kind: 'client-payment-link' });
    });
    it('while invited with no client owner left it refuses before touching Stripe', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      await dbs.owner.delete(membership);
      const before = gw.calls.length;
      expect((await fails(call(admin, 'set_client_price', { clientId: A1, priceCents: 7000, applyTo: 'new_only' }))).code).toBe('no_client_owner');
      expect(gw.calls.length).toBe(before + 0);
    });
    it('a client without a subscription just stores the price for the next link, either mode', async () => {
      await ready();
      await call(admin, 'set_client_price', { clientId: A2, priceCents: 7000, applyTo: 'next_bill' });
      expect(gw.callsTo('updateConnectedSubscriptionPrice')).toEqual([]);
      expect(await row(A2)).toMatchObject({ priceCents: 7000, enabled: false, state: 'off' });
    });
    it('a Stripe failure on the subscription update leaves the stored price unchanged', async () => {
      await subscribed();
      const upd = gw.updateConnectedSubscriptionPrice.bind(gw);
      gw.updateConnectedSubscriptionPrice = async (i) => { gw.failNext(); return upd(i); };
      expect((await fails(call(admin, 'set_client_price', { clientId: A1, priceCents: 12000, applyTo: 'next_bill' }))).code).toBe('internal');
      expect(await row(A1)).toMatchObject({ priceCents: 9900, stripePriceId: 'price_def' });
    });
    it('validates applyTo and price', async () => {
      await ready();
      expect((await fails(call(admin, 'set_client_price', { clientId: A1, priceCents: 100, applyTo: 'now' }))).code).toBe('invalid_input');
      expect((await fails(call(admin, 'set_client_price', { clientId: A1, priceCents: -5, applyTo: 'new_only' }))).code).toBe('invalid_input');
    });
  });

  describe('list_client_billing_status and get_client_revenue', () => {
    const seedRows = async () => {
      const [x] = await dbs.owner.insert(client).values({ agencyId: IDS.agencyA, name: 'A3', verticalId: 'dental', status: 'active' }).returning({ id: client.id });
      const [y] = await dbs.owner.insert(client).values({ agencyId: IDS.agencyA, name: 'A4', verticalId: 'dental', status: 'active' }).returning({ id: client.id });
      await dbs.owner.insert(clientBilling).values([
        { clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, priceCents: 9900, billedPriceCents: 9900, setupFeeCents: 100, stripeSubscriptionId: 's1' },
        { clientId: A2, agencyId: IDS.agencyA, state: 'payment_needed', enabled: true, priceCents: 5000, billedPriceCents: 5000, stripeSubscriptionId: 's2' },
        { clientId: x!.id, agencyId: IDS.agencyA, state: 'active', enabled: true, priceCents: 20000, billedPriceCents: 20000, stripeSubscriptionId: 's3' },
        { clientId: y!.id, agencyId: IDS.agencyA, state: 'invited', enabled: true, priceCents: 7000 },
      ]);
      return { x: x!.id, y: y!.id };
    };
    it('the admin sees states with pills and amounts', async () => {
      await seedRows();
      const r = (await call(admin, 'list_client_billing_status')) as { clients: Record<string, unknown>[] };
      expect(r.clients).toHaveLength(4);
      expect(r.clients.find((c) => c.clientId === A1)).toMatchObject({ state: 'active', pill: { key: 'paying', label: 'Paying' }, priceCents: 9900, nextPriceCents: 9900, setupFeeCents: 100 });
      expect(r.clients.find((c) => c.clientId === A2)).toMatchObject({ pill: { key: 'payment_needed' } });
    });
    it('the pill shows Paused over the billing state', async () => {
      await seedRows();
      await dbs.owner.update(client).set({ pausedAt: new Date(), pausedBy: 'x' }).where(eq(client.id, A1));
      const r = (await call(admin, 'list_client_billing_status')) as { clients: { clientId: string; pill: { key: string } }[] };
      expect(r.clients.find((c) => c.clientId === A1)!.pill.key).toBe('paused');
    });
    it('an account manager sees only in-scope clients, with states and pills but no amount keys at all', async () => {
      await seedRows();
      const r = (await call(mk('account_manager', [A1]), 'list_client_billing_status')) as { clients: Record<string, unknown>[] };
      expect(r.clients.map((c) => c.clientId)).toEqual([A1]);
      expect(r.clients[0]).toMatchObject({ state: 'active', pill: { key: 'paying' } });
      expect(JSON.stringify(r)).not.toMatch(/cents|amount|price|fee|mrr/i);
    });
    it('revenue: MRR of active subscriptions, paying and payment_needed counts, our cost = base + extra seats', async () => {
      await seedRows(); // 4 active clients -> 1 extra seat over the 3 included
      const r = await call(admin, 'get_client_revenue');
      expect(r).toEqual({ currency: 'usd', mrrCents: 29900, payingCount: 2, paymentNeededCount: 1, invitedCount: 1, ourCostCents: 22900 + 9900, marginCents: 29900 - 32800 });
    });
    it('revenue is zero with no client billing and ignores disabled billing', async () => {
      expect(await call(admin, 'get_client_revenue')).toMatchObject({ mrrCents: 0, payingCount: 0, paymentNeededCount: 0, ourCostCents: 22900 });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: false, priceCents: 9900, billedPriceCents: 9900, stripeSubscriptionId: 's1' });
      expect(await call(admin, 'get_client_revenue')).toMatchObject({ mrrCents: 0, payingCount: 0 });
    });
  });

  describe('R10: Checkout sessions are expired when replaced', () => {
    it('resend creates the new session, commits, then expires the previous one; a failing expire does not block the resend', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      const first = (await row(A1))!.checkoutSessionId!;
      gw.calls.length = 0;
      await call(admin, 'resend_client_payment_link', { clientId: A1 });
      expect(gw.connectedCheckouts.get(first)?.status).toBe('expired');
      const order = gw.calls.map((c) => c.method);
      expect(order.indexOf('createConnectedCheckout')).toBeLessThan(order.indexOf('expireConnectedCheckout'));
      const second = (await row(A1))!.checkoutSessionId!;
      expect(second).not.toBe(first);
      expect(gw.connectedCheckouts.get(second)?.status).toBe('open');
      // an expiry that fails after the commit is logged (error name only) and does not undo the resend
      gw.expireConnectedCheckout = async () => { throw new Error('boom https://secret.checkout.link'); };
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await call(admin, 'resend_client_payment_link', { clientId: A1 })).toMatchObject({ ok: true });
      expect(log).toHaveBeenCalledWith('[billing] expireConnectedCheckout failed', expect.anything(), expect.anything());
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret.checkout.link');
      log.mockRestore();
    });
    it('disable expires a pending invite session', async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      const sid = (await row(A1))!.checkoutSessionId!;
      await call(admin, 'disable_client_billing', { clientId: A1, confirm: true });
      expect(gw.connectedCheckouts.get(sid)?.status).toBe('expired');
      expect((await row(A1))!.checkoutSessionId).toBeNull();
    });
  });

  describe('R13: replacing an invite', () => {
    const JUST_PAID = 'This client has just paid. Refresh to see the latest status.';
    const invite = async () => {
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      return (await row(A1))!.checkoutSessionId!;
    };

    it('resend refuses (conflict) when the open session has already been paid, before creating a new one', async () => {
      const sid = await invite();
      gw.connectedCheckouts.get(sid)!.status = 'complete';
      const before = (await notices()).length;
      expect(await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: JUST_PAID });
      expect(gw.callsTo('createConnectedCheckout')).toHaveLength(1);
      expect(await notices()).toHaveLength(before);
      expect((await row(A1))!.checkoutSessionId).toBe(sid);
    });

    it('set_client_price on an invited client refuses the same way and changes nothing', async () => {
      const sid = await invite();
      gw.connectedCheckouts.get(sid)!.status = 'complete';
      expect(await fails(call(admin, 'set_client_price', { clientId: A1, priceCents: 15000, applyTo: 'next_bill' }))).toMatchObject({ code: 'conflict', message: JUST_PAID });
      expect(gw.callsTo('createConnectedPrice')).toEqual([]);
      expect(gw.callsTo('createConnectedCheckout')).toHaveLength(1);
      expect((await row(A1))!.priceCents).toBe(9900);
    });

    it('set_client_price creates the new link before expiring the old one', async () => {
      const sid = await invite();
      gw.calls.length = 0;
      await call(admin, 'set_client_price', { clientId: A1, priceCents: 15000, applyTo: 'new_only' });
      const order = gw.calls.map((c) => c.method);
      expect(order.indexOf('createConnectedCheckout')).toBeLessThan(order.indexOf('expireConnectedCheckout'));
      expect(gw.connectedCheckouts.get(sid)?.status).toBe('expired');
    });

    it('a failed commit leaves the old link usable and expires the unmailed new session', async () => {
      const sid = await invite();
      const create = gw.createConnectedCheckout.bind(gw);
      gw.createConnectedCheckout = async (i) => {
        const r = await create(i);
        await dbs.owner.update(agencyConnect).set({ status: 'disconnected' }); // lands between the Stripe call and the write
        return r;
      };
      expect((await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).code).toBe('connect_not_ready');
      expect(gw.connectedCheckouts.get(sid)?.status).toBe('open');
      expect([...gw.connectedCheckouts.values()].filter((c) => c.id !== sid).map((c) => c.status)).toEqual(['expired']);
      expect((await row(A1))!.checkoutSessionId).toBe(sid);
    });

    it('d) a concurrent resend that replaced the session first wins: ours is refused and expired, theirs is untouched', async () => {
      const sid = await invite();
      const create = gw.createConnectedCheckout.bind(gw);
      gw.createConnectedCheckout = async (i) => {
        const r = await create(i);
        gw.connectedCheckouts.set('cs_other', { id: 'cs_other', stripeAccount: 'acct_1', status: 'open' });
        await dbs.owner.update(clientBilling).set({ checkoutSessionId: 'cs_other' }).where(eq(clientBilling.clientId, A1));
        return r;
      };
      expect((await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).code).toBe('conflict');
      expect((await row(A1))!.checkoutSessionId).toBe('cs_other');
      expect(gw.connectedCheckouts.get('cs_other')?.status).toBe('open');
      expect(gw.connectedCheckouts.get(sid)?.status).toBe('open');
      expect([...gw.connectedCheckouts.values()].filter((c) => !['cs_other', sid].includes(c.id)).map((c) => c.status)).toEqual(['expired']);
    });

    it('d) a concurrent enable that won the race: the second enable is refused and its session expired', async () => {
      await ready();
      const create = gw.createConnectedCheckout.bind(gw);
      gw.createConnectedCheckout = async (i) => {
        const r = await create(i);
        gw.connectedCheckouts.set('cs_first', { id: 'cs_first', stripeAccount: 'acct_1', status: 'open' });
        await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'invited', enabled: true, priceCents: 9900, stripePriceId: 'price_def', checkoutSessionId: 'cs_first' });
        return r;
      };
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: 'Billing is already on for this client.' });
      expect((await row(A1))!.checkoutSessionId).toBe('cs_first');
      expect(gw.connectedCheckouts.get('cs_first')?.status).toBe('open');
      expect([...gw.connectedCheckouts.values()].filter((c) => c.id !== 'cs_first').map((c) => c.status)).toEqual(['expired']);
      expect(await notices()).toEqual([]);
    });

    it('e) a paused Stripe subscription counts as live and refuses enable', async () => {
      await ready();
      gw.seedConnectedSubscription({ id: 'sub_old', stripeAccount: 'acct_1', customerId: 'cus_old', status: 'paused' });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'disconnected', enabled: false, stripeSubscriptionId: 'sub_old' });
      expect((await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).code).toBe('conflict');
      expect((await row(A1))!.stripeSubscriptionId).toBe('sub_old');
    });

    it('Checkout sessions carry the client id as the client reference', async () => {
      await invite();
      expect(checkoutArg()).toMatchObject({ clientReferenceId: A1 });
    });
  });

  describe('R11: an existing Stripe subscription blocks a second one', () => {
    const stale = (status: 'active' | 'canceled', seed = true) => async () => {
      await ready();
      if (seed) gw.seedConnectedSubscription({ id: 'sub_old', stripeAccount: 'acct_1', customerId: 'cus_old', status });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'disconnected', enabled: false, stripeSubscriptionId: 'sub_old' });
    };
    it('a live stored subscription refuses enable', async () => {
      await stale('active')();
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: 'This client already has a subscription in your Stripe account. Cancel it there first.' });
      expect(gw.callsTo('createConnectedCheckout')).toEqual([]);
      expect((await row(A1))!.stripeSubscriptionId).toBe('sub_old');
    });
    it.each([['ended', 'canceled', true], ['gone', 'canceled', false]] as const)('a %s stored subscription is forgotten and enable proceeds', async (_n, status, seed) => {
      await stale(status, seed)();
      expect(await call(admin, 'enable_client_billing', { clientId: A1 })).toMatchObject({ ok: true, state: 'invited' });
      expect((await row(A1))!.stripeSubscriptionId).toBeNull();
    });
    it('a lookup failure other than not-found fails closed', async () => {
      await stale('active')();
      gw.failNext();
      expect((await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).code).toBe('internal');
    });
  });

  describe('R12 enable pre-checks and setup fee', () => {
    it('active with a pending cancellation (enabled=false) is refused with the period-end copy, before any Stripe call', async () => {
      await ready();
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: false, billedPriceCents: 9900, stripeSubscriptionId: 'sub_9' });
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: "This client's subscription ends at the end of the billing period. Turn billing on again after that." });
      expect(gw.callsTo('getConnectedSubscription')).toEqual([]);
      expect(gw.callsTo('createConnectedCheckout')).toEqual([]);
    });
    it('active or payment_needed with billing on -> already on, before any Stripe call', async () => {
      await ready();
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'payment_needed', enabled: true, stripeSubscriptionId: 'sub_9' });
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: 'Billing is already on for this client.' });
      expect(gw.calls).toEqual([]);
    });
    it('a disconnect landing during the Checkout call is caught inside the write transaction', async () => {
      await ready();
      const orig = gw.createConnectedCheckout.bind(gw);
      gw.createConnectedCheckout = async (i) => {
        await dbs.owner.update(agencyConnect).set({ status: 'disconnected', chargesEnabled: false });
        return orig(i);
      };
      expect(await fails(call(admin, 'enable_client_billing', { clientId: A1 }))).toMatchObject({ code: 'connect_not_ready', message: 'Finish your Stripe setup first.' });
      expect(await row(A1)).toBeUndefined();
      expect(await notices()).toEqual([]);
    });
    it('the setup fee is charged only to a client who has never paid', async () => {
      await ready({ defaultSetupFeeCents: 2500 });
      await dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'cancelled', enabled: false, lastPaidAt: new Date(), stripePriceId: 'price_def', priceCents: 9900 });
      expect(await call(admin, 'enable_client_billing', { clientId: A1 })).toMatchObject({ setupFeeCents: 0 });
      expect(checkoutArg().setupFeeCents).toBeUndefined();
    });
    it('our cost is 0 for a pilot agency', async () => {
      await dbs.owner.update(agencyBilling).set({ state: 'pilot' });
      expect(await call(admin, 'get_client_revenue')).toMatchObject({ ourCostCents: 0, marginCents: 0 });
    });
  });

  describe('paused-agency guard (A13)', () => {
    it('disable_client_billing stays allowed; enable, resend and set_client_price are blocked', async () => {
      expect(PAUSED_WRITE_ALLOW_LIST).toContain('disable_client_billing');
      for (const t of ['enable_client_billing', 'resend_client_payment_link', 'set_client_price']) expect(PAUSED_WRITE_ALLOW_LIST).not.toContain(t);
      await ready();
      await call(admin, 'enable_client_billing', { clientId: A1 });
      await pauseAgency(dbs.owner, IDS.agencyA, 'suspended');
      expect((await fails(call(admin, 'enable_client_billing', { clientId: A2 }))).code).toBe('service_paused');
      expect((await fails(call(admin, 'resend_client_payment_link', { clientId: A1 }))).code).toBe('service_paused');
      expect((await fails(call(admin, 'set_client_price', { clientId: A1, priceCents: 1, applyTo: 'new_only' }))).code).toBe('service_paused');
      expect(await call(admin, 'disable_client_billing', { clientId: A1, confirm: true })).toMatchObject({ ok: true });
    });
  });
});
