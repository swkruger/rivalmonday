import { PRICING } from './pricing';

export const HERO = {
  eyebrowPill: 'Pilot',
  eyebrow: 'White-label competitor intelligence for agencies',
  headline: "Your clients' rivals, briefed every Monday, under your brand.",
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
  examples: ['HVAC', 'plumbing', 'dental', 'roofing', 'electrical', 'med spas', 'law firms', 'landscaping', 'pest control', 'auto repair', 'cleaning', 'veterinary', 'salons'],
  link: 'Join the free pilot →',
} as const;

/** Final; owned here only. `join` is the closing pricing band (`PricingTeaser`), which also holds the `pricing` anchor. */
export const HOME_ANCHORS = ['client-view', 'sample', 'recommendations', 'live', 'how-it-works', 'checks', 'friday', 'real-sample', 'guides', 'join'] as const;
export type HomeAnchor = (typeof HOME_ANCHORS)[number];
type SectionId = Exclude<HomeAnchor, 'join'> | 'pricing';

export interface HomeSection {
  id: SectionId;
  eyebrow: string;
  heading: string;
  body: string;
}

const { agency, business } = PRICING;

export const SECTIONS: Record<SectionId, HomeSection> = {
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
  recommendations: {
    id: 'recommendations',
    eyebrow: 'Recommendations',
    heading: 'Every move becomes something to do about it.',
    body: 'Each recommendation comes from the brief, with its evidence attached and who it is for. This is the board your clients get, and it works: start one, finish one or dismiss one.',
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
    body: 'You add the client and pick the rivals. We do the watching and the writing, and the client hears it from you.',
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
    body: "Friday answers from the same evidence as the brief, with the sources inline. It's the in-app assistant, under the name you choose, and your agency switches it on for each client.",
  },
  'real-sample': {
    id: 'real-sample',
    eyebrow: 'A real sample for your client',
    heading: 'See one of your own clients before you commit.',
    body: 'Tick "Send me a real sample brief" when you join. We build a starting-point brief for one of your clients from public information and email you a private link. Free during the pilot, a limited number each month.',
  },
  guides: {
    id: 'guides',
    eyebrow: 'Guides',
    heading: 'Guides for agencies watching local rivals.',
    body: 'Practical methods you can use with any client, whether or not you use Rival Monday.',
  },
  pricing: {
    id: 'pricing',
    eyebrow: 'Pricing',
    heading: 'Free during the pilot.',
    body: 'You set your own prices for your clients and bill them in your name.',
  },
};

/** Under the recommendations board. Planned work, not a claim: same rules as `roadmap.ts`, and it goes when that item ships. */
export const RECOMMENDATIONS_ROADMAP = {
  status: 'Coming soon',
  heading: 'Act on a recommendation without leaving Rival Monday.',
  body: 'Friday will draft the review reply, profile edit or post. Nothing is posted until a person says yes. Then we check the public profile for the change and track whether the gap to rivals closes.',
  notice: 'Planned, not yet available. What it includes and when it ships may change.',
  link: { label: 'See the roadmap →', href: '/roadmap' },
} as const;

/** The real-sample preview card (illustrative; figures are the fictional sample's). */
export const REAL_SAMPLE_PREVIEW = {
  subject: 'Your starting-point brief is ready',
  scorecardTitle: 'Where you stand',
  link: 'Open the private link',
  note: 'Illustration with sample data',
} as const;

/** Friday's voice: docs/brand/friday.md. "Says so" is the assistant's rule 6 (`packages/ask/src/prompt.ts`). */
export const FRIDAY_PERSONA = {
  heading: 'Meet Friday.',
  body: "Think of a colleague who has done the reading: calm, plain-spoken and always ready with the receipts. If the evidence isn't there, Friday says so instead of guessing.",
  prompt: "Hi, I'm Friday. Pick a question and I'll bring the receipts.",
  mcpNote: "Separate from Friday: a client's own AI tools that support MCP can read the same evidence, also switched on per client.",
} as const;

/**
 * Hero: screenshots of the "What your clients see" tour, so retake them if that sample changes.
 * Others: illustrative photos (generated once, no text, people or brands). All served from `public/sample`.
 */
export const HOME_IMAGES = {
  hero: {
    src: '/sample/hero-overview.webp',
    alt: 'The client dashboard for a sample heating and air business: the week in four numbers, where it stands against its rivals and the Ask Friday card',
    caption: 'Sample data from a fictional business.',
  },
  heroMap: { src: '/sample/hero-map.webp', alt: 'Map rankings for "ac repair marlowemere": a grid of ranks over the service area, strongest around the business' },
  heroFriday: { src: '/sample/hero-friday.webp', alt: 'Friday, the assistant, answering who is winning the map, with numbered sources for each figure' },
  street: { src: '/sample/home-street.webp', alt: 'Local shops on a small-town main street with two plain white service vans parked outside' },
  counter: { src: '/sample/home-counter.webp', alt: 'A phone, keys, a clipboard and a cup of coffee on a service counter, with a work van outside the window' },
} as const;

export const CHECKS_LINK = { label: 'Read how we check claims →', href: '/how-it-works' } as const;

/** Labels of the diagram's explanation sheets; the wording inside them comes from `sources.ts` and `how-it-works.ts`. */
export const CHECKS_DETAIL = {
  hint: 'Open any box to see how it works.',
  sourceEyebrow: 'Evidence source',
  stepEyebrow: 'How we check',
  collect: 'What we collect',
  often: 'How often',
  leaveAlone: 'What we leave alone',
  example: 'In a brief, for example',
  sourceLink: 'More about this source →',
  briefTitle: 'Monday brief',
  briefLink: { label: 'Open the sample brief →', href: '/sample-brief' },
} as const;

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
  agency: `Then $${agency.monthlyUsd}/mo including ${agency.seatsIncluded} client seats, $${agency.extraSeatUsd} per extra seat, with a ${agency.trialDays}-day trial.`,
  business: `Then $${business.monthlyUsd}/mo, through your agency, who sets up the rest.`,
} as const;

/** Pilot off (NEW, owner signs). */
export const PRICING_HEADING_TRIAL = `Start with a ${agency.trialDays}-day free trial.`;
export const PRICING_LINES_TRIAL = {
  agency: `$${agency.monthlyUsd}/mo including ${agency.seatsIncluded} client seats, $${agency.extraSeatUsd} per extra seat, after a ${agency.trialDays}-day free trial.`,
  business: `$${business.monthlyUsd}/mo, through your agency, who sets up the rest.`,
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
  { key: 'rivalsWatched', label: 'Rivals watched', caption: 'Right now' },
  { key: 'snapshots', label: 'Evidence captured', caption: 'Last 7 days' },
  { key: 'claimsChecked', label: 'Claims checked against evidence', caption: 'Last 7 days' },
  { key: 'claimsDropped', label: 'Claims dropped for lack of evidence', caption: 'Last 7 days' },
] as const;
