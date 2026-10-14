import { plan } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeGateway } from './fake-gateway';
import { syncPlanToStripe } from './plan-sync';
import { STD_PLAN, resetBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
});

describe('syncPlanToStripe', () => {
  it('creates products and prices once and stores the ids; a second call is a no-op', async () => {
    const gw = fakeGateway();
    const p = await syncPlanToStripe(dbs.service, gw, planId);
    expect(p.stripeProductId).toMatch(/^prod_base_fake/);
    expect(p.stripeSeatProductId).toMatch(/^prod_seat_fake/);
    expect(p.stripeBasePriceId).toMatch(/^price_base_fake/);
    expect(p.stripeSeatPriceId).toMatch(/^price_seat_fake/);
    const again = await syncPlanToStripe(dbs.service, gw, planId);
    expect(again).toEqual(p);
    expect(gw.callsTo('createPrices')).toHaveLength(1);
  });

  it('a second version reuses the products and gets its own two prices', async () => {
    const gw = fakeGateway();
    const v1 = await syncPlanToStripe(dbs.service, gw, planId);
    await dbs.owner.update(plan).set({ isCurrent: false }).where(eq(plan.id, planId));
    const [row] = await dbs.owner.insert(plan).values({ ...STD_PLAN, version: 2, basePriceCents: 25900 }).returning({ id: plan.id });
    const v2 = await syncPlanToStripe(dbs.service, gw, row!.id);
    expect(v2.stripeProductId).toBe(v1.stripeProductId);
    expect(v2.stripeSeatProductId).toBe(v1.stripeSeatProductId);
    expect(v2.stripeBasePriceId).not.toBe(v1.stripeBasePriceId);
    expect(v2.stripeSeatPriceId).not.toBe(v1.stripeSeatPriceId);
    const [, second] = gw.callsTo('createPrices');
    expect(second!.args[0]).toMatchObject({ version: 2, basePriceCents: 25900, stripeProductId: v1.stripeProductId, stripeSeatProductId: v1.stripeSeatProductId });
    const rows = await dbs.owner.select().from(plan).orderBy(asc(plan.version));
    expect(rows.every((r) => r.stripeBasePriceId && r.stripeSeatPriceId)).toBe(true);
  });

  it('throws for an unknown plan id', async () => {
    await expect(syncPlanToStripe(dbs.service, fakeGateway(), '00000000-0000-0000-0000-000000000000')).rejects.toThrow(/plan/i);
  });
});
