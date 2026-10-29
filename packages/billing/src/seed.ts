import { agencyBilling, plan } from '@cs/db';
import { type BillingDb, currentStandardPlan } from './access';

/** Seed helper (E2E, demo; 17a: the sample agency, inside its creating transaction): make `agencyId` an exempt pilot on the current standard plan (inserted if a truncate removed it). Idempotent. */
export async function ensureExemptPilot(db: BillingDb, agencyId: string): Promise<void> {
  let p = await currentStandardPlan(db);
  if (!p) {
    [p] = await db.insert(plan).values({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'seed' }).onConflictDoNothing().returning();
    p ??= (await currentStandardPlan(db))!;
  }
  await db.insert(agencyBilling).values({ agencyId, state: 'pilot', planId: p.id, seatCapExempt: true }).onConflictDoNothing();
}
