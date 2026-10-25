import { agency, agencyBilling, agencyConnect, billingNotice, client, clientBilling, stripeConnectEvent } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectEventLike } from './connect-gateway-types';
import { handleConnectEvent } from './connect-webhook';
import { type FakeGateway, fakeGateway } from './fake-gateway';
import { addClients, resetBilling, setBilling } from './test-util';

vi.mock('./client-pause', async (orig) => {
  const m = await orig<typeof import('./client-pause')>();
  return { ...m, liftAutoPause: vi.fn(m.liftAutoPause) };
});
const { liftAutoPause } = await import('./client-pause');

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const ACCT_A = 'acct_a';
const ACCT_B = 'acct_b';
const T0 = 1_790_000_000;
let planId: string;
let gw: FakeGateway;

beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
  gw = fakeGateway();
  gw.seedConnectedAccount({ id: ACCT_A, chargesEnabled: true, detailsSubmitted: true });
  gw.seedConnectedAccount({ id: ACCT_B, chargesEnabled: true, detailsSubmitted: true });
  await dbs.owner.insert(agencyConnect).values([
    { agencyId: IDS.agencyA, stripeAccountId: ACCT_A, status: 'connected', chargesEnabled: true, detailsSubmitted: true, connectedAt: new Date(T0 * 1000 - 1e6) },
    { agencyId: IDS.agencyB, stripeAccountId: ACCT_B, status: 'connected', chargesEnabled: true, detailsSubmitted: true, connectedAt: new Date(T0 * 1000 - 1e6) },
  ]);
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const ev = (id: string, type: string, object: Record<string, unknown>, o: { account?: string; created?: number } = {}): ConnectEventLike => ({
  id, type, created: o.created ?? T0, account: o.account ?? ACCT_A, data: { object },
});
const handle = (e: ConnectEventLike) => handleConnectEvent(dbs.service, gw, e);
const billing = async (id: string = IDS.clientA1) => (await dbs.owner.select().from(clientBilling).where(eq(clientBilling.clientId, id)))[0]!;
const connect = async (agencyId: string = IDS.agencyA) => (await dbs.owner.select().from(agencyConnect).where(eq(agencyConnect.agencyId, agencyId)))[0]!;
const notices = () => dbs.owner.select().from(billingNotice);
const clientRow = async (id: string = IDS.clientA1) => (await dbs.owner.select().from(client).where(eq(client.id, id)))[0]!;
const record = async (id: string) => (await dbs.owner.select().from(stripeConnectEvent).where(eq(stripeConnectEvent.id, id)))[0];

/** Client A1 mid-invite on agency A. */
const invited = (extra: Partial<typeof clientBilling.$inferInsert> = {}) =>
  dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'invited', enabled: true, priceCents: 9900, stripePriceId: 'price_1', checkoutSessionId: 'cs_1', ...extra });
/** Client A1 paying on agency A. */
const active = (extra: Partial<typeof clientBilling.$inferInsert> = {}) =>
  dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'active', enabled: true, priceCents: 9900, billedPriceCents: 9900, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', lastPaidAt: new Date((T0 - 100) * 1000), ...extra });

