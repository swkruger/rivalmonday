import { agencyConnect, agencyDailyStat, billingNotice, client, clientBilling } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runConnectDaily } from './connect-daily';
import { runBillingDaily } from './daily';
import { fakeGateway } from './fake-gateway';
import { addClients, resetBilling, setBilling as setAgencyBilling } from './test-util';

afterEach(() => vi.restoreAllMocks());
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-14T02:30:00Z');
const DAY = 864e5;
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY + extraMs);
const A1 = IDS.clientA1;
const A2 = IDS.clientA2;

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, autoPauseAfterDays: 7, connectedAt: new Date() });
});

const setBilling = (clientId: string, v: Partial<typeof clientBilling.$inferInsert>) =>
  dbs.owner.insert(clientBilling).values({ clientId, agencyId: IDS.agencyA, enabled: true, state: 'payment_needed', ...v });
const billing = async (id: string) => (await dbs.owner.select().from(clientBilling).where(eq(clientBilling.clientId, id)))[0]!;
const clientRow = async (id: string) => (await dbs.owner.select().from(client).where(eq(client.id, id)))[0]!;
const notices = async (kind?: string) => (await dbs.owner.select().from(billingNotice)).filter((n) => !kind || n.kind === kind);
const seedStat = () => dbs.owner.insert(agencyDailyStat).values({ agencyId: IDS.agencyA, day: '2026-10-13' });
const stat = async () => (await dbs.owner.select().from(agencyDailyStat))[0]!;

