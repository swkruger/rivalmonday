import { agencyConnect, agencyDailyStat, billingNotice, client, clientBilling } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBillingDaily } from './daily';
import { fakeGateway } from './fake-gateway';
import { resetBilling } from './test-util';

afterEach(() => vi.restoreAllMocks());
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-14T02:30:00Z');
const DAY = 864e5;
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY + extraMs);
const A1 = IDS.clientA1;
const A2 = IDS.clientA2;

beforeEach(async () => {
  await resetBilling(dbs.owner);
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

  it('moves payment_needed to active when Stripe says active, silently, and fixes price drift', async () => {
    const gw = fakeGateway();
    sub(gw, 'sub_1', { status: 'active', unitAmountCents: 12900 });
    await setBilling(A1, { state: 'payment_needed', stripeSubscriptionId: 'sub_1', billedPriceCents: 9900, paymentFailedSince: ago(2), lastPaidAt: ago(30) });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await billing(A1)).toMatchObject({ state: 'active', billedPriceCents: 12900, paymentFailedSince: null });
    expect(await notices()).toHaveLength(0);
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