describe('handleConnectEvent: pipeline', () => {
  it('records the event as processed, then reports a replay as duplicate', async () => {
    await active();
    const e = ev('e1', 'invoice.payment_failed', { subscription: 'sub_1' });
    expect(await handle(e)).toBe('processed');
    expect(await record('e1')).toMatchObject({ accountId: ACCT_A, type: 'invoice.payment_failed', error: null });
    expect((await record('e1'))?.processedAt).not.toBeNull();
    expect(await handle(e)).toBe('duplicate');
    expect(await notices()).toHaveLength(2); // applied once
  });

  it('a throwing handler rolls back, records the message (not the payload) and a retry reprocesses', async () => {
    await invited();
    const e = ev('e2', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_9', subscription: 'sub_missing' });
    await expect(handle(e)).rejects.toThrow();
    expect(await record('e2')).toMatchObject({ processedAt: null, error: expect.any(String) });
    expect((await record('e2'))!.error).not.toContain('cus_9');
    expect((await billing()).state).toBe('invited');
    gw.seedConnectedSubscription({ id: 'sub_missing', stripeAccount: ACCT_A, customerId: 'cus_9', unitAmountCents: 9900 });
    expect(await handle(e)).toBe('processed');
    expect((await record('e2'))).toMatchObject({ error: null });
  });

  it('unrelated types and unknown accounts are acknowledged and ignored without touching anything', async () => {
    await active();
    expect(await handle(ev('u1', 'customer.created', { id: 'cus_x' }))).toBe('ignored');
    expect(await handle(ev('u2', 'invoice.payment_failed', { subscription: 'sub_1' }, { account: 'acct_unknown' }))).toBe('ignored');
    expect(await handle({ id: 'u3', type: 'invoice.payment_failed', created: T0, data: { object: { subscription: 'sub_1' } } })).toBe('ignored');
    expect((await billing()).state).toBe('active');
    expect((await record('u2'))?.processedAt).not.toBeNull();
    expect((await record('u3'))?.processedAt).not.toBeNull();
  });
});

describe('handleConnectEvent: account events', () => {
  it('account.updated: connected when charges are enabled, sets connected_at once', async () => {
    await dbs.owner.update(agencyConnect).set({ status: 'pending', chargesEnabled: false, detailsSubmitted: false, connectedAt: null }).where(eq(agencyConnect.agencyId, IDS.agencyA));
    expect(await handle(ev('a1', 'account.updated', { id: ACCT_A, charges_enabled: true, details_submitted: true }))).toBe('processed');
    const c = await connect();
    expect(c).toMatchObject({ status: 'connected', chargesEnabled: true, detailsSubmitted: true });
    expect(c.connectedAt).toBeInstanceOf(Date);
    const first = c.connectedAt;
    await handle(ev('a2', 'account.updated', { id: ACCT_A, charges_enabled: true, details_submitted: true }, { created: T0 + 5 }));
    expect((await connect()).connectedAt).toEqual(first);
  });

  it('account.updated: restricted when details are submitted but charges are off; pending otherwise', async () => {
    gw.seedConnectedAccount({ id: ACCT_A, chargesEnabled: false, detailsSubmitted: true });
    await handle(ev('a1', 'account.updated', { id: ACCT_A }));
    expect(await connect()).toMatchObject({ status: 'restricted', chargesEnabled: false, detailsSubmitted: true });
    gw.seedConnectedAccount({ id: ACCT_A, chargesEnabled: false, detailsSubmitted: false });
    await handle(ev('a2', 'account.updated', { id: ACCT_A }));
    expect(await connect()).toMatchObject({ status: 'pending', detailsSubmitted: false });
  });

  it('account.updated never resurrects a disconnected connection', async () => {
    await dbs.owner.update(agencyConnect).set({ status: 'disconnected', chargesEnabled: false }).where(eq(agencyConnect.agencyId, IDS.agencyA));
    expect(await handle(ev('a1', 'account.updated', { id: ACCT_A, charges_enabled: true, details_submitted: true }))).toBe('ignored');
    expect(await connect()).toMatchObject({ status: 'disconnected', chargesEnabled: false });
  });

  it('account.updated for agency A leaves agency B untouched', async () => {
    gw.seedConnectedAccount({ id: ACCT_A, chargesEnabled: false, detailsSubmitted: false });
    await handle(ev('a1', 'account.updated', { id: ACCT_A }));
    expect(await connect(IDS.agencyB)).toMatchObject({ status: 'connected', chargesEnabled: true });
  });

  it('account.application.deauthorized disconnects the agency and its clients (f10); other agencies stay', async () => {
    await active();
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientB1, agencyId: IDS.agencyB, state: 'active', enabled: true, stripeSubscriptionId: 'sub_b' });
    expect(await handle(ev('d1', 'account.application.deauthorized', { id: ACCT_A }))).toBe('processed');
    expect(await connect()).toMatchObject({ status: 'disconnected', chargesEnabled: false });
    expect((await billing()).state).toBe('disconnected');
    expect((await billing(IDS.clientB1)).state).toBe('active');
    expect(await connect(IDS.agencyB)).toMatchObject({ status: 'connected' });
  });

  it('R24: deauthorization forgets the account and the objects on it, even after an admin disconnect', async () => {
    await dbs.owner.update(agencyConnect).set({ stripeProductId: 'prod_a', stripeDefaultPriceId: 'price_a', portalConfigurationId: 'bpc_a', defaultPriceCents: 9900 }).where(eq(agencyConnect.agencyId, IDS.agencyA));
    await dbs.owner.update(agencyConnect).set({ status: 'disconnected', chargesEnabled: false, disconnectedAt: new Date() }).where(eq(agencyConnect.agencyId, IDS.agencyA)); // admin disconnect keeps the id
    expect(await handle(ev('d1', 'account.application.deauthorized', { id: ACCT_A }))).toBe('processed');
    expect(await connect()).toMatchObject({ status: 'disconnected', stripeAccountId: null, stripeProductId: null, stripeDefaultPriceId: null, portalConfigurationId: null, defaultPriceCents: 9900 });
    expect(await connect(IDS.agencyB)).toMatchObject({ stripeAccountId: ACCT_B });
  });

  it('events after a disconnect change nothing', async () => {
    await active();
    await handle(ev('d1', 'account.application.deauthorized', { id: ACCT_A }));
    expect(await handle(ev('p1', 'invoice.payment_failed', { subscription: 'sub_1' }, { created: T0 + 1 }))).toBe('ignored');
    expect((await billing()).state).toBe('disconnected');
  });
});

