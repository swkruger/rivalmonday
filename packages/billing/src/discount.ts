import { type Db, type Tx, agencyBilling } from '@cs/db';
import { and, eq, ne, sql } from 'drizzle-orm';

/**
 * 7b2: agencies holding this coupon (`agency_billing.attached_coupon_id`), excluding `exceptAgencyId` (the redeeming
 * agency, so re-redeeming its own code does not count against it). `agency_id` is the row key: one row = one agency.
 */
export async function discountRedemptions(db: Db | Tx, couponId: string, exceptAgencyId?: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agencyBilling)
    .where(and(eq(agencyBilling.attachedCouponId, couponId), exceptAgencyId ? ne(agencyBilling.agencyId, exceptAgencyId) : undefined));
  return r?.n ?? 0;
}

/** `discount_code.max_redemptions` NULL = unlimited. */
export const discountExhausted = (maxRedemptions: number | null, used: number): boolean => maxRedemptions !== null && used >= maxRedemptions;