describe('auto-pause', () => {
  it('pauses a payment_needed client at exactly N days, not at N-1 days', async () => {
    await setBilling(A1, { paymentFailedSince: ago(7) });
    await setBilling(A2, { paymentFailedSince: ago(7, 1000) }); // 6 days 23:59:59
    await runBillingDaily(dbs.service, null, NOW);
    expect(await clientRow(A1)).toMatchObject({ pausedBy: 'auto' });
    expect((await clientRow(A1)).pausedAt).toBeInstanceOf(Date);
    expect((await clientRow(A2)).pausedAt).toBeNull();
  });

  it('queues one agency client-auto-paused notice with clientName and n, once across two runs', async () => {
    await setBilling(A1, { paymentFailedSince: ago(9) });
    await runBillingDaily(dbs.service, null, NOW);
    await runBillingDaily(dbs.service, null, NOW);
    const n = await notices('client-auto-paused');
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ audience: 'agency', clientId: A1, params: { clientName: (await clientRow(A1)).name, n: 7 } });
  });

  it('does nothing when auto-pause is off (null)', async () => {
    await dbs.owner.update(agencyConnect).set({ autoPauseAfterDays: null });
    await setBilling(A1, { paymentFailedSince: ago(30) });
    await runBillingDaily(dbs.service, null, NOW);
    expect((await clientRow(A1)).pausedAt).toBeNull();
    expect(await notices()).toHaveLength(0);
  });

  it('skips a disconnected agency and disconnected client billing rows', async () => {
    await setBilling(A1, { paymentFailedSince: ago(30), state: 'disconnected' });
    await setBilling(A2, { paymentFailedSince: ago(30) });
    await runBillingDaily(dbs.service, null, NOW);
    expect((await clientRow(A1)).pausedAt).toBeNull();
    expect((await clientRow(A2)).pausedAt).toBeInstanceOf(Date);
    await dbs.owner.update(client).set({ pausedAt: null, pausedBy: null });
    await dbs.owner.update(agencyConnect).set({ status: 'disconnected' });
    await runBillingDaily(dbs.service, null, NOW);
    expect((await clientRow(A2)).pausedAt).toBeNull();
  });

  it('R22: fires once per failure episode; a manual resume sticks until a new failure', async () => {
    const since = ago(9);
    await setBilling(A1, { paymentFailedSince: since });
    await runBillingDaily(dbs.service, null, NOW);
    expect((await clientRow(A1)).pausedBy).toBe('auto');
    expect((await billing(A1)).autoPausedFailureAt?.getTime()).toBe(since.getTime());
    await dbs.owner.update(client).set({ pausedAt: null, pausedBy: null }).where(eq(client.id, A1)); // the agency resumes
    await runBillingDaily(dbs.service, null, NOW);
    expect((await clientRow(A1)).pausedAt).toBeNull();
    expect(await notices('client-auto-paused')).toHaveLength(1);
    // A new failure episode (the client paid, then failed again) is paused again.
    await dbs.owner.update(clientBilling).set({ paymentFailedSince: ago(8) }).where(eq(clientBilling.clientId, A1));
    await runBillingDaily(dbs.service, null, NOW);
    expect((await clientRow(A1)).pausedBy).toBe('auto');
    expect(await notices('client-auto-paused')).toHaveLength(2);
  });

  it('never pauses a client whose billing is turned off (cancel pending)', async () => {
    await setBilling(A1, { paymentFailedSince: ago(30), enabled: false });
    await runBillingDaily(dbs.service, null, NOW);
    expect((await clientRow(A1)).pausedAt).toBeNull();
  });

  it('re-checks under lock: a client who paid after the candidate select is not paused (Task 7 must-fix)', async () => {
    await setBilling(A1, { paymentFailedSince: ago(9) });
    let paid = false;
    // invoice.paid lands between the candidate select and the pause transaction.
    const db = new Proxy(dbs.service, {
      get(t, p) {
        if (p === 'transaction') {
          return async (fn: Parameters<typeof t.transaction>[0]) => {
            if (!paid) {
              paid = true;
              await dbs.owner.update(clientBilling).set({ state: 'active', paymentFailedSince: null, lastPaidAt: NOW }).where(eq(clientBilling.clientId, A1));
            }
            return t.transaction(fn);
          };
        }
        const v = Reflect.get(t, p) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
    expect(await runConnectDaily(db, null, IDS.agencyA, NOW)).toMatchObject({ paused: 0 });
    expect(paid).toBe(true);
    expect((await clientRow(A1)).pausedAt).toBeNull();
    expect(await notices('client-auto-paused')).toHaveLength(0);
  });

  it('still pauses with a gateway present (seat sync is best effort)', async () => {
    await setBilling(A1, { paymentFailedSince: ago(8) });
    await runBillingDaily(dbs.service, fakeGateway(), NOW);
    expect((await clientRow(A1)).pausedBy).toBe('auto');
  });
});

describe('reconciliation (Stripe wins)', () => {
  const sub = (gw: ReturnType<typeof fakeGateway>, id: string, v: Record<string, unknown> = {}) => {
    gw.seedConnectedAccount({ id: 'acct_1', chargesEnabled: true, detailsSubmitted: true });
    return gw.seedConnectedSubscription({ id, stripeAccount: 'acct_1', customerId: `cus_${id}`, ...v });
  };

  it('moves payment_needed to active when Stripe says active, records the payment, and fixes price drift', async () => {
    const gw = fakeGateway();
    sub(gw, 'sub_1', { status: 'active', unitAmountCents: 12900 });
    await setBilling(A1, { state: 'payment_needed', stripeSubscriptionId: 'sub_1', billedPriceCents: 9900, paymentFailedSince: ago(2), lastPaidAt: ago(30) });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await billing(A1)).toMatchObject({ state: 'active', billedPriceCents: 12900, paymentFailedSince: null, lastPaidAt: NOW });
    expect(await notices()).toHaveLength(0);
  });

  describe('M3: a reconcile to active (Stripe active/trialing) lifts the auto-pause', () => {
    const paidSetup = async (gw: ReturnType<typeof fakeGateway>, id: string, clientId: string) => {
      sub(gw, id, { status: 'active', unitAmountCents: 9900 });
      await setBilling(clientId, { state: 'payment_needed', stripeSubscriptionId: id, billedPriceCents: 9900, paymentFailedSince: ago(9) });
    };
    const autoPaused = (id: string) => dbs.owner.update(client).set({ pausedAt: ago(1), pausedBy: 'auto' }).where(eq(client.id, id));

    it('M3: an auto-paused client is resumed and the agency told once on first payment', async () => {
      const gw = fakeGateway();
      await paidSetup(gw, 'sub_1', A1);
      await autoPaused(A1);
      const r = await runConnectDaily(dbs.service, gw, IDS.agencyA, NOW);
      expect(r).toMatchObject({ reconciled: 1, resumed: 1 });
      expect(await clientRow(A1)).toMatchObject({ pausedAt: null, pausedBy: null });
      expect(await billing(A1)).toMatchObject({ state: 'active', lastPaidAt: NOW });
      expect(await notices('client-paid')).toHaveLength(1);
      await runConnectDaily(dbs.service, gw, IDS.agencyA, NOW);
      expect(await notices('client-paid')).toHaveLength(1);
    });

    it('M3: a manual pause stays paused', async () => {
      const gw = fakeGateway();
      await paidSetup(gw, 'sub_1', A1);
      await dbs.owner.update(client).set({ pausedAt: ago(1), pausedBy: 'user-1' }).where(eq(client.id, A1));
      const r = await runConnectDaily(dbs.service, gw, IDS.agencyA, NOW);
      expect(r.resumed).toBe(0);
      expect(await clientRow(A1)).toMatchObject({ pausedBy: 'user-1' });
      expect((await clientRow(A1)).pausedAt).toBeInstanceOf(Date);
      expect((await billing(A1)).state).toBe('active');
    });

    it('M3: a seat-cap refusal keeps the reconciled state and the next row is still processed', async () => {
      const gw = fakeGateway();
      await setAgencyBilling(dbs.owner, planId, { state: 'trialing' });
      await paidSetup(gw, 'sub_1', A1);
      await paidSetup(gw, 'sub_2', A2);
      await autoPaused(A1);
      await addClients(dbs.owner, 2); // serviceable: A2 + 2 = 3 = cap (A1 paused), so lifting A1 would take a 4th seat
      const r = await runConnectDaily(dbs.service, gw, IDS.agencyA, NOW);
      expect(r).toMatchObject({ reconciled: 2, resumed: 0 });
      expect(await billing(A1)).toMatchObject({ state: 'active', lastPaidAt: NOW });
      expect(await billing(A2)).toMatchObject({ state: 'active', lastPaidAt: NOW });
      expect((await clientRow(A1)).pausedAt).toBeInstanceOf(Date);
      expect(vi.mocked(console.warn)).toHaveBeenCalledWith('[billing-daily] connect auto-pause not lifted', { clientId: A1 });
    });

    it('M3: syncSeats runs after a lift', async () => {
      const gw = fakeGateway();
      await paidSetup(gw, 'sub_1', A1);
      await autoPaused(A1);
      await setAgencyBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_p', stripeSubscriptionId: 'sub_platform', billableSeatsSynced: 0 });
      gw.seedSubscription({ id: 'sub_platform', customerId: 'cus_p' });
      await addClients(dbs.owner, 2); // 4 active once A1 is back, 3 included -> 1 extra seat
      await runConnectDaily(dbs.service, gw, IDS.agencyA, NOW);
      expect(gw.callsTo('updateSeatQuantity').map((c) => c.args.slice(0, 2))).toEqual([['sub_platform', 1]]);
    });
  });

  it('moves active to payment_needed on past_due and unpaid without a notice', async () => {
    const gw = fakeGateway();
    sub(gw, 'sub_1', { status: 'past_due', unitAmountCents: 9900 });
    sub(gw, 'sub_2', { status: 'unpaid', unitAmountCents: 9900 });
    await setBilling(A1, { state: 'active', stripeSubscriptionId: 'sub_1', billedPriceCents: 9900 });
    await setBilling(A2, { state: 'active', stripeSubscriptionId: 'sub_2', billedPriceCents: 9900 });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await billing(A1)).toMatchObject({ state: 'payment_needed' });
    expect((await billing(A1)).paymentFailedSince).toBeInstanceOf(Date);
    expect((await billing(A2)).state).toBe('payment_needed');
    expect(await notices()).toHaveLength(0);
  });

  it('cancels on canceled and on resource_missing (disabled, no notice)', async () => {
    const gw = fakeGateway();
    sub(gw, 'sub_1', { status: 'canceled' });
    await setBilling(A1, { state: 'active', stripeSubscriptionId: 'sub_1', billedPriceCents: 9900 });
    await setBilling(A2, { state: 'payment_needed', stripeSubscriptionId: 'sub_gone', billedPriceCents: 9900, paymentFailedSince: ago(1) });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await billing(A1)).toMatchObject({ state: 'cancelled', enabled: false });
    expect(await billing(A2)).toMatchObject({ state: 'cancelled', enabled: false, paymentFailedSince: null });
    expect(await notices()).toHaveLength(0);
  });

  it('never records a 0 price and leaves an incomplete subscription alone', async () => {
    const gw = fakeGateway();
    sub(gw, 'sub_1', { status: 'active', unitAmountCents: 0 });
    sub(gw, 'sub_2', { status: 'incomplete', unitAmountCents: 5000 });
    await setBilling(A1, { state: 'active', stripeSubscriptionId: 'sub_1', billedPriceCents: 9900 });
    await setBilling(A2, { state: 'active', stripeSubscriptionId: 'sub_2', billedPriceCents: 9900 });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await billing(A1)).toMatchObject({ state: 'active', billedPriceCents: 9900 });
    expect(await billing(A2)).toMatchObject({ state: 'active', billedPriceCents: 9900 });
  });

  it('does not touch disconnected rows or disconnected agencies', async () => {
    const gw = fakeGateway();
    sub(gw, 'sub_1', { status: 'canceled' });
    await setBilling(A1, { state: 'disconnected', stripeSubscriptionId: 'sub_1', billedPriceCents: 9900 });
    await runBillingDaily(dbs.service, gw, NOW);
    expect((await billing(A1)).state).toBe('disconnected');
    expect(gw.callsTo('getConnectedSubscription')).toHaveLength(0);
    await dbs.owner.update(clientBilling).set({ state: 'active' });
    await dbs.owner.update(agencyConnect).set({ status: 'disconnected' });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(gw.callsTo('getConnectedSubscription')).toHaveLength(0);
  });

  it('an unreachable ACCOUNT stops the agency\'s reconciliation for the run and cancels nothing (Task 7 must-fix)', async () => {
    const gw = fakeGateway(); // acct_1 unknown: the fake answers account_invalid, like Stripe for a revoked account
    await setBilling(A1, { state: 'active', stripeSubscriptionId: 'sub_1', billedPriceCents: 9900 });
    await setBilling(A2, { state: 'payment_needed', stripeSubscriptionId: 'sub_2', billedPriceCents: 9900, paymentFailedSince: ago(1) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await billing(A1)).toMatchObject({ state: 'active', enabled: true, stripeSubscriptionId: 'sub_1' });
    expect(await billing(A2)).toMatchObject({ state: 'payment_needed', enabled: true });
    expect(gw.callsTo('getConnectedSubscription')).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('reconciliation stopped'), expect.objectContaining({ agencyId: IDS.agencyA, stripeAccount: 'acct_1' }));
  });

  it('one failing row does not stop the others', async () => {
    const gw = fakeGateway();
    sub(gw, 'sub_1', { status: 'canceled' });
    sub(gw, 'sub_2', { status: 'canceled' });
    await setBilling(A1, { state: 'active', stripeSubscriptionId: 'sub_1' });
    await setBilling(A2, { state: 'active', stripeSubscriptionId: 'sub_2' });
    gw.failNext();
    await runBillingDaily(dbs.service, gw, NOW);
    const states = [(await billing(A1)).state, (await billing(A2)).state].sort();
    expect(states).toEqual(['active', 'cancelled']);
  });

  it('null gateway skips reconciliation but still auto-pauses and writes the stat', async () => {
    await seedStat();
    await setBilling(A1, { state: 'payment_needed', stripeSubscriptionId: 'sub_1', paymentFailedSince: ago(8) });
    await setBilling(A2, { state: 'active', stripeSubscriptionId: 'sub_2', billedPriceCents: 5000 });
    await runBillingDaily(dbs.service, null, NOW);
    expect((await billing(A2)).state).toBe('active');
    expect((await clientRow(A1)).pausedBy).toBe('auto');
    expect((await stat()).clientMrrCents).toBe(5000);
  });
});

describe('client_mrr_cents', () => {
  it('sums billed prices of enabled active subscriptions of active clients only', async () => {
    await seedStat();
    await setBilling(A1, { state: 'active', billedPriceCents: 9900, stripeSubscriptionId: 'sub_1' });
    await setBilling(A2, { state: 'payment_needed', billedPriceCents: 7000, stripeSubscriptionId: 'sub_2', paymentFailedSince: ago(1) });
    await runBillingDaily(dbs.service, null, NOW);
    expect((await stat()).clientMrrCents).toBe(9900);
  });

  it('writes 0 for an agency with no client billing', async () => {
    await seedStat();
    await runBillingDaily(dbs.service, fakeGateway(), NOW);
    expect((await stat()).clientMrrCents).toBe(0);
  });
});
