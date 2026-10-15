import { fakeGateway, type FakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyConnect, client, clientBilling } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PAUSED_WRITE_ALLOW_LIST } from '../billing-guard';
import { createToolRegistry } from '../registry';
import { BILLING_NOT_CONFIGURED_MESSAGE } from './billing';
import { NOTHING_TO_MANAGE_MESSAGE, PORTAL_UNAVAILABLE_MESSAGE } from './my-billing';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const APP = 'https://app.test';
const A1 = IDS.clientA1;
const mk = (role: AccessContext['role'], scope: AccessContext['clientScope'] = 'all', agencyId: string = IDS.agencyA, userId = `u-${role}`) =>
  createAccessContext({ agencyId, userId, role, clientScope: scope, features: [] });
const owner = mk('client_owner', [A1]);
const viewer = mk('client_viewer', [A1]);
const guestOwner = mk('client_owner', [A1], IDS.agencyA, 'contact:abc');
const otherOwner = mk('client_owner', [IDS.clientA2]);
const admin = mk('agency_admin');
const am = mk('account_manager');

let gw: FakeGateway;
let registry: ReturnType<typeof createToolRegistry>;
const audit = { audit: { record: async () => {} } };
const call = (ctx: AccessContext, name: string, input: unknown = { clientId: A1 }) => registry.invoke(ctx, name, input);
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};
const seedConnect = async () => {
  gw.seedConnectedAccount({ id: 'acct_1', chargesEnabled: true, detailsSubmitted: true });
  await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, detailsSubmitted: true, connectedAt: new Date() });
};
const seedBilling = (v: Partial<typeof clientBilling.$inferInsert> = {}) =>
  dbs.owner.insert(clientBilling).values({ clientId: A1, agencyId: IDS.agencyA, state: 'active', enabled: true, billedPriceCents: 9900, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', ...v });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  gw = fakeGateway();
  registry = createToolRegistry({ app: dbs.app, service: dbs.service, billing: gw, appUrl: APP }, audit);
});

describe('roles (both tools): client owner of that client only', () => {
  it.each(['get_my_billing', 'open_billing_portal'])('%s: viewer, guest contact, agency roles and another client\'s owner are all refused', async (name) => {
    await seedConnect();
    await seedBilling();
    for (const who of [viewer, guestOwner, admin, am, otherOwner, mk('client_owner', [A1], IDS.agencyB)]) {
      const e = await fails(call(who, name));
      expect(['permission_denied', 'not_found']).toContain(e.code);
    }
    expect(gw.callsTo('createConnectedPortal')).toEqual([]);
    expect(gw.callsTo('getConnectedSubscription')).toEqual([]);
  });
});

