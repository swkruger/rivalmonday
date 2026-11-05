import { siteEnv } from '../src/lib/env';

/**
 * Single source of every number the site's copy shows (spec § 7.6). 17c's /pricing reuses it.
 * `agency` mirrors `STANDARD_V2` in packages/billing/src/pricing.ts (the site can't import it);
 * `pricing.test.ts` pins the values. `toClient` is the last client number in a tier (null = no upper limit).
 * Yearly Connect client billing doesn't exist, so no yearly price for the business plan (D8).
 */
export const PRICING = {
  agency: {
    pilot: 'free',
    monthlyUsd: 229,
    yearlyUsd: 2290,
    seatsIncluded: 3,
    extraClientTiers: [{ toClient: 10, usd: 79 }, { toClient: null, usd: 59 }],
    trialDays: 30,
  },
  business: { pilot: 'free', monthlyUsd: siteEnv.clientPriceUsd },
} as const;

type AgencyPricing = { seatsIncluded: number; extraClientTiers: readonly { toClient: number | null; usd: number }[] };

/** Clients beyond the included ones, grouped by the tier they fall in. Empty when none are extra. */
export function agencyCostParts(clients: number, a: AgencyPricing = PRICING.agency): { count: number; usd: number }[] {
  const parts: { count: number; usd: number }[] = [];
  let prev = a.seatsIncluded;
  for (const t of a.extraClientTiers) {
    const cap = t.toClient ?? Infinity;
    const count = Math.max(0, Math.min(clients, cap) - prev);
    if (count > 0) parts.push({ count, usd: t.usd });
    prev = cap;
  }
  return parts;
}

/** "clients 4–10 $79 each, 11+ $59": the tier line every agency price statement carries. */
export function agencyTiersLine(a: AgencyPricing = PRICING.agency): string {
  let from = a.seatsIncluded + 1;
  return a.extraClientTiers
    .map((t, i) => {
      const range = t.toClient === null ? `${from}+` : `${from}–${t.toClient}`;
      const text = `${i === 0 ? 'clients ' : ''}${range} $${t.usd}${i === 0 ? ' each' : ''}`;
      if (t.toClient !== null) from = t.toClient + 1;
      return text;
    })
    .join(', ');
}

/** "$229/mo or $2,290/yr" */
export function agencyPriceLine(a: { monthlyUsd: number; yearlyUsd: number } = PRICING.agency): string {
  return `$${a.monthlyUsd}/mo or $${a.yearlyUsd.toLocaleString('en-US')}/yr`;
}
