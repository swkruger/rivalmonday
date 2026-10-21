import { agencyBilling, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { planFeaturesFor } from './plan-features';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function planWith(features: ('ask' | 'mcp')[]): Promise<string> {
  const [p] = await dbs.owner.insert(plan).values({
    code: `p${features.join('')}`, version: 1, name: 'P', basePriceCents: 0, includedSeats: 3, seatPriceCents: 0, trialDays: 30, features, createdBy: 'test',
  }).returning({ id: plan.id });
  return p!.id;
}

describe('planFeaturesFor (7a2 D13)', () => {
  it('no billing row → both on', async () => {
    expect((await planFeaturesFor(dbs.service, IDS.agencyA)).sort()).toEqual(['ask', 'mcp']);
  });

  it('a billing row without a plan → both on', async () => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'trialing' });
    expect((await planFeaturesFor(dbs.service, IDS.agencyA)).sort()).toEqual(['ask', 'mcp']);
  });

  it('pilot state → both on even if plan omits them', async () => {
    const planId = await planWith([]);
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'pilot', planId });
    expect((await planFeaturesFor(dbs.service, IDS.agencyA)).sort()).toEqual(['ask', 'mcp']);
  });

  it("otherwise returns the plan's features", async () => {
    const askOnly = await planWith(['ask']);
    const none = await planWith([]);
    await dbs.owner.insert(agencyBilling).values([
      { agencyId: IDS.agencyA, state: 'active', planId: askOnly },
      { agencyId: IDS.agencyB, state: 'trialing', planId: none },
    ]);
    expect(await planFeaturesFor(dbs.service, IDS.agencyA)).toEqual(['ask']);
    expect(await planFeaturesFor(dbs.service, IDS.agencyB)).toEqual([]);
  });
});