describe('handleConnectEvent: checkout.session.completed', () => {
  const sub = (o: Partial<Parameters<FakeGateway['seedConnectedSubscription']>[0]> = {}) =>
    gw.seedConnectedSubscription({ id: 'sub_1', stripeAccount: ACCT_A, customerId: 'cus_1', unitAmountCents: 7700, ...o });

  it('activates the invited client: ids, billed price read from Stripe, last_paid_at, client-paid notice to the agency', async () => {
    await invited({ priceCents: 9900 });
    sub();
    expect(await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' }))).toBe('processed');
    const b = await billing();
    expect(b).toMatchObject({ state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billedPriceCents: 7700, checkoutSessionId: null, lastPaidAt: new Date(T0 * 1000), lastStripeEventAt: new Date(T0 * 1000) });
    const n = await notices();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: 'client-paid', audience: 'agency', clientId: IDS.clientA1, agencyId: IDS.agencyA });
  });

  it('a held agency: the new subscription is paused on the connected account (15c3a)', async () => {
    await invited();
    sub();
    await dbs.owner.update(agency).set({ suspendedAt: new Date(), suspendedReason: 'unpaid invoice', suspendedBy: 'staff-1' }).where(eq(agency.id, IDS.agencyA));
    expect(await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' }))).toBe('processed');
    expect(gw.callsTo('pauseCollection')).toEqual([{ method: 'pauseCollection', args: ['sub_1', { stripeAccount: ACCT_A }] }]);
  });

  it('an unheld agency: no pauseCollection (15c3a)', async () => {
    await invited();
    sub();
    await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' }));
    expect(gw.callsTo('pauseCollection')).toHaveLength(0);
  });

  it('finds the client by client_reference_id when its session was since replaced, and expires the superseded session (R13c)', async () => {
    await invited({ checkoutSessionId: 'cs_new' });
    await dbs.owner.insert(billingNotice).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, audience: 'client', kind: 'client-payment-link', params: { checkoutUrl: 'x' }, dedupeKey: 'k1' });
    gw.connectedCheckouts.set('cs_new', { id: 'cs_new', stripeAccount: ACCT_A, status: 'open' });
    sub();
    expect(await handle(ev('c1', 'checkout.session.completed', { id: 'cs_old', client_reference_id: IDS.clientA1, customer: 'cus_1', subscription: 'sub_1' }))).toBe('processed');
    expect((await billing()).state).toBe('active');
    expect(gw.connectedCheckouts.get('cs_new')!.status).toBe('expired');
    expect((await notices()).filter((n) => n.kind === 'client-payment-link')).toHaveLength(0);
  });

  it('a completed session of the tracked row does not try to expire anything', async () => {
    await invited();
    sub();
    await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' }));
    expect(gw.callsTo('expireConnectedCheckout')).toHaveLength(0);
  });

  it('a failed best-effort expiry of the superseded session does not fail the event', async () => {
    await invited({ checkoutSessionId: 'cs_new' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sub();
    expect(await handle(ev('c1', 'checkout.session.completed', { id: 'cs_old', client_reference_id: IDS.clientA1, customer: 'cus_1', subscription: 'sub_1' }))).toBe('processed');
    expect((await record('c1'))?.processedAt).not.toBeNull();
  });

  it('cross-agency: a session / client reference that belongs to another agency is ignored', async () => {
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientB1, agencyId: IDS.agencyB, state: 'invited', enabled: true, checkoutSessionId: 'cs_b' });
    gw.seedConnectedSubscription({ id: 'sub_x', stripeAccount: ACCT_A, customerId: 'cus_x', unitAmountCents: 100 });
    expect(await handle(ev('x1', 'checkout.session.completed', { id: 'cs_b', customer: 'cus_x', subscription: 'sub_x' }))).toBe('ignored');
    expect(await handle(ev('x2', 'checkout.session.completed', { id: 'cs_z', client_reference_id: IDS.clientB1, customer: 'cus_x', subscription: 'sub_x' }))).toBe('ignored');
    expect(await billing(IDS.clientB1)).toMatchObject({ state: 'invited', stripeSubscriptionId: null });
  });

  it('ignores a checkout whose subscription is not live', async () => {
    await invited();
    sub({ status: 'canceled' });
    expect(await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' }))).toBe('ignored');
    expect((await billing()).state).toBe('invited');
  });

  it('R11: a checkout for another subscription than the tracked live one is ignored', async () => {
    await active();
    sub({ id: 'sub_2' });
    expect(await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', client_reference_id: IDS.clientA1, customer: 'cus_1', subscription: 'sub_2' }))).toBe('ignored');
    expect((await billing()).stripeSubscriptionId).toBe('sub_1');
  });

  const second = (id: string, session = 'cs_1') => ev(id, 'checkout.session.completed', { id: session, client_reference_id: IDS.clientA1, customer: 'cus_1', subscription: 'sub_2' });

  it('M8: a second live subscription queues one agency notice and keeps the tracked id', async () => {
    await active();
    sub({ id: 'sub_2' });
    expect(await handle(second('m1'))).toBe('ignored');
    expect((await billing()).stripeSubscriptionId).toBe('sub_1');
    const n = await notices();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: 'client-duplicate-subscription', audience: 'agency', agencyId: IDS.agencyA, clientId: IDS.clientA1, params: {} });
  });

  it('M8: one notice across redelivery', async () => {
    await active();
    sub({ id: 'sub_2' });
    await handle(second('m1'));
    expect(await handle(second('m1'))).toBe('duplicate');
    expect(await handle(second('m2'))).toBe('ignored'); // a different event id for the same subscription
    expect(await notices()).toHaveLength(1);
  });

  it('M8: a non-live second subscription queues nothing', async () => {
    await active();
    sub({ id: 'sub_2', status: 'canceled' });
    expect(await handle(second('m1'))).toBe('ignored');
    expect(await notices()).toHaveLength(0);
  });

  it("M8: another agency's account never reaches the client", async () => {
    await active();
    gw.seedConnectedSubscription({ id: 'sub_2', stripeAccount: ACCT_B, customerId: 'cus_1', unitAmountCents: 9900 });
    expect(await handle({ ...second('m1'), account: ACCT_B })).toBe('ignored');
    expect(await notices()).toHaveLength(0);
    expect((await billing()).stripeSubscriptionId).toBe('sub_1');
  });
});

