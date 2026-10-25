import { agencyBilling } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { discountExhausted, discountRedemptions } from './discount';
import { resetBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
});

const hold = (agencyId: string, attachedCouponId: string | null) =>
  dbs.owner.insert(agencyBilling).values({ agencyId, state: 'trialing', planId, attachedCouponId });

describe('discountRedemptions', () => {
  it('counts the agencies holding the coupon', async () => {
    await hold(IDS.agencyA, 'co_1');
    await hold(IDS.agencyB, 'co_1');
    expect(await discountRedemptions(dbs.service, 'co_1')).toBe(2);
    expect(await discountRedemptions(dbs.service, 'co_other')).toBe(0);
  });

  it('excludes exceptAgencyId', async () => {
    await hold(IDS.agencyA, 'co_1');
    await hold(IDS.agencyB, 'co_1');
    expect(await discountRedemptions(dbs.service, 'co_1', IDS.agencyA)).toBe(1);
  });

  it('works inside a transaction', async () => {
    await hold(IDS.agencyA, 'co_1');
    expect(await dbs.service.transaction((tx) => discountRedemptions(tx, 'co_1'))).toBe(1);
  });
});

describe('discountExhausted', () => {
  it('null max is unlimited; used >= max is exhausted', () => {
    expect(discountExhausted(null, 99)).toBe(false);
    expect(discountExhausted(2, 2)).toBe(true);
    expect(discountExhausted(2, 1)).toBe(false);
  });
});
