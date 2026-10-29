import { PRICING } from './pricing';

export const HERO = {
  eyebrowPill: 'Pilot',
  eyebrow: 'White-label competitor intelligence for agencies',
  headline: 'Every Monday, your clients learn what their competitors did last week, under your brand.',
  /** Rendered in the secondary colour. */
  headlineAccent: 'under your brand.',
  sub: "Rival Monday watches your clients' local rivals — websites, Google reviews, ads and map rankings — and turns it into an evidence-backed weekly brief, a dashboard and an AI assistant you sell as your own.",
  primaryCta: 'Join the pilot',
  secondaryCta: 'See a sample brief',
  finePrint: 'Free during the pilot · No card needed · Limited places',
  /** Pilot off (NEW, owner signs). */
  finePrintTrial: `${PRICING.agency.trialDays}-day free trial · then $${PRICING.agency.monthlyUsd}/mo incl. ${PRICING.agency.seatsIncluded} client seats`,
} as const;

export const ANNOUNCEMENT = {
  lead: 'Pilot now open for agencies serving local businesses',
  /** Kinds of business, not claims of customers. Rendered "— like {x}". */
  examples: ['HVAC', 'plumbing', 'dental', 'roofing', 'med spas', 'law firms', 'landscaping', 'auto repair'],
  link: 'Join the pilot →',
} as const;

/** Final; owned here only. `join` is the CtaBand. */
export const HOME_ANCHORS = ['sample', 'live', 'how-it-works', 'checks', 'friday', 'real-sample', 'pricing', 'join'] as const;
export type HomeAnchor = (typeof HOME_ANCHORS)[number];

export interface HomeSection {
  id: Exclude<HomeAnchor, 'join'>;
  eyebrow: string;
  heading: string;
  body: string;
}

const { agency, business } = PRICING;

export const SECTIONS: Record<Exclude<HomeAnchor, 'join'>, HomeSection> = {
  sample: {
    id: 'sample',
    eyebrow: 'Sample brief',
    heading: 'Click any claim to see the evidence behind it.',
    body: 'This is a full Monday brief for a fictional heating and air business. Every line links to the snapshot, reviews or ads it came from. Move the slider to see how the map rankings changed week by week, or ask Friday.',
  },
  live: {
    id: 'live',
    eyebrow: 'This week on Rival Monday',
    heading: 'Real numbers from the platform, updated every few minutes.',
    body: 'Rounded down.',
  },
  'how-it-works': {
    id: 'how-it-works',
    eyebrow: 'How it works',
    heading: 'From client to Monday brief in four steps.',
    body: '',
  },
  checks: {
    id: 'checks',
    eyebrow: 'How we check every claim',
    heading: 'No evidence, no claim.',
    body: "Every sentence in a brief starts from something we captured: a page snapshot, a review, an ad, a ranking. Before a brief goes out, a separate check compares each claim with its evidence. Anything it can't back up is dropped, not softened.",
  },
  friday: {
    id: 'friday',
    eyebrow: "Friday, your clients' assistant",
    heading: 'Ask about any rival. Every answer shows its sources.',
    body: "Friday answers from the same evidence as the brief, with the sources inline. It's the in-app assistant, under the name you choose, and your agency switches it on for each client. MCP is separate: it lets a client's own AI tools read the evidence, also switched on per client.",
  },
  'real-sample': {
    id: 'real-sample',
    eyebrow: 'A real sample for your client',
    heading: 'See one of your own clients before you commit.',
    body: 'Tick "Send me a real sample brief" when you join. We build a starting-point brief for one of your clients from public information and email you a private link. Free during the pilot, a limited number each month.',
  },
  pricing: {
    id: 'pricing',
    eyebrow: 'Pricing',
    heading: 'Free during the pilot.',
    body: 'You set your own prices for your clients and bill them in your name.',
  },
};

export const CHECKS_LINK = { label: 'Read how we check claims →', href: '/how-it-works' } as const;

export const HOW_STEPS = [
  { title: 'Add a client', body: 'Enter the business and its service area. We find its Google listing.' },
  {
    title: 'We find the rivals',
    body: 'We search the area and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick.',
  },
  {
    title: 'We watch every week',
    body: 'Websites, Google reviews, ads and map rankings, checked on a schedule and saved as evidence.',
  },
  {
    title: 'Monday brief + alerts',
    body: 'Your client gets a short brief under your brand, with the evidence one click away. Big moves send an alert.',
  },
] as const;

export const PRICING_LINES = {
  agency: `Agencies: then $${agency.monthlyUsd}/mo including ${agency.seatsIncluded} client seats, $${agency.extraSeatUsd} per extra seat, with a ${agency.trialDays}-day trial.`,
  business: `Local businesses: then $${business.monthlyUsd}/mo.`,
} as const;

/** Pilot off (NEW, owner signs). */
export const PRICING_HEADING_TRIAL = `Start with a ${agency.trialDays}-day free trial.`;
export const PRICING_LINES_TRIAL = {
  agency: `Agencies: $${agency.monthlyUsd}/mo including ${agency.seatsIncluded} client seats, $${agency.extraSeatUsd} per extra seat, after a ${agency.trialDays}-day free trial.`,
  business: `Local businesses: $${business.monthlyUsd}/mo.`,
} as const;

export const CTA_BAND = {
  heading: 'Join the pilot',
  body: 'Places are limited while we work closely with each agency.',
  button: 'Join the pilot',
} as const;

/** Pilot off (NEW, owner signs). The button is `JoinButton`'s own "Start your free trial". */
export const CTA_BAND_TRIAL = {
  heading: 'Start your free trial',
  body: `Try Rival Monday free for ${agency.trialDays} days, then $${agency.monthlyUsd}/mo including ${agency.seatsIncluded} client seats.`,
} as const;

export const COUNTER_LABELS = [
  { key: 'rivalsWatched', label: 'rivals watched', caption: 'Right now' },
  { key: 'snapshots', label: 'evidence captured', caption: 'Last 7 days' },
  { key: 'claimsChecked', label: 'claims checked against evidence', caption: 'Last 7 days' },
  { key: 'claimsDropped', label: 'claims dropped for lack of evidence', caption: 'Last 7 days' },
] as const;