describe('handleConnectEvent: invoices, cancellation, refund, dispute', () => {
  it('invoice.paid keeps the client active and clears the failure (subscription under parent.subscription_details)', async () => {
    await active({ state: 'payment_needed', paymentFailedSince: new Date((T0 - 50) * 1000) });
    const obj = { parent: { subscription_details: { subscription: 'sub_1' } } };
    expect(await handle(ev('i1', 'invoice.paid', obj))).toBe('processed');
    expect(await billing()).toMatchObject({ state: 'active', paymentFailedSince: null, lastPaidAt: new Date(T0 * 1000), lastStripeEventAt: new Date(T0 * 1000) });
  });

  it('a first payment seen as invoice.paid (no prior last_paid_at) queues the agency client-paid notice', async () => {
    await active({ lastPaidAt: null });
    await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }));
    const n = await notices();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: 'client-paid', audience: 'agency', clientId: IDS.clientA1 });
  });

  it('a later invoice.paid queues no notice', async () => {
    await active();
    await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }));
    expect(await notices()).toHaveLength(0);
  });

  it('invoice.payment_failed -> payment_needed with payment_failed_since; agency client-payment-failed + client client-payment-needed', async () => {
    await active();
    expect(await handle(ev('i1', 'invoice.payment_failed', { subscription: 'sub_1' }))).toBe('processed');
    expect(await billing()).toMatchObject({ state: 'payment_needed', paymentFailedSince: new Date(T0 * 1000) });
    const byKind = Object.fromEntries((await notices()).map((n) => [n.kind, n]));
    expect(byKind['client-payment-failed']).toMatchObject({ audience: 'agency', clientId: IDS.clientA1, agencyId: IDS.agencyA });
    expect(byKind['client-payment-needed']).toMatchObject({ audience: 'client', clientId: IDS.clientA1, agencyId: IDS.agencyA });
    expect(Object.keys(byKind)).toHaveLength(2);
  });

  it('customer.subscription.deleted -> cancelled', async () => {
    await active();
    expect(await handle(ev('s1', 'customer.subscription.deleted', { id: 'sub_1' }))).toBe('processed');
    expect(await billing()).toMatchObject({ state: 'cancelled', enabled: false });
  });

  it('charge.refunded sets refunded_at; charge.dispute.created sets disputed_at (customer read from the charge for disputes)', async () => {
    await active();
    expect(await handle(ev('r1', 'charge.refunded', { id: 'ch_1', customer: 'cus_1' }))).toBe('processed');
    expect((await billing()).refundedAt).toEqual(new Date(T0 * 1000));
    gw.seedConnectedCharge({ id: 'ch_2', stripeAccount: ACCT_A, customerId: 'cus_1' });
    expect(await handle(ev('d1', 'charge.dispute.created', { id: 'dp_1', charge: 'ch_2' }, { created: T0 + 1 }))).toBe('processed');
    expect((await billing()).disputedAt).toEqual(new Date((T0 + 1) * 1000));
    expect((await billing()).state).toBe('active');
  });

  it('cross-agency: an invoice / cancellation / refund for agency B\'s subscription arriving on agency A\'s account changes nothing', async () => {
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientB1, agencyId: IDS.agencyB, state: 'active', enabled: true, stripeSubscriptionId: 'sub_b', stripeCustomerId: 'cus_b' });
    expect(await handle(ev('x1', 'invoice.payment_failed', { subscription: 'sub_b' }))).toBe('ignored');
    expect(await handle(ev('x2', 'customer.subscription.deleted', { id: 'sub_b' }))).toBe('ignored');
    expect(await handle(ev('x3', 'charge.refunded', { id: 'ch', customer: 'cus_b' }))).toBe('ignored');
    expect(await billing(IDS.clientB1)).toMatchObject({ state: 'active', refundedAt: null, paymentFailedSince: null });
    expect(await notices()).toHaveLength(0);
    // and the same events on B's own account do apply
    expect(await handle(ev('y1', 'invoice.payment_failed', { subscription: 'sub_b' }, { account: ACCT_B }))).toBe('processed');
    expect((await billing(IDS.clientB1)).state).toBe('payment_needed');
  });

  it('R11: an event for a subscription other than the tracked one is ignored', async () => {
    await active();
    expect(await handle(ev('i1', 'invoice.payment_failed', { subscription: 'sub_other' }))).toBe('ignored');
    expect(await handle(ev('s1', 'customer.subscription.deleted', { id: 'sub_other' }))).toBe('ignored');
    expect((await billing()).state).toBe('active');
  });

  it('R3 ordering guard: an older delivery does not overwrite newer state', async () => {
    await active();
    expect(await handle(ev('new', 'invoice.payment_failed', { subscription: 'sub_1' }, { created: T0 + 10 }))).toBe('processed');
    expect(await handle(ev('old', 'invoice.paid', { subscription: 'sub_1' }, { created: T0 + 1 }))).toBe('ignored');
    expect(await billing()).toMatchObject({ state: 'payment_needed', lastStripeEventAt: new Date((T0 + 10) * 1000) });
    expect((await record('old'))?.processedAt).not.toBeNull();
  });
});

