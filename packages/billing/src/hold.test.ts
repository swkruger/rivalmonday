import { agency, agencyBilling, agencyBillingEvent, agencyConnect, clientBilling } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeGateway, fakeGateway } from './fake-gateway';
import { applyHoldCollection, holdBillingIssue, pauseIfHeld } from './hold';
import { AGENCY, addClients, resetBilling, setBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const ACCT = 'acct_a';
let planId: string;
let gw: FakeGateway;

beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
  gw = fakeGateway();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await setBilling(dbs.owner, planId, { state: 'active', stripeCustomerId: 'cus_p', stripeSubscriptionId: 'sub_platform' });
  gw.seedSubscription({ id: 'sub_platform', customerId: 'cus_p' });
  gw.seedConnectedAccount({ id: ACCT, chargesEnabled: true, detailsSubmitted: true });
  await dbs.owner.insert(agencyConnect).values({ agencyId: AGENCY, stripeAccountId: ACCT, status: 'connected', chargesEnabled: true, detailsSubmitted: true });
});

const csub = (id: string) => gw.seedConnectedSubscription({ id, stripeAccount: ACCT, customerId: `cus_${id}` });
const cbill = (clientId: string, state: 'active' | 'payment_needed' | 'cancelled' | 'invited', subId: string | null) =>
  dbs.owner.insert(clientBilling).values({ clientId, agencyId: AGENCY, state, enabled: true, priceCents: 9900, stripeSubscriptionId: subId });
const hold = (on: boolean) =>
  dbs.owner
    .update(agency)
    .set(on ? { suspendedAt: new Date(), suspendedReason: 'unpaid invoice', suspendedBy: 'staff-1' } : { suspendedAt: null, suspendedReason: null, suspendedBy: null })
    .where(eq(agency.id, AGENCY));
const events = () => dbs.owner.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, AGENCY)).orderBy(desc(agencyBillingEvent.createdAt));

async function seedClients() {
  const [c3, c4] = await addClients(dbs.owner, 2);
  csub('sub_c1');
  csub('sub_c2');
  csub('sub_c3');
  await cbill(IDS.clientA1, 'active', 'sub_c1');
  await cbill(IDS.clientA2, 'payment_needed', 'sub_c2');
  await cbill(c3!, 'cancelled', 'sub_c3');
  await cbill(c4!, 'invited', null);
}

describe('applyHoldCollection', () => {
  it('pauses agency + active client subs with the connected account; cancelled/off rows are skipped', async () => {
    await seedClients();
    const r = await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 'staff-1');
    expect(r).toEqual({ done: 3, failed: [] });
    const calls = gw.callsTo('pauseCollection').map((c) => c.args);
    expect(calls).toHaveLength(3);
    expect(calls).toContainEqual(['sub_platform', undefined]);
    expect(calls).toContainEqual(['sub_c1', { stripeAccount: ACCT }]);
    expect(calls).toContainEqual(['sub_c2', { stripeAccount: ACCT }]);
    expect((await events())[0]).toMatchObject({ reason: 'admin_hold_billing_ok', actor: 'staff-1', fromState: 'active', toState: 'active' });
  });

  it('a cancelled agency subscription is not targeted', async () => {
    await dbs.owner.update(agencyBilling).set({ state: 'cancelled' });
    const r = await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 's');
    expect(r.done).toBe(0);
    expect(gw.callsTo('pauseCollection')).toHaveLength(0);
  });

  it('partial failure records _failed and the issue is pause; the hold row is untouched', async () => {
    await seedClients();
    await hold(true);
    gw.failCollectionFor('sub_c2');
    const r = await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 'staff-1');
    expect(r.done).toBe(2);
    expect(r.failed).toEqual([{ kind: 'client', clientId: IDS.clientA2, clientName: expect.any(String) }]);
    expect((await events())[0]).toMatchObject({ reason: 'admin_hold_billing_failed' });
    expect(await holdBillingIssue(dbs.service, AGENCY)).toBe('pause');
    const [a] = await dbs.owner.select({ s: agency.suspendedAt }).from(agency).where(eq(agency.id, AGENCY));
    expect(a!.s).not.toBeNull();
  });

  it('an agency subscription failure is reported as kind agency', async () => {
    gw.failCollectionFor('sub_platform');
    expect((await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 's')).failed).toEqual([{ kind: 'agency' }]);
  });

  it('retry after failure clears the issue', async () => {
    await seedClients();
    await hold(true);
    gw.failCollectionFor('sub_c2');
    await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 'staff-1');
    gw.clearCollectionFailures();
    expect((await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 'staff-1')).failed).toEqual([]);
    expect(await holdBillingIssue(dbs.service, AGENCY)).toBeNull();
  });

  it('resume mirrors pause; a failed resume on a lifted agency is issue resume', async () => {
    await seedClients();
    await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 's');
    expect(gw.pausedCollection.size).toBe(3);
    await applyHoldCollection(dbs.service, gw, AGENCY, 'resume', 's');
    expect(gw.pausedCollection.size).toBe(0);
    expect(gw.callsTo('resumeCollection').map((c) => c.args)).toContainEqual(['sub_c1', { stripeAccount: ACCT }]);
    gw.failCollectionFor('sub_c1');
    await applyHoldCollection(dbs.service, gw, AGENCY, 'resume', 's');
    expect(await holdBillingIssue(dbs.service, AGENCY)).toBe('resume');
  });

  it('no gateway: ok event, nothing called', async () => {
    await seedClients();
    expect(await applyHoldCollection(dbs.service, null, AGENCY, 'pause', 's')).toEqual({ done: 0, failed: [] });
    expect(gw.calls).toHaveLength(0);
    expect((await events())[0]).toMatchObject({ reason: 'admin_hold_billing_ok' });
  });

  it('an agency with no billing row records the event in state pilot', async () => {
    await dbs.owner.delete(agencyBilling);
    await applyHoldCollection(dbs.service, gw, AGENCY, 'pause', 's');
    expect((await events())[0]).toMatchObject({ fromState: 'pilot', toState: 'pilot' });
  });
});

describe('holdBillingIssue', () => {
  it('is null with no attempt on record', async () => {
    expect(await holdBillingIssue(dbs.service, AGENCY)).toBeNull();
  });
});

describe('pauseIfHeld', () => {
  it('does nothing for an unheld agency', async () => {
    await pauseIfHeld(dbs.service, gw, AGENCY, 'sub_platform');
    expect(gw.callsTo('pauseCollection')).toHaveLength(0);
    expect(await events()).toHaveLength(0);
  });

  it('pauses for a held agency, passing the connected account', async () => {
    await hold(true);
    csub('sub_x');
    await pauseIfHeld(dbs.service, gw, AGENCY, 'sub_x', { stripeAccount: ACCT });
    expect(gw.callsTo('pauseCollection')[0]!.args).toEqual(['sub_x', { stripeAccount: ACCT }]);
  });

  it('a failure writes the _failed event and does not throw', async () => {
    await hold(true);
    gw.failCollectionFor('sub_platform');
    await expect(pauseIfHeld(dbs.service, gw, AGENCY, 'sub_platform')).resolves.toBeUndefined();
    expect(await holdBillingIssue(dbs.service, AGENCY)).toBe('pause');
  });
});
