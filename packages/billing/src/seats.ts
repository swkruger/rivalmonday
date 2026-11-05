import { type Db, agencyBilling } from '@cs/db';
import { eq } from 'drizzle-orm';
import { countActiveClients, isOnHold, planFor } from './access';
import type { BillingGateway } from './types';

export interface SyncSeatsOptions {
  /**
   * Yearly only: also lower the Stripe quantity (proration none). Set by the daily job inside the renewal window
   * (`inYearlyRenewalWindow`); every other caller leaves yearly decreases for renewal.
   */
  applyYearlyDecrease?: boolean;
}

/**
 * Push `max(0, active - included)` to the subscription's seat line. `billable_seats_synced` always mirrors the quantity
 * on the Stripe subscription (= the seats the agency has paid for).
 *
 * - Monthly: an increase prorates on the next invoice; a decrease takes effect at renewal (proration none).
 * - Yearly (final fix I4, spec D6 "removals take effect at renewal"): an increase above the paid quantity is prorated
 *   and invoiced now; an increase up to it is free (no Stripe call). A decrease never touches Stripe mid-term: it
 *   returns `'deferred'` with `seat_sync_pending = false` (nothing failed, nothing to retry) and the daily job applies it
 *   in the renewal window (`applyYearlyDecrease`). So pausing then resuming a client never double-charges.
 *
 * Gateway failure marks `seat_sync_pending` (the daily job retries) and never throws.
 */
export async function syncSeats(
  db: Db, gw: BillingGateway, agencyId: string, opts: SyncSeatsOptions = {},
): Promise<'synced' | 'deferred' | 'skipped' | 'pending'> {
  if (await isOnHold(db, agencyId)) return 'skipped'; // 15c-3a: a held agency's billing work is frozen
  const [row] = await db.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId));
  if (!row?.stripeSubscriptionId || row.state === 'pilot') return 'skipped';
  const [p, active] = await Promise.all([planFor(db, row), countActiveClients(db, agencyId)]);
  const qty = Math.max(0, active - (p?.includedSeats ?? 0));
  const synced = row.billableSeatsSynced ?? 0;
  const yearly = row.billingInterval === 'year';
  const deferred = yearly && qty < synced && !opts.applyYearlyDecrease;
  try {
    if (qty !== synced && !deferred) {
      const increase = qty > synced;
      await gw.updateSeatQuantity(row.stripeSubscriptionId, qty, {
        prorate: increase,
        seatPriceId: (yearly ? p?.stripeSeatPriceYearId : p?.stripeSeatPriceId) ?? null,
        invoiceNow: yearly && increase,
      });
    }
  } catch {
    console.error('[billing] seat sync failed', { agencyId });
    await db.update(agencyBilling).set({ seatSyncPending: true, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, agencyId));
    return 'pending';
  }
  const stored = deferred ? synced : qty;
  await db.update(agencyBilling).set({ billableSeatsSynced: stored, seatSyncPending: false, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, agencyId));
  return deferred ? 'deferred' : 'synced';
}

const RENEWAL_WINDOW_MS = 86_400_000;

/**
 * Yearly renewal window for applying a deferred seat decrease: the last 24 h before `currentPeriodEnd` (or past it, if
 * Stripe has not rolled the period yet), or the first 24 h after a renewal (`currentPeriodStart`), so one missed daily
 * run still lowers the quantity for the new year.
 */
export function inYearlyRenewalWindow(sub: { currentPeriodStart?: Date | null; currentPeriodEnd: Date | null }, now: Date): boolean {
  const t = now.getTime();
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() - t <= RENEWAL_WINDOW_MS) return true;
  return !!sub.currentPeriodStart && t >= sub.currentPeriodStart.getTime() && t - sub.currentPeriodStart.getTime() <= RENEWAL_WINDOW_MS;
}