describe('handleConnectEvent: auto-pause lift (R14)', () => {
  const pauseA1 = (by: string) => dbs.owner.update(client).set({ pausedAt: new Date((T0 - 10) * 1000), pausedBy: by }).where(eq(client.id, IDS.clientA1));

  it('invoice.paid lifts an automatic pause', async () => {
    await active({ state: 'payment_needed', paymentFailedSince: new Date((T0 - 50) * 1000) });
    await setBilling(dbs.owner, planId, { state: 'active' });
    await pauseA1('auto');
    await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }));
    expect(await clientRow()).toMatchObject({ pausedAt: null, pausedBy: null });
  });

  it('a manual pause is never lifted by a payment', async () => {
    await active();
    await setBilling(dbs.owner, planId, { state: 'active' });
    await pauseA1('user-1');
    await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }));
    expect(await clientRow()).toMatchObject({ pausedBy: 'user-1' });
    expect((await clientRow()).pausedAt).not.toBeNull();
  });

  it('seat-cap refusal leaves the client paused but still records the payment and the paid notice, without rethrowing', async () => {
    await active({ state: 'payment_needed', lastPaidAt: null, paymentFailedSince: new Date((T0 - 50) * 1000) });
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await pauseA1('auto');
    await addClients(dbs.owner, 2); // serviceable: A2 + 2 = 3 = cap (A1 is paused), so resuming A1 would take a 4th seat
    const r = await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }));
    expect(r).toBe('processed');
    expect((await clientRow()).pausedAt).not.toBeNull();
    expect(await billing()).toMatchObject({ state: 'active', lastPaidAt: new Date(T0 * 1000) });
    expect((await notices()).map((n) => n.kind)).toEqual(['client-paid']);
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
    expect((await record('i1'))?.processedAt).not.toBeNull();
  });

  it('R23: lifting an auto-pause re-syncs the agency\'s 9a seats after the commit', async () => {
    await active({ state: 'payment_needed', paymentFailedSince: new Date((T0 - 50) * 1000) });
    await addClients(dbs.owner, 2); // 4 active once A1 is back, 3 included -> 1 extra seat
    await setBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_p', stripeSubscriptionId: 'sub_platform', billableSeatsSynced: 0 });
    gw.seedSubscription({ id: 'sub_platform', customerId: 'cus_p' });
    await pauseA1('auto');
    expect(await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }))).toBe('processed');
    expect(await clientRow()).toMatchObject({ pausedAt: null });
    expect(gw.callsTo('updateSeatQuantity').map((c) => c.args.slice(0, 2))).toEqual([['sub_platform', 1]]);
    const [ab] = await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, IDS.agencyA));
    expect(ab).toMatchObject({ billableSeatsSynced: 1, seatSyncPending: false });
  });

  it('R23: no seat sync when nothing was lifted (manual pause, or no pause)', async () => {
    await active();
    await setBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_p', stripeSubscriptionId: 'sub_platform', billableSeatsSynced: 0 });
    gw.seedSubscription({ id: 'sub_platform', customerId: 'cus_p' });
    await pauseA1('user-1');
    await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }));
    expect(gw.callsTo('updateSeatQuantity')).toEqual([]);
  });

  it('a held agency: resume is refused with service_paused, tolerated, the event still processes', async () => {
    await active({ state: 'payment_needed', paymentFailedSince: new Date((T0 - 50) * 1000) });
    await setBilling(dbs.owner, planId, { state: 'active' });
    await pauseA1('auto');
    await dbs.owner.update(agency).set({ suspendedAt: new Date(), suspendedReason: 'unpaid invoice', suspendedBy: 'staff-1' }).where(eq(agency.id, IDS.agencyA));
    expect(await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }))).toBe('processed');
    expect((await clientRow()).pausedAt).not.toBeNull();
    expect((await record('i1'))?.processedAt).not.toBeNull();
  });

  it('I1: an unexpected resume failure is not swallowed: the event stays unprocessed with the error recorded and a retry succeeds', async () => {
    await active({ state: 'payment_needed', paymentFailedSince: new Date((T0 - 50) * 1000) });
    await setBilling(dbs.owner, planId, { state: 'active' });
    await pauseA1('auto');
    vi.mocked(liftAutoPause).mockRejectedValueOnce(new Error('db exploded'));
    const e = ev('i1', 'invoice.paid', { subscription: 'sub_1' });
    await expect(handle(e)).rejects.toThrow('db exploded');
    expect(await record('i1')).toMatchObject({ processedAt: null, error: 'db exploded' });
    expect((await billing()).state).toBe('payment_needed');
    expect(await handle(e)).toBe('processed');
    expect(await clientRow()).toMatchObject({ pausedAt: null });
  });
});

