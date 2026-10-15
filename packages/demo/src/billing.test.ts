import { agency, agencyBilling, agencyBillingEvent, client, discountCode } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_BILLING_AGENCIES, DEMO_DISCOUNT_CODE, seedBilling } from './billing';
import { DAY } from './clock';
import { createSeedContext, type SeedContext } from './context';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date('2026-10-14T12:00:00Z'), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedBilling(ctx);
});

async function billingOf(name: string) {
  const [row] = await dbs.owner.select({ b: agencyBilling, id: agency.id }).from(agency).innerJoin(agencyBilling, eq(agencyBilling.agencyId, agency.id)).where(eq(agency.name, name));
  return row!;
}

describe('seedBilling', () => {
  it('seeds an active agency with 4 active clients, fake Stripe ids and an attached discount', async () => {
    const { b, id } = await billingOf(DEMO_BILLING_AGENCIES.active);
    expect(b.state).toBe('active');
    expect(b.stripeCustomerId).toBeTruthy();
    expect(b.stripeSubscriptionId).toBeTruthy();
    expect(b.billableSeatsSynced).toBe(1);
    const clients = await dbs.owner.select().from(client).where(and(eq(client.agencyId, id), eq(client.status, 'active')));
    expect(clients).toHaveLength(4);
    const [code] = await dbs.owner.select().from(discountCode).where(eq(discountCode.code, DEMO_DISCOUNT_CODE));
    expect(code!.stripeCouponId).toBe(b.attachedCouponId);
  });

  it('seeds a trial with 9 days left and a past-due agency overdue by 2 days, relative to the seed clock', async () => {
    const trial = (await billingOf(DEMO_BILLING_AGENCIES.trialing)).b;
    expect(trial.state).toBe('trialing');
    expect(trial.trialEndsAt!.getTime()).toBe(ctx.clock.now.getTime() + 9 * DAY);
    const pd = (await billingOf(DEMO_BILLING_AGENCIES.pastDue)).b;
    expect(pd.state).toBe('past_due');
    expect(pd.pastDueSince!.getTime()).toBe(ctx.clock.now.getTime() - 2 * DAY);
  });

  it('writes billing history for the console panel and leaves the main demo agency a pilot', async () => {
    const { id } = await billingOf(DEMO_BILLING_AGENCIES.pastDue);
    const events = await dbs.owner.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, id));
    expect(events.map((e) => e.toState).sort()).toEqual(['active', 'past_due', 'trialing']);
    expect((await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, ctx.ids.agencyId)))[0]!.state).toBe('pilot');
  });
});
