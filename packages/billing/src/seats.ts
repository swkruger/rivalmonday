import { type Db, agencyBilling } from '@cs/db';
import { eq } from 'drizzle-orm';
import { countActiveClients, planFor } from './access';
import type { BillingGateway } from './types';

/**
 * Push `max(0, active - included)` to the subscription's seat line. Increase prorates now; decrease takes effect at
 * renewal. Gateway failure marks `seat_sync_pending` (the daily job retries) and never throws.
 */
export async function syncSeats(db: Db, gw: BillingGateway, agencyId: string): Promise<'synced' | 'skipped' | 'pending'> {
  const [row] = await db.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  if (!row?.stripeSubscriptionId || row.state === 'pilot') return 'skipped';
  const [p, active] = await Promise.all([planFor(db, row), countActiveClients(db, agencyId)]);
  const qty = Math.max(0, active - (p?.includedSeats ?? 0));
  const synced = row.billableSeatsSynced ?? 0;
  try {
    if (qty !== synced) await gw.updateSeatQuantity(row.stripeSubscriptionId, qty, { prorate: qty > synced, seatPriceId: p?.stripeSeatPriceId ?? null });
  } catch {
    console.error('[billing] seat sync failed', { agencyId });
    await db.update(agencyBilling).set({ seatSyncPending: true, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, agencyId));
    return 'pending';
  }
  await db.update(agencyBilling).set({ billableSeatsSynced: qty, seatSyncPending: false, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, agencyId));
  return 'synced';
}