describe('get_my_billing', () => {
  it('no billing row: off, no dates, nothing to manage', async () => {
    expect(await call(owner, 'get_my_billing')).toMatchObject({
      state: 'off', enabled: false, paused: false, nextChargeDate: null, nextChargeAmountCents: null, endsOn: null, canManagePayment: false, pill: { key: 'off' },
    });
  });

  it('active: next charge date and amount come from the live subscription; agency name is the branding display name', async () => {
    await seedConnect();
    await dbs.owner.update(agency).set({ branding: { displayName: 'Cool Agency' } }).where(eq(agency.id, IDS.agencyA));
    const end = new Date('2026-12-01T00:00:00Z');
    gw.seedConnectedSubscription({ id: 'sub_1', stripeAccount: 'acct_1', customerId: 'cus_1', unitAmountCents: 12900, currentPeriodEnd: end });
    await seedBilling();
    expect(await call(owner, 'get_my_billing')).toMatchObject({
      agencyName: 'Cool Agency', state: 'active', enabled: true, nextChargeDate: end.toISOString(), nextChargeAmountCents: 12900, canManagePayment: true, pill: { key: 'paying' },
    });
  });

  it('cancelled at period end: no next charge, an end date instead', async () => {
    await seedConnect();
    const end = new Date('2026-12-01T00:00:00Z');
    gw.seedConnectedSubscription({ id: 'sub_1', stripeAccount: 'acct_1', customerId: 'cus_1', unitAmountCents: 9900, currentPeriodEnd: end, cancelAtPeriodEnd: true });
    await seedBilling();
    expect(await call(owner, 'get_my_billing')).toMatchObject({ nextChargeDate: null, nextChargeAmountCents: null, endsOn: end.toISOString() });
  });

  it('degrades to the stored amount (no date) when the lookup fails or there is no gateway', async () => {
    await seedConnect();
    await seedBilling();
    gw.failNext();
    expect(await call(owner, 'get_my_billing')).toMatchObject({ state: 'active', nextChargeDate: null, nextChargeAmountCents: 9900 });
    const r = createToolRegistry({ app: dbs.app, service: dbs.service, appUrl: APP }, audit);
    expect(await r.invoke(owner, 'get_my_billing', { clientId: A1 })).toMatchObject({ nextChargeDate: null, nextChargeAmountCents: 9900, canManagePayment: false });
  });

  it('payment_needed, invited and paused map to their pills', async () => {
    await seedBilling({ state: 'payment_needed' });
    expect(await call(owner, 'get_my_billing')).toMatchObject({ state: 'payment_needed', pill: { key: 'payment_needed' } });
    await dbs.owner.update(clientBilling).set({ state: 'invited', stripeSubscriptionId: null }).where(eq(clientBilling.clientId, A1));
    expect(await call(owner, 'get_my_billing')).toMatchObject({ state: 'invited', nextChargeAmountCents: null, pill: { key: 'invited' } });
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, A1));
    expect(await call(owner, 'get_my_billing')).toMatchObject({ paused: true, pill: { key: 'paused' } });
  });

  it('exposes no agency-side data or platform name', async () => {
    await seedConnect();
    await dbs.owner.update(agencyConnect).set({ applicationFeePercent: '7', defaultPriceCents: 5000, stripeDefaultPriceId: 'price_def' }).where(eq(agencyConnect.agencyId, IDS.agencyA));
    await seedBilling({ stripePriceId: 'price_secret', priceCents: 15000 });
    const json = JSON.stringify(await call(owner, 'get_my_billing'));
    for (const leak of ['price_secret', 'price_def', 'acct_1', 'cus_1', 'sub_1', 'applicationFee', 'margin', 'upsell']) expect(json).not.toContain(leak);
    expect(json).not.toMatch(/rival\s*monday/i);
  });
});

describe('open_billing_portal', () => {
  it('returns the connected portal url with a return url back to the billing page', async () => {
    await seedConnect();
    await seedBilling();
    const r = (await call(owner, 'open_billing_portal')) as { url: string };
    const arg = gw.callsTo('createConnectedPortal')[0]!.args[0] as { stripeAccount: string; customerId: string; returnUrl: string };
    expect(arg).toEqual({ stripeAccount: 'acct_1', customerId: 'cus_1', returnUrl: `${APP}/c/${A1}/settings/billing` });
    expect(r.url).toContain(`/c/${A1}/settings/billing`);
  });

  it('refuses with plain copy: no gateway, no customer yet, agency disconnected, Stripe failure', async () => {
    await seedConnect();
    const none = createToolRegistry({ app: dbs.app, service: dbs.service, appUrl: APP }, audit);
    expect(await fails(none.invoke(owner, 'open_billing_portal', { clientId: A1 }))).toMatchObject({ code: 'conflict', message: BILLING_NOT_CONFIGURED_MESSAGE });
    expect(await fails(call(owner, 'open_billing_portal'))).toMatchObject({ code: 'conflict', message: NOTHING_TO_MANAGE_MESSAGE });
    await seedBilling();
    gw.failNext();
    const failed = await fails(call(owner, 'open_billing_portal'));
    expect(failed.code).toBe('internal');
    expect(failed.message).not.toMatch(/stripe|fake/i);
    await dbs.owner.update(agencyConnect).set({ status: 'disconnected' }).where(eq(agencyConnect.agencyId, IDS.agencyA));
    expect(await fails(call(owner, 'open_billing_portal'))).toMatchObject({ code: 'conflict', message: PORTAL_UNAVAILABLE_MESSAGE });
    for (const m of [NOTHING_TO_MANAGE_MESSAGE, PORTAL_UNAVAILABLE_MESSAGE, BILLING_NOT_CONFIGURED_MESSAGE]) expect(m).not.toMatch(/rival\s*monday/i);
  });

  it('stays open while the agency is paused (allow-list), and is a registered write', async () => {
    expect(PAUSED_WRITE_ALLOW_LIST).toContain('open_billing_portal');
    await seedConnect();
    await seedBilling();
    await pauseAgency(dbs.owner, IDS.agencyA, 'read_only');
    expect(await call(owner, 'open_billing_portal')).toMatchObject({ url: expect.any(String) });
  });
});
