import { z } from 'zod';
import type { SeatTier } from '@cs/db';

export type { SeatTier };
export type BillingInterval = 'month' | 'year';

/** `upTo` = cumulative EXTRA clients; 1–5 tiers, ascending, only the last is null. */
export const seatTiersSchema: z.ZodType<SeatTier[]> = z
  .array(z.object({ upTo: z.number().int().positive().nullable(), unitCents: z.number().int().min(0).max(10_000_000) }))
  .min(1)
  .max(5)
  .superRefine((tiers, ctx) => {
    tiers.forEach((t, i) => {
      const last = i === tiers.length - 1;
      if (last !== (t.upTo === null)) ctx.addIssue({ code: 'custom', message: 'Only the last tier has no upper limit.', path: [i, 'upTo'] });
      const prev = i > 0 ? tiers[i - 1]!.upTo : 0;
      if (t.upTo !== null && prev !== null && t.upTo <= prev) ctx.addIssue({ code: 'custom', message: 'Tier limits must ascend.', path: [i, 'upTo'] });
    });
  });

/** Graduated monthly cost of `extraSeats` clients beyond the included ones. */
export function seatCents(tiers: SeatTier[], extraSeats: number): number {
  let prev = 0;
  let total = 0;
  for (const t of tiers) {
    const cap = t.upTo ?? Infinity;
    const n = Math.max(0, Math.min(extraSeats, cap) - prev);
    total += n * t.unitCents;
    prev = cap;
    if (extraSeats <= cap) break;
  }
  return total;
}

export function planCents(
  p: { basePriceCents: number; basePriceYearCents: number | null; includedSeats: number; seatTiers: SeatTier[] },
  activeClients: number,
  interval: BillingInterval,
): number {
  const extra = Math.max(0, activeClients - p.includedSeats);
  const seats = seatCents(p.seatTiers, extra);
  if (interval === 'month') return p.basePriceCents + seats;
  if (p.basePriceYearCents == null) throw new Error('This plan has no yearly price.');
  return p.basePriceYearCents + 12 * seats;
}

export function monthlyEquivalentCents(cents: number, interval: BillingInterval): number {
  return interval === 'year' ? Math.round(cents / 12) : cents;
}

export function describeTiers(includedSeats: number, tiers: SeatTier[]): { fromClient: number; toClient: number | null; unitCents: number }[] {
  let prev = 0;
  return tiers.map((t) => {
    const row = { fromClient: includedSeats + prev + 1, toClient: t.upTo === null ? null : includedSeats + t.upTo, unitCents: t.unitCents };
    prev = t.upTo ?? prev;
    return row;
  });
}

/** Standard plan v2 (graduated extra-client pricing, yearly base). */
export const STANDARD_V2 = {
  code: 'standard',
  version: 2,
  name: 'Standard',
  basePriceCents: 22900,
  basePriceYearCents: 229000,
  includedSeats: 3,
  seatTiers: [
    { upTo: 7, unitCents: 7900 },
    { upTo: null, unitCents: 5900 },
  ] as SeatTier[],
  trialDays: 30,
  features: ['ask', 'mcp'] as ('ask' | 'mcp')[],
  isCurrent: true,
  createdBy: 'seed',
};
