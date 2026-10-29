import { PRICING } from './pricing';

/** /pricing copy. Every figure is interpolated from `PRICING`. Draft copy: owner signs. */
const { agency, business } = PRICING;

export type PlanCopy = { name: string; price: string; note: string; points: string[]; cta: 'join' | 'trial' | 'business' };

const AGENCY_AFTER = `$${agency.monthlyUsd}/mo including ${agency.seatsIncluded} client seats · $${agency.extraSeatUsd} per extra seat`;
const AGENCY_POINTS = [
  'Your name, logo and colors on client pages and emails',
  'A Monday brief for every client, with evidence one click away',
  'Friday and MCP, switched on per client',
  'Bill clients through your own Stripe account',
];
const BUSINESS_POINTS = [
  'A Monday brief about your local rivals, with the evidence behind each claim',
  'Alerts when a rival makes a big move',
  'Run through your agency, who sets up the rest',
];

export const PLAN_CARDS: { pilot: { agency: PlanCopy; business: PlanCopy }; trial: { agency: PlanCopy; business: PlanCopy } } = {
  pilot: {
    agency: {
      name: 'For agencies',
      price: 'Free during the pilot',
      note: `Then ${AGENCY_AFTER} · ${agency.trialDays}-day trial`,
      points: AGENCY_POINTS,
      cta: 'join',
    },
    business: {
      name: 'For local businesses',
      price: 'Free during the pilot',
      note: `Then $${business.monthlyUsd}/mo`,
      points: BUSINESS_POINTS,
      cta: 'business',
    },
  },
  trial: {
    agency: {
      name: 'For agencies',
      price: `$${agency.monthlyUsd}/mo`,
      note: `${agency.trialDays}-day free trial (one active client until you add a card), then ${AGENCY_AFTER}`,
      points: AGENCY_POINTS,
      cta: 'trial',
    },
    business: {
      name: 'For local businesses',
      price: `$${business.monthlyUsd}/mo`,
      note: "Join the waitlist and we'll match you with an agency where we can",
      points: BUSINESS_POINTS,
      cta: 'business',
    },
  },
};

export const PRICING_PAGE = {
  eyebrow: 'Pricing',
  h1: 'Simple pricing for agencies and their clients',
  lead: 'One plan for agencies, with client seats included. Local businesses are served by an agency.',
  featuresHeading: 'What each plan includes',
  faqHeading: 'Questions',
} as const;

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
