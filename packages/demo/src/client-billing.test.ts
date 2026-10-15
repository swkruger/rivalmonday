import { agency, agencyConnect, client, clientBilling } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_BILLING_AGENCIES, seedBilling } from './billing';
import { DEMO_AUTO_PAUSE_DAYS, DEMO_DEFAULT_PRICE_CENTS, seedClientBilling } from './client-billing';
import { createSeedContext, type SeedContext } from './context';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

async function seedAll() {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date('2026-10-14T12:00:00Z'), salt: TEST_SALT });
  await seedTenancy(ctx);
  await seedBilling(ctx);
  await seedClientBilling(ctx);
}
beforeAll(seedAll);

describe('seedClientBilling', () => {
  it('connects the main demo agency and the 9a active agency with a $199 default and 14-day auto-pause', async () => {
    const rows = await dbs.owner.select({ agencyId: agencyConnect.agencyId, name: agency.name, c: agencyConnect }).from(agencyConnect).innerJoin(agency, eq(agency.id, agencyConnect.agencyId));
    expect(rows.map((r) => r.agencyId).sort()).toEqual([ctx.ids.agencyId, ...rows.filter((r) => r.name === DEMO_BILLING_AGENCIES.active).map((r) => r.agencyId)].sort());
    expect(rows).toHaveLength(2);
    for (const { c } of rows) {
      expect(c).toMatchObject({ status: 'connected', chargesEnabled: true, defaultPriceCents: DEMO_DEFAULT_PRICE_CENTS, autoPauseAfterDays: DEMO_AUTO_PAUSE_DAYS });
      expect(c.stripeAccountId).toMatch(/^acct_demo_/);
    }
  });

  it('seeds 3 paying, 1 payment needed and 1 paused client; paying clients carry a billed price and last_paid_at', async () => {
    const rows = await dbs.owner.select({ b: clientBilling, pausedAt: client.pausedAt, pausedBy: client.pausedBy }).from(clientBilling).innerJoin(client, eq(client.id, clientBilling.clientId));
    const paying = rows.filter((r) => r.b.state === 'active');
    expect(paying).toHaveLength(3);
    for (const r of paying) {
      expect(r.b.billedPriceCents).toBeGreaterThan(0);
      expect(r.b.lastPaidAt).toBeInstanceOf(Date);
      expect(r.pausedAt).toBeNull();
    }
    const needed = rows.filter((r) => r.b.state === 'payment_needed' && !r.pausedAt);
    expect(needed).toHaveLength(1);
    expect(needed[0]!.b.clientId).toBe(ctx.ids.clients.brazos);
    expect(needed[0]!.b.paymentFailedSince!.getTime()).toBeLessThan(ctx.clock.now.getTime());
    const paused = rows.filter((r) => r.pausedAt);
    expect(paused).toHaveLength(1);
    expect(paused[0]!.pausedBy).toBe('auto');
  });

  it('is repeatable after a reset: same rows, no duplicates', async () => {
    const before = (await dbs.owner.select({ s: clientBilling.state }).from(clientBilling)).map((r) => r.s).sort();
    await seedAll();
    const after = (await dbs.owner.select({ s: clientBilling.state }).from(clientBilling)).map((r) => r.s).sort();
    expect(after).toEqual(before);
    expect(after).toHaveLength(5);
  });
});
