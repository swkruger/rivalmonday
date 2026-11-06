import type { JoinStart } from '../src/components/join/join-provider';
import { partnerExample, type PartnerExample } from './partners';
import { agencyPriceLine, agencyTiersLine, PRICING } from './pricing';

export const HERO = {
  eyebrowPill: 'Pilot',
  eyebrow: 'White-label competitor intelligence for agencies',
  headline: 'Your competitors are making moves. Are you watching?',
  /** Website wording is gated (D5): the page picks `sub` or `subNoWeb` by `WEBSITE_MONITORING_LIVE`. */
  sub: "Your clients' rivals are climbing the map, collecting reviews, launching ads and changing prices. Rival Monday watches every move and turns it into a weekly brief, dashboard and AI assistant, with evidence behind every claim. You sell it under your own brand, at your own price.",
  subNoWeb:
    "Your clients' rivals are climbing the map, collecting reviews and launching ads. Rival Monday watches every move and turns it into a weekly brief, dashboard and AI assistant, with evidence behind every claim. You sell it under your own brand, at your own price.",
  primaryCta: 'Join the free pilot',
  /** Home hero, home mobile bar and close band (D1). `primaryCta` stays the shared `JoinButton` default. */
  heroCta: 'Get a free brief for one of your clients',
  primaryStart: 'agency-sample' as const satisfies JoinStart,
  secondaryCta: 'See what your clients get',
  finePrint: 'Free during the pilot · No card needed · Limited places',
  /** Three short proofs under the CTA; each restates a claim the site already makes (pages.ts, checks, white label). */
  proof: ['Public information only', 'No claim without evidence', 'Sold under your brand'],
  /** Pilot off (NEW, owner signs). */
  finePrintTrial: `${PRICING.agency.trialDays}-day free trial · then ${agencyPriceLine()} incl. ${PRICING.agency.seatsIncluded} client seats`,
} as const;

export const ANNOUNCEMENT = {
  lead: 'Pilot now open for agencies serving local businesses',
  /** Kinds of business, not claims of customers. Rendered "— like {x}". */
  examples: ['HVAC', 'plumbing', 'dental', 'roofing', 'electrical', 'med spas', 'law firms', 'landscaping', 'pest control', 'auto repair', 'cleaning', 'veterinary', 'salons'],
  link: 'Join the free pilot →',
} as const;

/** Final; owned here only, in page order. `join` is the closing band (`close`). */
export const HOME_ANCHORS = [
  'rival-story',
  'ceiling',
  'opportunity',
  'cast',
  'client-view',
  'recommendations',
  'friday',
  'before-after',
  'checks',
  'sample',
  'live',
  'how-it-works',
  'commercial',
  'join',
] as const;
export type HomeAnchor = (typeof HOME_ANCHORS)[number];
/** `guides` is only used by `/how-it-works`. */
type SectionId = Exclude<HomeAnchor, 'join'> | 'guides';

export interface HomeSection {
  id: SectionId;
  eyebrow: string;
  heading: string;
  body: string;
  /** `checks`, `client-view`: the home page's own heading; `heading` stays what the other page (diagram / `/how-it-works`) shows. */
  homeHeading?: string;
}

const { agency } = PRICING;

