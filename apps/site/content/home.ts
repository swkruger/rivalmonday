import { PRICING } from './pricing';

export const HERO = {
  eyebrowPill: 'Pilot',
  eyebrow: 'White-label competitor intelligence for agencies',
  headline: "Your clients' rivals, briefed every Monday, under your brand.",
  /** Rendered in the secondary colour. */
  headlineAccent: 'under your brand.',
  sub: 'Rival Monday watches their websites, Google reviews, ads and map rankings, and turns every move into an evidence-backed brief, dashboard and AI assistant you sell as your own.',
  primaryCta: 'Join the free pilot',
  secondaryCta: 'See what your clients get',
  finePrint: 'Free during the pilot · No card needed · Limited places',
  /** Three short proofs under the CTA; each restates a claim the site already makes (pages.ts, checks, white label). */
  proof: ['Public information only', 'No claim without evidence', 'Sold under your brand'],
  /** Pilot off (NEW, owner signs). */
  finePrintTrial: `${PRICING.agency.trialDays}-day free trial · then $${PRICING.agency.monthlyUsd}/mo incl. ${PRICING.agency.seatsIncluded} client seats`,
} as const;

export const ANNOUNCEMENT = {
  lead: 'Pilot now open for agencies serving local businesses',
  /** Kinds of business, not claims of customers. Rendered "— like {x}". */
  examples: ['HVAC', 'plumbing', 'dental', 'roofing', 'med spas', 'law firms', 'landscaping', 'auto repair'],
  link: 'Join the free pilot →',
} as const;

/** Final; owned here only. `join` is the CtaBand. */
export const HOME_ANCHORS = ['client-view', 'sample', 'live', 'how-it-works', 'checks', 'friday', 'integrations', 'real-sample', 'pricing', 'join'] as const;
export type HomeAnchor = (typeof HOME_ANCHORS)[number];

export interface HomeSection {
  id: Exclude<HomeAnchor, 'join'>;
  eyebrow: string;
  heading: string;
  body: string;
}

const { agency, business } = PRICING;

export const SECTIONS: Record<Exclude<HomeAnchor, 'join'>, HomeSection> = {
  'client-view': {
    id: 'client-view',
    eyebrow: 'What your clients see',
    heading: 'A dashboard, a Monday brief and an assistant, all under your brand.',
    body: 'This is what a client gets: their rivals on one page, a short brief in their inbox every Monday, and Friday to answer questions. Every number links back to the evidence it came from.',
  },
  sample: {
    id: 'sample',
    eyebrow: 'Sample brief',
    heading: 'Click any claim to see the evidence behind it.',
    body: 'This is a full Monday brief for a fictional heating and air business. Every line links to the snapshot, reviews or ads it came from. Press play to watch its map rankings spread out from its own street over twelve weeks, or ask Friday.',
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
  integrations: {
    id: 'integrations',
    eyebrow: 'Integrations',
    heading: 'The services Rival Monday runs on',
    body: "Hosting, AI, email and billing from established providers. Your clients' data is stored in our database and evidence store.",
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

/** The real-sample preview card (illustrative; figures are the fictional sample's). */
export const REAL_SAMPLE_PREVIEW = {
  subject: 'Your starting-point brief is ready',
  scorecardTitle: 'Where you stand',
  link: 'Open the private link',
  note: 'Illustration with sample data',
} as const;

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
  button: 'Join the free pilot',
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
