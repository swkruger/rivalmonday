import { PLAN_FEATURES, type PlanFeature } from '@cs/core';
import { agencyBilling, type Db, plan } from '@cs/db';
import { eq } from 'drizzle-orm';

const ALL: readonly PlanFeature[] = PLAN_FEATURES;

/**
 * 7a2 D13: the channels the agency's platform plan includes. Service role only (`app_user` has no grant on
 * `plan`/`agency_billing`). No billing row, no plan or a pilot ⇒ every plan feature (decision 1).
 */
export async function planFeaturesFor(service: Db, agencyId: string): Promise<PlanFeature[]> {
  const [row] = await service
    .select({ state: agencyBilling.state, planId: agencyBilling.planId, features: plan.features })
    .from(agencyBilling)
    .leftJoin(plan, eq(plan.id, agencyBilling.planId))
    .where(eq(agencyBilling.agencyId, agencyId));
  if (!row || row.planId === null || row.state === 'pilot') return [...ALL];
  const raw: unknown = row.features;
  return Array.isArray(raw) ? ALL.filter((f) => raw.includes(f)) : [];
}
