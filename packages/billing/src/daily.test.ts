import { agencyBilling, agencyBillingEvent, agencyDailyStat, billingNotice } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBillingDaily } from './daily';
import { fakeGateway } from './fake-gateway';
import { AGENCY, addClients, resetBilling, setBilling } from './test-util';

afterEach(() => vi.restoreAllMocks());
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-14T02:30:00Z');
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner); // 2 active clients, 3 included, base 22900, seat 9900
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const row = async () => (await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, AGENCY)))[0]!;
const notices = async () => dbs.owner.select().from(billingNotice).where(eq(billingNotice.agencyId, AGENCY));
const events = async () => dbs.owner.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, AGENCY));
const stat = async (d = '2026-10-13') => (await dbs.owner.select().from(agencyDailyStat).where(eq(agencyDailyStat.agencyId, AGENCY))).find((r) => r.day === d);
const seedStat = (d = '2026-10-13') => dbs.owner.insert(agencyDailyStat).values({ agencyId: AGENCY, day: d });
const withSub = (gw: ReturnType<typeof fakeGateway>, v: Partial<typeof agencyBilling.$inferInsert> = {}, sub: Record<string, unknown> = {}) => {
  gw.seedSubscription({ id: 'sub_1', customerId: 'cus_1', ...sub });
  return setBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', billableSeatsSynced: 0, ...v });
};

describe('runBillingDaily timers', () => {
  it('moves an expired trial without a subscription to past_due', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing', trialEndsAt: day('2026-10-13') });
    const r = await runBillingDaily(dbs.service, fakeGateway(), NOW);
    expect(r.transitions).toBe(1);
    expect(await row()).toMatchObject({ state: 'past_due' });
    expect((await events()).map((e) => e.reason)).toEqual(['timer:trial_ended']);
  });

  it('ends a pilot into a trial using the plan trial days', async () => {
    await setBilling(dbs.owner, planId, { state: 'pilot', pilotEndsAt: day('2026-10-13') });
    await runBillingDaily(dbs.service, fakeGateway(), NOW);
    const r = await row();
    expect(r.state).toBe('trialing');
    expect(r.trialEndsAt!.getTime()).toBe(NOW.getTime() + 30 * 864e5);
  });

  it('does nothing for a healthy active agency', async () => {
    const gw = fakeGateway();
    await withSub(gw);
    expect(await runBillingDaily(dbs.service, gw, NOW)).toEqual({ transitions: 0, reminders: 0, seatRetries: 0, drift: 0 });
  });
});

describe('runBillingDaily reminders', () => {
  it.each([
    ['trialing', { trialEndsAt: day('2026-10-21') }, 'reminder_trial_ending_7', '2026-10-21'],
    ['trialing', { trialEndsAt: day('2026-10-15') }, 'reminder_trial_ending_1', '2026-10-15'],
    ['pilot', { pilotEndsAt: day('2026-10-21') }, 'reminder_pilot_ending_7', '2026-10-21'],
  ] as const)('%s: writes %s once, however often the job runs', async (state, v, kind, date) => {
    await setBilling(dbs.owner, planId, { state, ...v });
    const gw = fakeGateway();
    expect((await runBillingDaily(dbs.service, gw, NOW)).reminders).toBe(1);
    expect((await runBillingDaily(dbs.service, gw, NOW)).reminders).toBe(0);
    const n = await notices();
    expect(n).toHaveLength(1);
    const end = ('trialEndsAt' in v ? v.trialEndsAt : (v as { pilotEndsAt: Date }).pilotEndsAt) as Date;
    expect(n[0]).toMatchObject({ kind, dedupeKey: `reminder:${AGENCY}:${kind}:${date}`, params: { date: end.toISOString() } });
  });

  it('ignores other day gaps and other states', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing', trialEndsAt: day('2026-10-20') });
    expect((await runBillingDaily(dbs.service, fakeGateway(), NOW)).reminders).toBe(0);
    await dbs.owner.update(agencyBilling).set({ state: 'active', trialEndsAt: day('2026-10-21') });
    expect((await runBillingDaily(dbs.service, fakeGateway(), NOW)).reminders).toBe(0);
    expect(await notices()).toHaveLength(0);
  });
});

