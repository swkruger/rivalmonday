import { PRICING } from './pricing';

export const PARTNER_EXAMPLE = { clients: 10, clientPriceUsd: 199 } as const; // OWNER SIGNS: example price only

export interface PartnerExample {
  clients: number;
  clientPriceUsd: number;
  extraSeats: number;
  costUsd: number;
  revenueUsd: number;
  marginUsd: number;
}

export function partnerExample(clients: number, clientPriceUsd: number, a = PRICING.agency): PartnerExample {
  if (!Number.isInteger(clients) || clients < 1) throw new Error('clients must be a positive integer');
  const extraSeats = Math.max(0, clients - a.seatsIncluded);
  const costUsd = a.monthlyUsd + extraSeats * a.extraSeatUsd;
  const revenueUsd = clients * clientPriceUsd;
  return { clients, clientPriceUsd, extraSeats, costUsd, revenueUsd, marginUsd: revenueUsd - costUsd };
}

/**
 * /partners copy. Draft: owner signs.
 * Billing line: "no platform fee" holds only while `connect_application_fee_percent` is 0 (global and every
 * per-agency fee). OWNER CHECK at /platform/billing before launch (claims ledger, int-stripe).
 */
export const PARTNER_COPY = {
  eyebrow: 'Partners',
  h1: 'Resell Rival Monday as your own', // OWNER SIGNS
  lead: 'Offer your local-service clients a weekly, evidence-backed competitor brief. Your name on it, your prices, your billing.',
  sections: [
    {
      id: 'brand',
      heading: 'Your brand',
      body: 'Your agency name, logo and colors appear on client pages and emails. Emails go out under your sender name and sign-off, and you can rename the assistant. Your own web address for client logins is on the roadmap.',
    },
    {
      id: 'prices',
      heading: 'Your prices',
      body: 'You set what your clients pay.',
    },
    {
      id: 'billing',
      heading: 'Your billing',
      body: 'Clients pay you through your own Stripe account, using Stripe Connect. We add no platform fee on what your clients pay you.',
    },
  ],
  exampleHeading: 'A worked example',
  plan: `Your plan is $${PRICING.agency.monthlyUsd}/mo including ${PRICING.agency.seatsIncluded} seats, then $${PRICING.agency.extraSeatUsd} per extra seat.`,
  pilotNote: 'Free during the pilot',
} as const;