export const SECTIONS: Record<SectionId, HomeSection> = {
  'client-view': {
    id: 'client-view',
    eyebrow: 'What your clients see',
    heading: 'A dashboard, a Monday brief and an assistant, all under your brand.',
    /** The home page's own heading; `heading` stays what `/how-it-works` shows. */
    homeHeading: 'What your client opens on Monday morning.',
    body: 'This is what a client gets: their rivals on one page, a short brief in their inbox every Monday, and Friday to answer questions. Every number links back to the evidence it came from.',
  },
  'rival-story': {
    id: 'rival-story',
    eyebrow: '',
    heading: 'While your client was busy running the business, a rival took the map.',
    body: "Twelve weeks ago, Quillstone Climate Pros was in the top three at 8 of 49 points across Northwind's service area. Now it's 31. In the same weeks it started two Meta ads, and Kestrel Mechanical cut its AC repair diagnostic to $69. Every move was public. Nobody told Northwind.",
  },
  ceiling: {
    id: 'ceiling',
    eyebrow: '',
    heading: "Your clients trust you. So why do you sell them only one thing?",
    body: "You've done the hard part: you've won the clients and earned their trust. Here's what to build on it.",
  },
  opportunity: {
    id: 'opportunity',
    eyebrow: '',
    heading: 'Your clients have competitors. You have a new service to sell.',
    body: "Offer a weekly competitor intelligence service under your agency's name. Rival Monday does the watching, the research and the first draft. Your team can edit or approve each brief before it goes out, and your agency gets the credit.",
  },
  cast: {
    id: 'cast',
    eyebrow: '',
    heading: 'Two colleagues your clients will look forward to.',
    body: '',
  },
  'before-after': {
    id: 'before-after',
    eyebrow: '',
    heading: 'What changes when Monday arrives.',
    body: '',
  },
  commercial: {
    id: 'commercial',
    eyebrow: '',
    heading: 'Your brand. Your price. Your billing.',
    body: '',
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
    homeHeading: 'Your name is on every brief, so we check every sentence.',
    body: "Every sentence in a brief starts from something we captured: a page snapshot, a review, an ad, a ranking. Before a brief goes out, a separate check compares each claim with its evidence. Anything it can't back up is dropped, not softened.",
  },
  friday: {
    id: 'friday',
    eyebrow: "Friday, your clients' assistant",
    heading: 'Ask about any rival. Every answer shows its sources.',
    body: "Friday answers from the same evidence as the brief, with the sources inline. It's the in-app assistant, under the name you choose, and your agency switches it on for each client.",
  },
  guides: {
    id: 'guides',
    eyebrow: 'Guides',
    heading: 'Guides for agencies watching local rivals.',
    body: 'Practical methods you can use with any client, whether or not you use Rival Monday.',
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
  street: { src: '/sample/home-street.webp', tag: 'Local rivals', alt: 'Local shops on a small-town main street with two plain white service vans parked outside' },
  counter: { src: '/sample/home-counter.webp', tag: 'Weekly check', alt: 'A phone, keys, a clipboard and a cup of coffee on a service counter, with a work van outside the window' },
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
  agency: `Then ${agencyPriceLine()} including ${agency.seatsIncluded} client seats, ${agencyTiersLine()}, with a ${agency.trialDays}-day trial.`,
} as const;

/** Pilot off (NEW, owner signs). */
export const PRICING_LINES_TRIAL = {
  agency: `${agencyPriceLine()} including ${agency.seatsIncluded} client seats, ${agencyTiersLine()}, after a ${agency.trialDays}-day free trial.`,
} as const;

export const CTA_BAND = {
  heading: 'Join the pilot',
  body: 'Places are limited while we work closely with each agency.',
  button: 'Join the free pilot',
} as const;

/** Pilot off (NEW, owner signs). The button is `JoinButton`'s own "Start your free trial". */
export const CTA_BAND_TRIAL = {
  heading: 'Start your free trial',
  body: `Try Rival Monday free for ${agency.trialDays} days, then ${agencyPriceLine()} including ${agency.seatsIncluded} client seats.`,
} as const;

export const COUNTER_LABELS = [
  { key: 'rivalsWatched', label: 'Rivals watched', caption: 'Right now' },
  { key: 'snapshots', label: 'Evidence captured', caption: 'Last 7 days' },
  { key: 'claimsChecked', label: 'Claims checked against evidence', caption: 'Last 7 days' },
  { key: 'claimsDropped', label: 'Claims dropped for lack of evidence', caption: 'Last 7 days' },
] as const;

/** Under the "How it works" steps (§9). */
export const HOW_STEPS_NOTE = 'The first brief shows where your client stands today against every rival. From then on, every brief shows how far they\'ve come.';

/** The rival story (§2). `SECTIONS['rival-story'].body` is the live body; the website-free body drops the Kestrel price cut (D5). */
export const RIVAL_STORY = {
  bodyNoWeb:
    "Twelve weeks ago, Quillstone Climate Pros was in the top three at 8 of 49 points across Northwind's service area. Now it's 31. In the same weeks it started two Meta ads. Every move was public. Nobody told Northwind.",
  /** NEW (D13, owner signs in Task 9): §2's replay is the rival's own map. */
  gridTitle: (keyword: string) => `Quillstone Climate Pros' map rankings for “${keyword}”`,
  logHeading: 'What happened, week by week',
  caption: 'Sample data from a fictional business.',
  closing: "Your client won't catch this on their own. A monthly rankings report won't either.",
} as const;

export const CEILING_LINES: { lead: string; body: string }[] = [
  { lead: 'Your report looks like everyone else\'s.', body: "Rankings, traffic, a few charts. Your clients' other agencies send the same thing." },
  { lead: 'The retainer gets questioned every month.', body: '"What did we get for it?" is a hard question when the work is invisible.' },
  {
    lead: "The research clients value most doesn't pay for itself.",
    body: "Watching every rival by hand takes hours you can't bill, and another analyst means another salary.",
  },
];

export const OPPORTUNITY = {
  outcomes: [
    { lead: 'A new recurring line item.', body: 'Your price, on your invoice, billed through your own Stripe account.' },
    { lead: 'A reason to talk to every client, every week.', body: 'News about their market, not just another report on their own numbers.' },
    {
      lead: 'Upsell conversations with evidence attached.',
      body: '"Your top rival just started running Meta ads" opens a conversation about your Meta ads service.',
    },
  ],
  /** Figures are computed by `opportunityExample()` from `PRICING`; only these two inputs are typed. */
  example: { clients: 20, clientPriceUsd: 199 },
  exampleNote: "An example, not a forecast. Before your team's time; your prices are up to you.",
  link: { label: 'Work out your numbers →', href: '/partners' },
} as const;

export function opportunityExample(): PartnerExample {
  return partnerExample(OPPORTUNITY.example.clients, OPPORTUNITY.example.clientPriceUsd);
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** "For example: 20 clients at $199/mo is $3,980 revenue against $1,372 in platform cost, a margin of $2,608 a month." */
export function opportunityLine(e: Pick<PartnerExample, 'clients' | 'clientPriceUsd' | 'revenueUsd' | 'costUsd' | 'marginUsd'> = opportunityExample()): string {
  return `For example: ${e.clients} clients at ${usd.format(e.clientPriceUsd)}/mo is ${usd.format(e.revenueUsd)} revenue against ${usd.format(e.costUsd)} in platform cost, a margin of ${usd.format(e.marginUsd)} a month.`;
}

export const CAST: { name: 'Monday' | 'Friday' | 'Rival Monday'; body: string }[] = [
  { name: 'Monday', body: 'The brief that lands every Monday morning: what each rival did, why it matters and what to do about it.' },
  {
    name: 'Friday',
    body: "The colleague who has done the reading. Ask about any rival and get an answer with the sources attached. If the evidence isn't there, Friday says so. You can rename Friday.",
  },
  { name: 'Rival Monday', body: 'The engine behind both. Your clients see your name, not ours.' },
];

export const BEFORE_AFTER = {
  columns: ['Before', 'After'],
  rows: [
    {
      who: 'Your client',
      before: '"I think Quillstone\'s been busier lately."',
      after: '"Quillstone moved into the top three at 31 of 49 map points, started two Meta ads on October 7, and we have two moves open to answer it."',
    },
    {
      who: 'Your agency',
      before: "A monthly report about your client's own numbers.",
      after: 'A weekly brief about their whole market, under your name, with next steps your team can sell.',
    },
  ],
} as const;

export const COMMERCIAL = {
  points: [
    {
      heading: 'Your brand',
      body: 'Your name, logo and colours on every client page and email, plus your own sender name and assistant name. Logins on your own web address are on the roadmap.',
    },
    { heading: 'Your price', body: 'You set what your clients pay.' },
    {
      heading: 'Your billing',
      body: 'Clients pay you directly through your own Stripe account. We add no platform fee on what your clients pay you.',
    },
  ],
  /** Planned work, not a claim (same rules as `roadmap.ts`). The plan line is `PRICING_LINES.agency` / `PRICING_LINES_TRIAL.agency`. */
  roadmapLine: { text: 'Coming next: act on a recommendation without leaving Rival Monday.', link: { label: 'See the roadmap →', href: '/roadmap' } },
} as const;

export const CLOSE = {
  heading: "Pick one client. We'll show you what their rivals are doing.",
  body: "Tell us about one client. We'll build a starting-point brief from public information and email you a private link. Free during the pilot, a limited number each month.",
  button: HERO.heroCta,
} as const;

/** Pilot off (NEW, owner signs). */
export const CLOSE_TRIAL = {
  heading: CLOSE.heading,
  body: 'Start a free trial, add one client and see their starting-point brief: where they stand today against every rival.',
  button: CLOSE.button,
} as const;
