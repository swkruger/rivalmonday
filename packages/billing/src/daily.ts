import { type AgencyBillingRow, type Db, type PlanRow, agency, agencyBilling, agencyDailyStat, billingNotice } from '@cs/db';
import { and, eq } from 'drizzle-orm';
import { planFor } from './access';
import { applyBillingSignal } from './apply';
import { syncSeats } from './seats';
import type { BillingSignal } from './state';
import type { BillingGateway } from './types';
import { signalForSubscription } from './webhook';

export interface BillingDailyResult {
  transitions: number;
  reminders: number;
  seatRetries: number;
  drift: number;
}

const ACTOR = 'job';
const DAY_MS = 86_400_000;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
/** Whole UTC calendar days from `now` to `end` (positive = in the future). */
const daysUntil = (end: Date, now: Date) => Math.floor(end.getTime() / DAY_MS) - Math.floor(now.getTime() / DAY_MS);

const apply = (db: Db, agencyId: string, signal: BillingSignal) => db.transaction((tx) => applyBillingSignal(tx, agencyId, signal, ACTOR));
const load = async (db: Db, agencyId: string): Promise<AgencyBillingRow | null> =>
  (await db.select().from(agencyBilling).where(eq(agencyBilling.agencyId, agencyId)))[0] ?? null;

/** Reminder kind + target end date for a row today, if any (exactly 7 / 1 days before trial end, 7 before pilot end). */
function reminderFor(row: AgencyBillingRow, now: Date): { kind: string; end: Date } | null {
  if (row.state === 'trialing' && row.trialEndsAt) {
    const d = daysUntil(row.trialEndsAt, now);
    if (d === 7) return { kind: 'reminder_trial_ending_7', end: row.trialEndsAt };
    if (d === 1) return { kind: 'reminder_trial_ending_1', end: row.trialEndsAt };
  }
  if (row.state === 'pilot' && row.pilotEndsAt && daysUntil(row.pilotEndsAt, now) === 7) return { kind: 'reminder_pilot_ending_7', end: row.pilotEndsAt };
  return null;
}

/** States whose subscription still bills: paying states, or cancelled before `cancel_at`. */
const isPaying = (row: AgencyBillingRow, now: Date) =>
  row.state === 'active' || row.state === 'past_due' || (row.state === 'cancelled' && !!row.cancelAt && row.cancelAt > now);

async function reconcile(db: Db, gw: BillingGateway, row: AgencyBillingRow, now: Date): Promise<number> {
  let drift = 0;
  const sub = await gw.getSubscription(row.stripeSubscriptionId!);
  const signal = signalForSubscription(
    { status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, cancelAt: sub.cancelAtPeriodEnd ? sub.currentPeriodEnd : null, hasPaymentMethod: sub.hasDefaultPaymentMethod },
    now,
  );
  if (signal && (await apply(db, row.agencyId, signal)).changed) drift++;
  if (signal?.kind === 'subscription_ended') return drift; // R26: the id is now forgotten; nothing to sync seats against
  if (sub.seatQuantity !== (row.billableSeatsSynced ?? 0)) {
    // Stripe wins for the recorded quantity; syncSeats then pushes our active-client count if it differs.
    await db.update(agencyBilling).set({ billableSeatsSynced: sub.seatQuantity, updatedAt: new Date() }).where(eq(agencyBilling.agencyId, row.agencyId));
    drift++;
    await syncSeats(db, gw, row.agencyId);
  }
  return drift;
}

async function mrrFor(gw: BillingGateway | null, row: AgencyBillingRow, p: PlanRow | null, paidSeats: number): Promise<number> {
  if (!p) return 0;
  let discount = 0;
  if (gw && row.stripeSubscriptionId) {
    try {
      discount = (await gw.upcomingInvoice(row.stripeSubscriptionId))?.discountCents ?? 0;
    } catch {
      discount = 0; // no discount knowledge: report list price rather than fail the stat
    }
  }
  return Math.max(0, p.basePriceCents + paidSeats * p.seatPriceCents - discount);
}

const logFailure = (step: string, agencyId: string, e: unknown) =>
  console.error(`[billing-daily] ${step} failed`, { agencyId, error: e instanceof Error ? e.name : 'Error' });

/**
 * Daily billing maintenance (R14): per agency, in its own try/catch - seat-sync retry, Stripe reconciliation, timers,
 * reminders, then the billing columns of yesterday's `agency_daily_stat` row (update only; never inserts). A failing
 * Stripe step (retry/reconcile) is logged and skipped so the timers still run (R28). `gw === null` (billing not
 * configured, R27): the Stripe steps and the upcoming-invoice discount are skipped.
 */
export async function runBillingDaily(db: Db, gw: BillingGateway | null, now: Date): Promise<BillingDailyResult> {
  const result: BillingDailyResult = { transitions: 0, reminders: 0, seatRetries: 0, drift: 0 };
  const yesterday = utcDay(new Date(now.getTime() - DAY_MS));
  let missingStats = 0;
  const agencies = await db.select({ id: agency.id }).from(agency);

  for (const { id: agencyId } of agencies) {
    try {
      let row = await load(db, agencyId);
      if (gw && row?.seatSyncPending) {
        result.seatRetries++;
        await syncSeats(db, gw, agencyId);
        row = await load(db, agencyId);
      }
      if (gw && row?.stripeSubscriptionId) {
        try {
          result.drift += await reconcile(db, gw, row, now);
        } catch (e) {
          logFailure('reconcile', agencyId, e);
        }
        row = await load(db, agencyId);
      }
      if (row) {
        const planRow = await planFor(db, row);
        if ((await apply(db, agencyId, { kind: 'timer', now, trialDays: planRow?.trialDays ?? 30 })).changed) result.transitions++;
        row = await load(db, agencyId);
      }
      const reminder = row && reminderFor(row, now);
      if (reminder) {
        const inserted = await db
          .insert(billingNotice)
          .values({
            agencyId,
            kind: reminder.kind,
            dedupeKey: `reminder:${agencyId}:${reminder.kind}:${utcDay(reminder.end)}`,
            params: { date: reminder.end.toISOString() },
          })
          .onConflictDoNothing()
          .returning({ id: billingNotice.id });
        result.reminders += inserted.length;
      }

      const paying = !!row && isPaying(row, now);
      const paidSeats = paying ? (row!.billableSeatsSynced ?? 0) : 0;
      const mrrCents = paying ? await mrrFor(gw, row!, await planFor(db, row), paidSeats) : 0;
      const updated = await db
        .update(agencyDailyStat)
        .set({ billingState: row?.state ?? 'pilot', paidSeats, mrrCents })
        .where(and(eq(agencyDailyStat.agencyId, agencyId), eq(agencyDailyStat.day, yesterday)))
        .returning({ day: agencyDailyStat.day });
      if (!updated.length) missingStats++;
    } catch (e) {
      logFailure('agency', agencyId, e);
    }
  }
  if (missingStats) console.warn(`[billing-daily] ${missingStats} agencies had no agency_daily_stat row for ${yesterday}`);
  return result;
}
