import { type Db, type PlanRow, type Tx, plan } from '@cs/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { BillingGateway } from './types';

/**
 * Create the Stripe prices for one plan version (P3/R8). Idempotent: a plan that already has both price ids is returned
 * unchanged. The base and seat products are created once per plan `code` and reused by every later version.
 */
export async function syncPlanToStripe(db: Db | Tx, gw: BillingGateway, planId: string): Promise<PlanRow> {
  const [p] = await db.select().from(plan).where(eq(plan.id, planId));
  if (!p) throw new Error(`plan not found: ${planId}`);
  const yearlyDone = p.basePriceYearCents == null || (p.stripeBasePriceYearId && p.stripeSeatPriceYearId);
  if (p.stripeBasePriceId && p.stripeSeatPriceId && yearlyDone) return p;

  const siblings = await db.select().from(plan).where(and(eq(plan.code, p.code), isNotNull(plan.stripeProductId)));
  const stripeProductId = p.stripeProductId ?? siblings.find((s) => s.stripeProductId)?.stripeProductId ?? null;
  const stripeSeatProductId = p.stripeSeatProductId ?? siblings.find((s) => s.stripeSeatProductId)?.stripeSeatProductId ?? null;

  const ids = await gw.createPrices({
    code: p.code,
    version: p.version,
    name: p.name,
    basePriceCents: p.basePriceCents,
    seatTiers: p.seatTiers,
    basePriceYearCents: p.basePriceYearCents,
    stripeProductId,
    stripeSeatProductId,
  });
  const [updated] = await db
    .update(plan)
    .set({ stripeProductId: ids.baseProductId, stripeSeatProductId: ids.seatProductId, stripeBasePriceId: ids.basePriceId, stripeSeatPriceId: ids.seatPriceId, stripeBasePriceYearId: ids.basePriceYearId, stripeSeatPriceYearId: ids.seatPriceYearId })
    .where(eq(plan.id, planId))
    .returning();
  return updated!;
}
