import { agencyBilling, agencyBillingEvent, billingNotice } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGateway } from './fake-gateway';
import { AGENCY, resetBilling } from './test-util';
import { startAgencyTrial } from './trial';

afterEach(() => vi.restoreAllMocks());
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
});

const now = new Date('2026-10-14T00:00:00Z');

describe('startAgencyTrial', () => {
  it('starts a trial: customer, trial_ends_at from plan.trial_days, coupon, event and notice', async () => {
    const gw = fakeGateway();
    const row = await startAgencyTrial(dbs.service, gw, AGENCY, { offer: 'trial', couponId: 'co_1', now });
    expect(row).toMatchObject({ state: 'trialing', planId, attachedCouponId: 'co_1', trialEndsAt: new Date('2026-11-13T00:00:00Z'), pilotEndsAt: null });
    expect(row.stripeCustomerId).toMatch(/^cus_/);
    expect(gw.callsTo('createCustomer')[0]!.args[0]).toMatchObject({ agencyId: AGENCY, name: 'Agency A' });
    const [ev] = await dbs.owner.select().from(agencyBillingEvent);
    expect(ev).toMatchObject({ fromState: null, toState: 'trialing' });
    const [n] = await dbs.owner.select().from(billingNotice);
    expect(n).toMatchObject({ kind: 'billing_trialing', dedupeKey: `transition:${ev!.id}` });
  });

  it('starts a pilot with pilot_ends_at', async () => {
    const endsAt = new Date('2027-01-01T00:00:00Z');
    const row = await startAgencyTrial(dbs.service, fakeGateway(), AGENCY, { offer: 'pilot', pilotEndsAt: endsAt, now });
    expect(row).toMatchObject({ state: 'pilot', pilotEndsAt: endsAt, trialEndsAt: null });
    expect((await dbs.owner.select().from(billingNotice))[0]!.kind).toBe('billing_pilot');
  });

  it('is idempotent: an existing row is returned unchanged with no new writes or gateway calls', async () => {
    const gw = fakeGateway();
    const first = await startAgencyTrial(dbs.service, gw, AGENCY, { offer: 'trial', now });
    const again = await startAgencyTrial(dbs.service, gw, AGENCY, { offer: 'pilot', now });
    expect(again).toEqual(first);
    expect(gw.callsTo('createCustomer')).toHaveLength(1);
    expect(await dbs.owner.select().from(agencyBillingEvent)).toHaveLength(1);
    expect(await dbs.owner.select().from(billingNotice)).toHaveLength(1);
  });

  it('still creates the row (customer null) when the gateway fails', async () => {
    const gw = fakeGateway();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    gw.failNext();
    const row = await startAgencyTrial(dbs.service, gw, AGENCY, { offer: 'trial', now });
    expect(log).toHaveBeenCalledOnce();
    expect(row).toMatchObject({ state: 'trialing', stripeCustomerId: null });
    expect(await dbs.owner.select().from(agencyBilling)).toHaveLength(1);
  });
});
