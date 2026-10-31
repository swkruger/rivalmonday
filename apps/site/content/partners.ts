import { PRICING } from './pricing';

/** Calculator starting point and slider limits. OWNER SIGNS: example prices and upsell share only. */
export const PARTNER_EXAMPLE = {
  clients: 50,
  clientPriceUsd: 199,
  upsellPriceUsd: 999,
  upsellSharePct: 20,
  maxClients: 100,
  shareStepPct: 5,
} as const;

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

export interface PartnerUpsell {
  upsellClients: number;
  upsellRevenueUsd: number;
  /** Margin on Rival Monday + upsell revenue. The agency's cost of delivering the upsell is not in here: say so wherever it shows. */
  totalUsd: number;
}

/** Upsells are the agency's own services: Rival Monday neither sells nor delivers them. */
export function partnerUpsell(e: PartnerExample, sharePct: number, upsellPriceUsd: number): PartnerUpsell {
  const upsellClients = Math.round((e.clients * sharePct) / 100);
  const upsellRevenueUsd = upsellClients * upsellPriceUsd;
  return { upsellClients, upsellRevenueUsd, totalUsd: e.marginUsd + upsellRevenueUsd };
}

/** The fewest clients whose fees cover the plan and their own seats, at this client price. */
export function breakEvenClients(clientPriceUsd: number, a = PRICING.agency): number {
  let clients = 1;
  while (partnerExample(clients, clientPriceUsd, a).marginUsd < 0) clients += 1;
  return clients;
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
    {
      id: 'upsells',
      heading: 'Your upsells',
      body: 'A rival moving ahead is a reason to talk about more work. Offer your own services at your own price. They are yours to sell and deliver.',
    },
  ],
  upsellServices: ['Website builds', 'Google Ads', 'Meta Ads', 'CRM'],
  exampleHeading: 'Work out your numbers',
  calculator: {
    clients: 'Clients',
    upsellShare: 'Clients who also buy an upsell',
    resultLabel: 'A month, before the cost of delivering upsells',
    perYear: 'a year at this rate',
    cost: 'Your plan and seats',
    margin: 'Margin on Rival Monday',
    upsell: 'Upsell revenue',
    upsellServices: 'Website builds, Google Ads, Meta Ads or a CRM, at an example price of',
    sums: 'See the sums',
  },
  rows: {
    clients: 'Clients',
    clientPrice: 'Your example client price',
    cost: 'Your monthly cost',
    revenue: 'Your monthly revenue',
    margin: 'Your monthly margin on Rival Monday',
    upsell: 'Your monthly upsell revenue',
    total: 'Your monthly total, before upsell delivery costs',
  },
  plan: `Your plan is $${PRICING.agency.monthlyUsd}/mo including ${PRICING.agency.seatsIncluded} seats, then $${PRICING.agency.extraSeatUsd} per extra seat.`,
  pilotNote: 'Free during the pilot',
} as const;