describe('runBillingDaily seats and drift', () => {
  it('retries a pending seat sync', async () => {
    const gw = fakeGateway();
    await addClients(dbs.owner, 3); // 5 active -> 2 billable
    await withSub(gw, { seatSyncPending: true }, { seatQuantity: 0 });
    const r = await runBillingDaily(dbs.service, gw, NOW);
    expect(r.seatRetries).toBe(1);
    expect(gw.subscriptions.get('sub_1')!.seatQuantity).toBe(2);
    expect(await row()).toMatchObject({ seatSyncPending: false, billableSeatsSynced: 2 });
  });

  it('corrects state drift from Stripe (past_due locally, active at Stripe)', async () => {
    const gw = fakeGateway();
    await withSub(gw, { state: 'past_due', pastDueSince: day('2026-10-12') });
    const r = await runBillingDaily(dbs.service, gw, NOW);
    expect(r.drift).toBe(1);
    expect(await row()).toMatchObject({ state: 'active', pastDueSince: null });
    expect((await events())[0]).toMatchObject({ actor: 'job', fromState: 'past_due', toState: 'active' });
  });

  it('maps past_due and cancel-at-period-end at Stripe', async () => {
    const gw = fakeGateway();
    await withSub(gw, {}, { status: 'past_due' });
    expect((await runBillingDaily(dbs.service, gw, NOW)).drift).toBe(1);
    expect((await row()).state).toBe('past_due');
    await dbs.owner.delete(agencyBilling);
    const end = new Date('2026-11-01T00:00:00Z');
    await withSub(gw, {}, { status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: end });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await row()).toMatchObject({ state: 'cancelled', cancelAt: end });
  });

  it('seat drift: Stripe quantity wins, then our active-client count is pushed', async () => {
    const gw = fakeGateway();
    await addClients(dbs.owner, 3); // 5 active -> 2 billable
    await withSub(gw, { billableSeatsSynced: 0 }, { seatQuantity: 7 });
    const r = await runBillingDaily(dbs.service, gw, NOW);
    expect(r.drift).toBe(1);
    expect(gw.subscriptions.get('sub_1')!.seatQuantity).toBe(2);
    expect((await row()).billableSeatsSynced).toBe(2);
  });

  it('a failing agency does not stop the loop and logs only the agency id and error name', async () => {
    const gw = fakeGateway();
    await withSub(gw);
    gw.subscriptions.delete('sub_1'); // getSubscription throws for agency A
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyB, state: 'trialing', planId, trialEndsAt: day('2026-10-13') });
    const err = vi.spyOn(console, 'error');
    const r = await runBillingDaily(dbs.service, gw, NOW);
    expect(r.transitions).toBe(1);
    expect((await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, IDS.agencyB)))[0]!.state).toBe('past_due');
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).toContain(AGENCY);
    expect(logged).not.toContain('no subscription');
  });
});

describe('runBillingDaily stats', () => {
  it('writes billing_state, paid_seats and mrr_cents into yesterday only', async () => {
    const gw = fakeGateway();
    await addClients(dbs.owner, 3);
    await withSub(gw, { billableSeatsSynced: 2 }, { seatQuantity: 2 });
    await seedStat('2026-10-13');
    await seedStat('2026-10-12');
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await stat('2026-10-13')).toMatchObject({ billingState: 'active', paidSeats: 2, mrrCents: 22900 + 2 * 9900 });
    expect((await stat('2026-10-12'))!.billingState).toBeNull();
  });

  it('subtracts the upcoming-invoice discount, never below zero', async () => {
    const gw = fakeGateway();
    await withSub(gw);
    gw.seedUpcoming('sub_1', { amountDueCents: 0, periodEnd: NOW, discountCents: 5000 });
    await seedStat();
    await runBillingDaily(dbs.service, gw, NOW);
    expect((await stat())!.mrrCents).toBe(22900 - 5000);
    gw.seedUpcoming('sub_1', { amountDueCents: 0, periodEnd: NOW, discountCents: 999999 });
    await runBillingDaily(dbs.service, gw, NOW);
    expect((await stat())!.mrrCents).toBe(0);
  });

  it('non-paying states get zero mrr and seats; cancelled with a future cancel_at still pays', async () => {
    const gw = fakeGateway();
    await setBilling(dbs.owner, planId, { state: 'trialing', trialEndsAt: day('2026-11-30'), billableSeatsSynced: 4 });
    await seedStat();
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await stat()).toMatchObject({ billingState: 'trialing', paidSeats: 0, mrrCents: 0 });
    await dbs.owner.update(agencyBilling).set({ state: 'cancelled', cancelAt: new Date('2026-11-01T00:00:00Z') });
    await runBillingDaily(dbs.service, gw, NOW);
    expect(await stat()).toMatchObject({ billingState: 'cancelled', paidSeats: 4, mrrCents: 22900 + 4 * 9900 });
  });

  it('does not create a missing stat row', async () => {
    await setBilling(dbs.owner, planId, { state: 'pilot' });
    await runBillingDaily(dbs.service, fakeGateway(), NOW);
    expect(await stat()).toBeUndefined();
  });
});