describe('handleConnectEvent: account.updated reads live state (R15)', () => {
  it('an older restricted payload delivered after the account went live leaves the row connected', async () => {
    gw.seedConnectedAccount({ id: ACCT_A, chargesEnabled: true, detailsSubmitted: true });
    await dbs.owner.update(agencyConnect).set({ status: 'pending', chargesEnabled: false, detailsSubmitted: false, connectedAt: null }).where(eq(agencyConnect.agencyId, IDS.agencyA));
    expect(await handle(ev('a1', 'account.updated', { id: ACCT_A, charges_enabled: false, details_submitted: true }, { created: T0 - 100 }))).toBe('processed');
    expect(await connect()).toMatchObject({ status: 'connected', chargesEnabled: true, detailsSubmitted: true });
    expect((await connect()).connectedAt).toBeInstanceOf(Date);
  });
});

describe('handleConnectEvent: unpaid Checkout (async payment method, R16)', () => {
  const sub = () => gw.seedConnectedSubscription({ id: 'sub_1', stripeAccount: ACCT_A, customerId: 'cus_1', unitAmountCents: 7700 });
  const unpaid = () => handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', payment_status: 'unpaid' }));

  it('tracks customer and subscription but stays invited: no last_paid_at, no notice', async () => {
    await invited();
    sub();
    expect(await unpaid()).toBe('processed');
    // R21: the completed session id is kept (a resend can see it was paid).
    expect(await billing()).toMatchObject({ state: 'invited', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billedPriceCents: 7700, lastPaidAt: null, checkoutSessionId: 'cs_1' });
    expect(await notices()).toHaveLength(0);
  });

  it('the first invoice.paid then activates and queues client-paid once', async () => {
    await invited();
    sub();
    await unpaid();
    expect(await handle(ev('i1', 'invoice.paid', { subscription: 'sub_1' }, { created: T0 + 5 }))).toBe('processed');
    expect(await billing()).toMatchObject({ state: 'active', lastPaidAt: new Date((T0 + 5) * 1000) });
    await handle(ev('i2', 'invoice.paid', { subscription: 'sub_1' }, { created: T0 + 9 }));
    expect((await notices()).map((n) => n.kind)).toEqual(['client-paid']);
  });

  it('invoice.payment_failed on the tracked invited row moves it to payment_needed', async () => {
    await invited();
    sub();
    await unpaid();
    expect(await handle(ev('f1', 'invoice.payment_failed', { subscription: 'sub_1' }, { created: T0 + 5 }))).toBe('processed');
    expect(await billing()).toMatchObject({ state: 'payment_needed', paymentFailedSince: new Date((T0 + 5) * 1000) });
  });

  it('payment_status paid / no_payment_required activate as before; an unpaid replay never downgrades an active client', async () => {
    await invited();
    sub();
    await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', payment_status: 'no_payment_required' }));
    expect((await billing()).state).toBe('active');
    await handle(ev('c2', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', payment_status: 'unpaid' }, { created: T0 + 1 }));
    expect((await billing()).state).toBe('active');
  });

  it('never records a 0 billed price: unit amount unknown falls back to the intended price, else leaves it unchanged', async () => {
    await invited({ priceCents: 9900 });
    gw.seedConnectedSubscription({ id: 'sub_1', stripeAccount: ACCT_A, customerId: 'cus_1' });
    await handle(ev('c1', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' }));
    expect((await billing()).billedPriceCents).toBe(9900);
    await dbs.owner.delete(clientBilling);
    await invited({ priceCents: null, billedPriceCents: 4200 });
    await handle(ev('c2', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' }, { created: T0 + 1 }));
    expect(await billing()).toMatchObject({ state: 'active', billedPriceCents: 4200 });
  });
});
