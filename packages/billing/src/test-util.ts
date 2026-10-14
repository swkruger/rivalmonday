import { type Db, agencyBilling, client, plan } from '@cs/db';
import { IDS, seedTenancy, truncateAll } from '@cs/db/test-helpers';

export const STD_PLAN = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
export const AGENCY = IDS.agencyA;

/** Reset the test DB: tenancy (agency A has 2 active clients) + the current standard plan. Returns the plan id. */
export async function resetBilling(owner: Db): Promise<string> {
  await truncateAll(owner);
  await seedTenancy(owner);
  const [p] = await owner.insert(plan).values(STD_PLAN).returning({ id: plan.id });
  return p!.id;
}

/** Add `n` clients to agency A with the given status. */
export async function addClients(owner: Db, n: number, status: 'active' | 'prospect' = 'active'): Promise<string[]> {
  const rows = await owner
    .insert(client)
    .values(Array.from({ length: n }, (_, i) => ({ agencyId: AGENCY, name: `Extra ${status} ${i}`, verticalId: 'hvac_plumbing', status })))
    .returning({ id: client.id });
  return rows.map((r) => r.id);
}

export const setBilling = (owner: Db, planId: string, v: Partial<typeof agencyBilling.$inferInsert>) =>
  owner.insert(agencyBilling).values({ agencyId: AGENCY, state: 'trialing', planId, ...v });
