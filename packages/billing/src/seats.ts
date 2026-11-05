import { type Db, agencyBilling } from '@cs/db';
import { eq } from 'drizzle-orm';
import { countActiveClients, isOnHold, planFor } from './access';
import type { BillingGateway } from './types';

export interface SyncSeatsOptions {
  /**
   * Yearly only: also lower the Stripe quantity. Set by the daily job from `yearlyDecreaseMode`: `'at_renewal'` (just
   * before renewal, proration none) or `'with_credit'` (a renewal already passed at the old quantity: credit the unused
   * part now). Every other caller leaves yearly decreases held back.
   */
  yearlyDecrease?: 'at_renewal' | 'with_credit';
}

/**
 * Push `max(0, active - included)` to the subscription's seat line. `billable_seats_synced` always mirrors the quantity
 * on the Stripe subscription (= the seats the agency has paid for).
 *
 * - Monthly: an increase prorates on the next invoice; a decrease takes effect at renewal (proration none).
 * - Yearly (final fix I4, spec D6 "removals take effect at renewal"): an increase above the paid quantity is prorated
 *   and invoiced now; an increase up to it is free (no Stripe call). A decrease never touches Stripe mid-term: it
 *   returns `'deferred'` with `seat_sync_pending = false` (nothing failed, nothing to retry) and records the first
 *   deferral time in `seat_decrease_deferred_at`. The daily job applies it within 7 days before renewal (proration none)
 *   or, if a renewal passed first, with a credit (`yearlyDecreaseMode`). So pausing then resuming a client never
 *   double-charges. Any sync that leaves Stripe at the wanted quantity clears the deferral.
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
  const deferred = yearly && qty < synced && !opts.yearlyDecrease;
  try {
    if (qty !== synced && !deferred) {
      const increase = qty > synced;
      const credit = yearly && !increase && opts.yearlyDecrease === 'with_credit';
      await gw.updateSeatQuantity(row.stripeSubscriptionId, qty, {
        prorate: increase || credit,
        seatPriceId: (yearly ? p?.stripeSeatPriceYearId : p?.stripeSeatPriceId) ?? null,
        invoiceNow: yearly && (increase || credit),
      });
    }
  } catch {
    console.error('[billing] seat sync failed', { agencyId });
    await db.update(agencyBilling).set({ seatSyncPending: true, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, agencyId));
    return 'pending';
  }
  const stored = deferred ? synced : qty;
  const now = new Date();
  await db.update(agencyBilling).set({
    billableSeatsSynced: stored,
    seatSyncPending: false,
    seatDecreaseDeferredAt: deferred ? (row.seatDecreaseDeferredAt ?? now) : null,
    updatedAt: now,
  }).where(eq(agencyBilling.agencyId, agencyId));
  return deferred ? 'deferred' : 'synced';
}

const RENEWAL_LEAD_MS = 7 * 86_400_000;

/**
 * Which way, if any, the daily job applies a held-back yearly seat decrease: `'at_renewal'` within 7 days before
 * `currentPeriodEnd` (or past it, if Stripe has not rolled the period yet; proration none); `'with_credit'` when the
 * deferral predates the current period (the renewal already happened at the old quantity); otherwise `null`.
 */
export function yearlyDecreaseMode(
  sub: { currentPeriodStart?: Date | null; currentPeriodEnd: Date | null },
  deferredAt: Date | null, now: Date,
): 'at_renewal' | 'with_credit' | null {
  if (!deferredAt) return null;
  if (sub.currentPeriodStart && deferredAt < sub.currentPeriodStart) return 'with_credit';
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() - now.getTime() <= RENEWAL_LEAD_MS) return 'at_renewal';
  return null;
}
