import { formatMoney } from '@/lib/format';

export interface PlanTier { fromClient: number; toClient: number | null; unitCents: number }
const money = (c: number) => formatMoney(c, { unit: 'cents' });

/** "$229/mo · 3 clients included · clients 4–10: $79 each · clients 11+: $59 each". Yearly: "$2,290/yr" replaces the first part. */
export function planLine(plan: { basePriceCents: number; basePriceYearCents: number | null; includedSeats: number }, tiers: PlanTier[], interval: 'month' | 'year'): string {
  const base =
    interval === 'year' && plan.basePriceYearCents !== null ? `${money(plan.basePriceYearCents)}/yr`
    : `${money(plan.basePriceCents)}/mo`;
  const included = `${plan.includedSeats} ${plan.includedSeats === 1 ? 'client' : 'clients'} included`;
  // A one-client tier reads "clients 4", like the plan-change email.
  const range = (t: PlanTier) => (t.toClient === null ? `${t.fromClient}+` : t.toClient === t.fromClient ? `${t.fromClient}` : `${t.fromClient}–${t.toClient}`);
  const rows = tiers.map((t) => `clients ${range(t)}: ${money(t.unitCents)} each`);
  return [base, included, ...rows].join(' · ');
}

/** "(2 months free)" only when the yearly base is at most ten months of the monthly one. */
export const twoMonthsFree = (plan: { basePriceCents: number; basePriceYearCents: number | null }) => plan.basePriceYearCents !== null && plan.basePriceYearCents <= 10 * plan.basePriceCents;
