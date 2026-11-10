import { agencyPriceLine, agencyTiersLine, PRICING } from './pricing';

/** Pricing-page copy for both sides. Every figure is interpolated from `PRICING`. Deck § 5; the owner signs. */
const { agency, business } = PRICING;

export type PlanCopy = {
  name: string;
  /** The bare monthly figure; the card adds "/mo". */
  price: string;
  note: string;
  points: string[];
  cta: 'join' | 'trial' | 'business';
  /** Pilot cards only. */
  chip?: string;
  /** Tier rows (agency, pilot). */
  rows?: readonly { label: string; value: string }[];
};

const [firstTier, lastTier] = agency.extraClientTiers;
const AGENCY_AFTER = `${agencyPriceLine()} including ${agency.seatsIncluded} client seats · ${agencyTiersLine()}`;
const AGENCY_ROWS = [
  { label: `Clients ${agency.seatsIncluded + 1}–${firstTier.toClient}`, value: `$${firstTier.usd} each/mo` },
  { label: `Clients ${firstTier.toClient + 1} and up`, value: `$${lastTier.usd} each/mo` },
] as const;
const AGENCY_POINTS = [
  'Your name, logo and colors on client pages and emails',
  'A Monday brief for every client, with evidence one click away',
  "Friday, plus a connection for your clients' own AI tools, switched on per client",
  'Bill clients through your own Stripe account',
];
const BUSINESS_POINTS = [
  'A Monday brief about your local rivals, with the evidence behind each claim',
  'Alerts when a rival makes a big move',
  'Run through your agency, who sets up the rest',
];
const PILOT_CHIP = 'Free during the pilot';

export const PLAN_CARDS: { pilot: { agency: PlanCopy; business: PlanCopy }; trial: { agency: PlanCopy; business: PlanCopy } } = {
  pilot: {
    agency: {
      name: 'For agencies',
      price: `$${agency.monthlyUsd}`,
      note: `or $${agency.yearlyUsd.toLocaleString('en-US')}/yr · ${agency.seatsIncluded} client seats included · ${agency.trialDays}-day trial`,
      points: AGENCY_POINTS,
      cta: 'join',
      chip: PILOT_CHIP,
      rows: AGENCY_ROWS,
    },
    business: {
      name: 'For local businesses',
      price: `$${business.monthlyUsd}`,
      note: 'A typical price. Your agency sets it and sends the bill.',
      points: BUSINESS_POINTS,
      cta: 'business',
      chip: PILOT_CHIP,
    },
  },
  trial: {
    agency: {
      name: 'For agencies',
      price: `$${agency.monthlyUsd}`,
      note: `${agency.trialDays}-day free trial (one active client until you add a card), then ${AGENCY_AFTER}`,
      points: AGENCY_POINTS,
      cta: 'trial',
    },
    business: {
      name: 'For local businesses',
      price: `$${business.monthlyUsd}`,
      note: "Join the waitlist and we'll match you with an agency where we can",
      points: BUSINESS_POINTS,
      cta: 'business',
    },
  },
};

export type PricingPageCopy = { eyebrow: string; h1: string; lead: string; leadTrial: string; featuresHeading: string; faqHeading: string };

export const PRICING_PAGE: { agency: PricingPageCopy; business: PricingPageCopy } = {
  agency: {
    eyebrow: 'Pricing',
    h1: 'One plan. Three clients included.',
    lead: 'Agencies buy the plan and add clients as they grow.',
    leadTrial: 'Agencies buy the plan and add clients as they grow.',
    featuresHeading: 'What the plan includes',
    faqHeading: 'Questions',
  },
  business: {
    eyebrow: 'Pricing',
    h1: 'One price. Your agency does the rest.',
    lead: 'Free during the pilot. After that you pay the agency that runs it for you.',
    leadTrial: 'You pay the agency that runs it for you.',
    featuresHeading: 'What you get',
    faqHeading: 'Questions',
  },
};

/** `ledger` ids are rows in docs/research/2026-10-29-phase-17c-claim-check.md. */
export const FEATURE_ROWS: readonly { label: string; agency: boolean | string; business: boolean | string; ledger: string }[] = [
  { label: 'Monday brief', agency: true, business: true, ledger: 'feat-weekly-brief' },
  { label: 'Alerts on big moves', agency: true, business: true, ledger: 'feat-alerts' },
  { label: 'Client dashboard', agency: true, business: 'Set by your agency', ledger: 'feat-dashboard' },
  { label: 'Evidence links', agency: true, business: true, ledger: 'feat-evidence-links' },
  { label: 'Friday, the assistant', agency: true, business: 'Set by your agency', ledger: 'feat-friday' },
  { label: 'MCP', agency: true, business: 'Set by your agency', ledger: 'feat-mcp' },
  { label: 'Your branding', agency: true, business: false, ledger: 'feat-branding' },
  { label: 'Competitor discovery', agency: true, business: 'Automatic once, then on request through your agency', ledger: 'feat-competitor-discovery' },
  { label: 'Weekly map rankings', agency: true, business: true, ledger: 'feat-map-rankings' },
  { label: 'Client billing in your name', agency: true, business: false, ledger: 'feat-client-billing' },
];

/** Pilot-neutral: no "pilot" and no prices. Answers are at most 70 words. Owner signs. */
export const PRICING_FAQ: readonly { q: string; a: string; ledger: string; link?: { href: string; label: string } }[] = [
  {
    q: 'Is it really white-label?',
    a: "Mostly. You set your name, logo, colors, email sender name and sign-off, and your assistant's name, and client pages do not show Rival Monday's name. Your own web address for client logins is on the roadmap. For now, logins and links use our address. Emails are sent from our address under your sender name.",
    ledger: 'faq-white-label',
  },
  {
    q: 'Where does the data come from?',
    a: 'Public information only. We never log in to anything, and reviewers are pseudonymized.',
    ledger: 'faq-data',
    link: { href: '/sources', label: 'See what we collect' },
  },
  {
    q: 'What is MCP?',
    a: "It lets AI tools that support MCP, such as Claude, read your clients' competitor data with your permission. It is included in the plan, and you switch it on per client.",
    ledger: 'faq-mcp',
  },
  {
    q: 'How do I cancel?',
    a: "Agencies cancel from Billing, and access lasts to the end of the paid period. A client's billing runs through their agency, so clients ask their agency to cancel.",
    ledger: 'faq-cancel',
  },
];

type Faq = { q: string; a: string; ledger: string; link?: { href: string; label: string } };

/** Deck § 5: FAQ 3 is the agency list's data answer, unchanged. Ledger ids: cap-reseller, feat-client-billing, faq-data, faq-cancel. */
export const BUSINESS_FAQ: readonly Faq[] = [
  {
    q: 'Do I need an agency?',
    a: "Yes. A local agency sets Rival Monday up for you and sends the brief under its own name. If you don't have one, join the waitlist and we'll match you with an agency where we can.",
    ledger: 'cap-reseller',
  },
  {
    q: 'Who sends the bill?',
    a: `Your agency. It sets the price and bills you itself. $${business.monthlyUsd} a month is a typical price, not a fixed one.`,
    ledger: 'feat-client-billing',
  },
  { ...PRICING_FAQ[1]!, q: 'Where does the information come from?' },
  {
    q: 'How do I cancel?',
    a: 'Ask your agency. It runs your subscription and can stop it for you.',
    ledger: 'faq-cancel',
  },
];
