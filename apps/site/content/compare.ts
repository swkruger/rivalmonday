import { siteEnv } from '../src/lib/env';
import { PRICING } from './pricing';

// Draft copy: owner + counsel sign. Rival facts come only from
// docs/research/2026-10-28-phase-17-comparison-facts.md (each with its source id from that file's Sources list);
// Rival Monday cells come only from the claims ledger docs/research/2026-10-29-phase-17c-claim-check.md
// (rows cap-<key>, incl. its "Research § 2 RM column corrections"). Never write "X doesn't have Y": a rival cell is
// yes | partial | text | unknown (rendered "Not stated publicly"), never no.

export type CapabilityKey =
  | 'websites'
  | 'reviews'
  | 'ads'
  | 'gbp'
  | 'rankings'
  | 'social'
  | 'weeklyBrief'
  | 'evidenceLinks'
  | 'assistant'
  | 'mcp'
  | 'api'
  | 'whiteLabel'
  | 'reseller'
  | 'publicPricing'
  | 'trial';
export type RivalCell = { mark: 'yes' | 'partial' | 'text' | 'unknown'; label?: string; source?: string };
export type OurCell = { mark: 'yes' | 'partial' | 'no'; label?: string; ledger: string };
export interface FactSource {
  id: string;
  url: `https://${string}`;
  checkedOn: '2026-10-28';
}
export interface Rival {
  slug: 'rivalmappd' | 'brightlocal' | 'local-falcon' | 'birdeye' | 'visualping';
  name: string;
  kind: string;
  factsCheckedOn: string;
  summary: string;
  facts: { text: string; source: string }[];
  pricing: { text: string; source: string }[];
  betterAt: string[];
  weDiffer: { text: string; key: CapabilityKey }[];
  cells: Record<CapabilityKey, RivalCell>;
}

/** The date every rival fact was checked (research file). */
const CHECKED = '2026-10-28';

/** `2026-10-28` → `Oct 28, 2026` (en-US, UTC). */
export function formatFactDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** The dated absence form (research § 4): never "X doesn't have Y". */
function notListed(name: string, what: string, where = 'public pages'): string {
  const verb = where.endsWith('pages') ? "don't" : "doesn't";
  return `As of ${formatFactDate(CHECKED)}, ${name}'s ${where} ${verb} list ${what}.`;
}

export const CAPABILITIES: readonly { key: CapabilityKey; label: string }[] = [
  { key: 'websites', label: 'Competitor website changes' },
  { key: 'reviews', label: 'Competitor reviews' },
  { key: 'ads', label: 'Competitor ads' },
  { key: 'gbp', label: 'Competitor Google Business Profile changes' },
  { key: 'rankings', label: 'Map rankings / geo-grid' },
  { key: 'social', label: 'Competitor social media' },
  { key: 'weeklyBrief', label: 'Weekly brief' },
  { key: 'evidenceLinks', label: 'Claims link to evidence' },
  { key: 'assistant', label: 'AI assistant' },
  { key: 'mcp', label: 'MCP server' },
  { key: 'api', label: 'Public API' },
  { key: 'whiteLabel', label: 'White-label' },
  { key: 'reseller', label: 'Agency or reseller program' },
  { key: 'publicPricing', label: 'Public pricing' },
  { key: 'trial', label: 'Free trial or free tier' },
];

/** The research file's Sources list, ids as there. */
export const FACT_SOURCES: readonly FactSource[] = [
  { id: 'rmp', url: 'https://rivalmappd.com/', checkedOn: '2026-10-28' },
  { id: 'cap-rmp', url: 'https://www.capterra.com/p/10046168/RivalMappd/', checkedOn: '2026-10-28' },
  { id: 'rt', url: 'https://rivaltracker.io/', checkedOn: '2026-10-28' },
  { id: 'be', url: 'https://birdeye.com/competitors-ai/', checkedOn: '2026-10-28' },
  { id: 'be-price', url: 'https://birdeye.com/pricing/', checkedOn: '2026-10-28' },
  { id: 'be-res', url: 'https://birdeye.com/partners/resellers', checkedOn: '2026-10-28' },
  { id: 'lo', url: 'https://localo.com/', checkedOn: '2026-10-28' },
  { id: 'lo-p', url: 'https://localo.com/pricing', checkedOn: '2026-10-28' },
  { id: 'gmb', url: 'https://gridmybusiness.com/', checkedOn: '2026-10-28' },
  { id: 'ys', url: 'https://www.yext.com/platform/scout', checkedOn: '2026-10-28' },
  {
    id: 'ys-blog',
    url: 'https://www.yext.com/blog/how-yext-scout-helps-brands-outperform-competitors-across-ai-and-search',
    checkedOn: '2026-10-28',
  },
  { id: 'vp-price', url: 'https://visualping.io/pricing', checkedOn: '2026-10-28' },
  { id: 'vp-rep', url: 'https://visualping.io/pages/blog/visualping-reports-guide', checkedOn: '2026-10-28' },
  { id: 'vp-q1', url: 'https://visualping.io/pages/blog/q1-2026-release-recap', checkedOn: '2026-10-28' },
  { id: 'vp-q3', url: 'https://visualping.io/blog/q3-2026-release-recap', checkedOn: '2026-10-28' },
  { id: 'bl-price', url: 'https://www.brightlocal.com/pricing/', checkedOn: '2026-10-28' },
  { id: 'bl-ai', url: 'https://www.brightlocal.com/ai-roadmap/', checkedOn: '2026-10-28' },
  {
    id: 'bl-pr',
    url: 'https://digital-release.wowktv.com/business/press-releases/cision/20260408LN28903/brightlocal-launches-ai-insights-to-help-businesses-navigate-increasingly-complex-local-search',
    checkedOn: '2026-10-28',
  },
  {
    id: 'bl-wl',
    url: 'https://help.brightlocal.com/hc/en-us/articles/12625775906578-Which-plans-include-the-option-to-white-label',
    checkedOn: '2026-10-28',
  },
  { id: 'lf', url: 'https://www.localfalcon.com/', checkedOn: '2026-10-28' },
  { id: 'lf-price', url: 'https://www.localfalcon.com/pricing', checkedOn: '2026-10-28' },
  {
    id: 'ghl',
    url: 'https://help.gohighlevel.com/support/solutions/articles/155000005344-reputation-management-competitor-analysis-in-highlevel',
    checkedOn: '2026-10-28',
  },
  { id: 'ghy', url: 'https://gethighlytics.com/', checkedOn: '2026-10-28' },
  { id: 'vd', url: 'https://vendasta.com/platform/snapshot', checkedOn: '2026-10-28' },
];

const P = PRICING.agency;

/** Rival Monday's own column: the claims ledger, rows cap-<key>. */
export const RIVAL_MONDAY: Record<CapabilityKey, OurCell> = {
  // Gated by WEB_MONITORING_ENABLED (ledger): `partial` until the owner switches it on, then `yes`.
  websites: { mark: 'partial', label: 'Switching on soon', ledger: 'cap-websites' },
  reviews: { mark: 'yes', label: "Rivals' new Google reviews, weekly", ledger: 'cap-reviews' },
  ads: { mark: 'yes', label: "Rivals' ads on Meta and Google", ledger: 'cap-ads' },
  gbp: { mark: 'yes', label: "Changes to rivals' Google Business Profiles", ledger: 'cap-gbp' },
  rankings: { mark: 'yes', label: 'Weekly map rankings across the service area', ledger: 'cap-rankings' },
  social: { mark: 'no', ledger: 'cap-social' },
  weeklyBrief: { mark: 'yes', label: 'A brief every Monday; your team can edit or approve it', ledger: 'cap-weeklyBrief' },
  evidenceLinks: { mark: 'yes', label: 'Every claim links to its evidence', ledger: 'cap-evidenceLinks' },
  assistant: { mark: 'yes', label: 'Friday answers with its sources, under the name you choose', ledger: 'cap-assistant' },
  mcp: { mark: 'yes', label: "AI tools that support MCP can read your clients' data", ledger: 'cap-mcp' },
  api: { mark: 'no', label: 'MCP instead', ledger: 'cap-api' },
  whiteLabel: {
    mark: 'partial',
    label: 'Your name, logo, colors, email sender and assistant name; your own web address is on the roadmap',
    ledger: 'cap-whiteLabel',
  },
  reseller: { mark: 'yes', label: 'Bill clients through your own Stripe account', ledger: 'cap-reseller' },
  publicPricing: {
    mark: 'yes',
    label: `$${P.monthlyUsd}/mo for the agency, ${P.seatsIncluded} client seats included, $${P.extraSeatUsd} per extra seat`,
    ledger: 'cap-publicPricing',
  },
  trial: { mark: 'yes', label: `${P.trialDays}-day free trial; one active client until you add a card`, ledger: 'cap-trial' },
};

const U: RivalCell = { mark: 'unknown' };

export const RIVALS: readonly Rival[] = [
  {
    slug: 'rivalmappd',
    name: 'RivalMappd',
    kind: 'Competitor reports and SEO content for local service businesses',
    factsCheckedOn: CHECKED,
    summary:
      'RivalMappd sells competitor intelligence reports and SEO content to US local service businesses on a flat monthly subscription, and mentions white-label options for agencies.',
    facts: [
      {
        text: 'Describes itself as “Competitor intelligence reports and SEO content, delivered on a flat monthly subscription” for local service businesses such as HVAC, plumbing, dental, med spa and law.',
        source: 'rmp',
      },
      {
        text: 'Sells to businesses directly, and says “We offer white-label options for agencies managing multiple clients”, with an “Agency or reseller inquiry?” contact. What the white-label covers is not described.',
        source: 'rmp',
      },
      {
        text: 'Monitors Google Business Profiles, reviews (Google, Yelp), local search rankings, and ads from the Meta Ad Library and Google Ads Transparency Center (“every active Meta and Google ad”).',
        source: 'rmp',
      },
      { text: notListed('RivalMappd', 'website or promotion change tracking'), source: 'rmp' },
      {
        text: 'Reports are monthly; the Dominance plan adds “Bi-weekly competitor intel updates”. The initial report arrives within 5 business days.',
        source: 'rmp',
      },
      { text: notListed('RivalMappd', 'evidence links or snapshots; its sample report is a PDF'), source: 'rmp' },
      { text: notListed('RivalMappd', 'an AI assistant, an MCP server or an API'), source: 'rmp' },
      { text: 'Uses AI for blog content, which is “reviewed for local accuracy”.', source: 'rmp' },
      { text: 'Capterra lists the starter plan at $299/mo.', source: 'cap-rmp' },
    ],
    pricing: [
      { text: 'Starter: $299 per month (3 rivals, 2 blog posts).', source: 'rmp' },
      { text: 'Growth: $549 per month (5 rivals, 4 blog posts, up to 10 review responses).', source: 'rmp' },
      { text: 'Dominance: $799 per month.', source: 'rmp' },
      { text: '“No setup fees. No contracts.”', source: 'rmp' },
      { text: notListed('RivalMappd', 'a free trial'), source: 'rmp' },
    ],
    betterAt: [
      'Done-for-you work: blog posts, review responses, ad creative analysis and human review.',
    ],
    weDiffer: [
      { text: 'A brief every Monday, which your team can edit or approve before it goes out.', key: 'weeklyBrief' },
      { text: 'Every claim in the brief links to its evidence.', key: 'evidenceLinks' },
      { text: 'Self-serve software your agency runs for its clients, billed through your own Stripe account.', key: 'reseller' },
      { text: `Public pricing for agencies: $${P.monthlyUsd}/mo with ${P.seatsIncluded} client seats included.`, key: 'publicPricing' },
    ],
    cells: {
      websites: U,
      reviews: { mark: 'yes', label: 'Google, Yelp', source: 'rmp' },
      ads: { mark: 'yes', label: 'Meta and Google', source: 'rmp' },
      gbp: { mark: 'yes', source: 'rmp' },
      rankings: { mark: 'partial', label: 'Local search rankings', source: 'rmp' },
      social: U,
      weeklyBrief: { mark: 'text', label: 'Monthly report', source: 'rmp' },
      evidenceLinks: U,
      assistant: U,
      mcp: U,
      api: U,
      whiteLabel: { mark: 'partial', label: 'White-label options for agencies; scope not described', source: 'rmp' },
      reseller: { mark: 'partial', label: 'Agency or reseller inquiry contact', source: 'rmp' },
      publicPricing: { mark: 'yes', label: 'From $299/mo', source: 'rmp' },
      trial: U,
    },
  },
  {
    slug: 'brightlocal',
    name: 'BrightLocal',
    kind: 'Local-SEO toolkit',
    factsCheckedOn: CHECKED,
    summary:
      'BrightLocal is a local-SEO toolkit for agencies and businesses: rank tracking, listings audits, reputation tools and white-label reports, priced per location.',
    facts: [
      {
        text: 'The Track plan includes rank tracking for up to 100 keywords and four competitors, and a Google Business Profile audit benchmarked against competitors.',
        source: 'bl-price',
      },
      { text: 'Launched AI Insights in April 2026.', source: 'bl-pr' },
      {
        text: 'AI Insights analyses “your local presence and competition to provide prioritized actions”.',
        source: 'bl-ai',
      },
      { text: notListed('BrightLocal', 'competitor change alerts', 'AI roadmap page'), source: 'bl-ai' },
      {
        text: 'Its AI roadmap marks an AI chat assistant as “CONSIDERING”, and industry benchmarking as “CONSIDERING”.',
        source: 'bl-ai',
      },
      { text: 'White-label reports are included on all three plans.', source: 'bl-wl' },
      { text: 'Offers custom-priced “API Solutions”.', source: 'bl-price' },
    ],
    pricing: [
      { text: 'Track: $41 per month, or $31 per month billed annually, for 1 location.', source: 'bl-price' },
      { text: 'Manage: $54 per month, or $40 per month billed annually, for 1 location.', source: 'bl-price' },
      { text: 'Grow: $65 per month, or $49 per month billed annually, for 1 location.', source: 'bl-price' },
      { text: '14-day free trial, no card required.', source: 'bl-price' },
    ],
    betterAt: [
      'Citations, rank tracking and reputation tools in one toolkit.',
      'An API offering (custom-priced “API Solutions”).',
      'Per-location pricing from $31/mo billed annually.',
    ],
    weDiffer: [
      { text: "Watches rivals' moves: their ads on Meta and Google, new Google reviews and profile changes.", key: 'ads' },
      { text: 'Explains them in a brief every Monday.', key: 'weeklyBrief' },
      { text: 'Every claim in the brief links to its evidence.', key: 'evidenceLinks' },
    ],
    cells: {
      websites: U,
      reviews: U,
      ads: U,
      gbp: { mark: 'partial', label: 'Profile audit benchmarked against competitors', source: 'bl-price' },
      rankings: { mark: 'partial', label: 'Up to 100 keywords and four competitors (Track)', source: 'bl-price' },
      social: U,
      weeklyBrief: U,
      evidenceLinks: U,
      assistant: { mark: 'text', label: 'Considering (roadmap)', source: 'bl-ai' },
      mcp: U,
      api: { mark: 'yes', label: 'Custom-priced API Solutions', source: 'bl-price' },
      whiteLabel: { mark: 'partial', label: 'White-label reports, all plans', source: 'bl-wl' },
      reseller: U,
      publicPricing: { mark: 'yes', label: 'From $41/mo per location ($31 billed annually)', source: 'bl-price' },
      trial: { mark: 'yes', label: '14 days, no card', source: 'bl-price' },
    },
  },
  {
    slug: 'local-falcon',
    name: 'Local Falcon',
    kind: 'Geo-grid rank tracker',
    factsCheckedOn: CHECKED,
    summary:
      'Local Falcon is a geo-grid rank tracker for enterprise brands, agencies and small businesses, with competitor reports, an AI agent and developer integrations, on credit-based pricing.',
    facts: [
      {
        text: 'Geo-grid rank tracking for “Enterprise brands, Agencies, and Small Businesses”. Competitor Reports cover rankings, visibility and share of voice.',
        source: 'lf',
      },
      { text: 'Also offers AI review analysis and Falcon Guard (Google Business Profile edit monitoring).', source: 'lf' },
      {
        text: 'Falcon Agent is a “conversational, agentic companion” that can act on Google Business Profiles and reviews.',
        source: 'lf',
      },
      { text: 'Lists an MCP server, an API, a Claude Connector and a ChatGPT plugin.', source: 'lf' },
      { text: 'Auto Scans can be scheduled; the cadence is not described.', source: 'lf' },
      { text: 'Lists White Label Reports; the plan that includes them is not described.', source: 'lf-price' },
    ],
    pricing: [
      { text: 'Starter $24.99, Basic $49.99, Pro $99.99 and Premium $199.99 per month (credit-based).', source: 'lf-price' },
      { text: 'Enterprise plans: $499 to $4,999 per month.', source: 'lf-price' },
      { text: '100 free credits on sign-up.', source: 'lf-price' },
    ],
    betterAt: [
      'Depth of geo-grid rank tracking.',
      'Visibility tracking on AI platforms.',
      'Falcon Agent, which can act on Google Business Profiles and reviews.',
      'API, MCP, Claude Connector and ChatGPT plugin integrations.',
      'Credit-based pricing from $24.99/mo.',
    ],
    weDiffer: [
      { text: 'Map rankings are one input to the brief, alongside reviews, ads and profile changes.', key: 'rankings' },
      { text: 'A brief every Monday, which your team can edit or approve before it goes out.', key: 'weeklyBrief' },
      { text: 'Every claim in the brief links to its evidence.', key: 'evidenceLinks' },
    ],
    cells: {
      websites: U,
      reviews: U,
      ads: U,
      gbp: U,
      rankings: { mark: 'yes', label: 'Geo-grid with competitor reports', source: 'lf' },
      social: U,
      weeklyBrief: U,
      evidenceLinks: U,
      assistant: { mark: 'yes', label: 'Falcon Agent', source: 'lf' },
      mcp: { mark: 'yes', source: 'lf' },
      api: { mark: 'yes', source: 'lf' },
      whiteLabel: { mark: 'partial', label: 'White Label Reports', source: 'lf-price' },
      reseller: U,
      publicPricing: { mark: 'yes', label: 'From $24.99/mo (credits)', source: 'lf-price' },
      trial: { mark: 'partial', label: '100 free credits on sign-up', source: 'lf-price' },
    },
  },
  {
    slug: 'birdeye',
    name: 'Birdeye',
    kind: 'Reputation and customer-experience suite (Competitors AI)',
    factsCheckedOn: CHECKED,
    summary:
      'Birdeye Competitors AI benchmarks local brands against competitors on reviews and social, inside the wider Birdeye reputation suite, with a reseller program for agencies.',
    facts: [
      {
        text: 'Competitors AI is AI competitor benchmarking on reviews and social (posting frequency, audience growth, engagement), with automatic competitor detection, “contextual summaries, and actionable recommendations”.',
        source: 'be',
      },
      { text: 'It sits under Robin (“CX coworker”) and is aimed at “local brands”.', source: 'be' },
      { text: notListed('Birdeye', 'website, ad or ranking monitoring', 'Competitors AI page'), source: 'be' },
      { text: 'Describes “real-time tracking”; a report schedule is not described.', source: 'be' },
      {
        text: 'Its reseller program lets agencies “whitelabel the platform or use it in a co-branded way”, with an agency dashboard and a partner success manager.',
        source: 'be-res',
      },
    ],
    pricing: [
      { text: 'Pricing is by quote, based on the number of locations.', source: 'be-price' },
      { text: notListed('Birdeye', 'a free trial; it offers a demo'), source: 'be' },
    ],
    betterAt: [
      'The full reputation and customer-experience suite.',
      'An established reseller program, with an agency dashboard and a partner success manager.',
      'Scale for brands with many locations.',
    ],
    weDiffer: [
      { text: "Watches rivals' ads on Meta and Google.", key: 'ads' },
      { text: 'Weekly map rankings across the service area.', key: 'rankings' },
      { text: 'Every claim in the brief links to its evidence.', key: 'evidenceLinks' },
      { text: `Public pricing: $${P.monthlyUsd}/mo for the agency, ${P.seatsIncluded} client seats included.`, key: 'publicPricing' },
    ],
    cells: {
      websites: U,
      reviews: { mark: 'yes', source: 'be' },
      ads: U,
      gbp: U,
      rankings: U,
      social: { mark: 'yes', label: 'Posting frequency, audience growth, engagement', source: 'be' },
      weeklyBrief: U,
      evidenceLinks: U,
      assistant: { mark: 'partial', label: 'AI summaries and recommendations', source: 'be' },
      mcp: U,
      api: U,
      whiteLabel: { mark: 'yes', label: 'Through the reseller program', source: 'be-res' },
      reseller: { mark: 'yes', source: 'be-res' },
      publicPricing: { mark: 'text', label: 'By quote', source: 'be-price' },
      trial: U,
    },
  },
  {
    slug: 'visualping',
    name: 'Visualping',
    kind: 'Website change monitor',
    factsCheckedOn: CHECKED,
    summary:
      'Visualping is a general-purpose website change monitor, with screenshots of each change, AI summary reports, an API and an MCP server.',
    facts: [
      {
        text: 'A general-purpose website change monitor. Each change shows “Side-by-side CURRENT and PREVIOUS screenshots”.',
        source: 'vp-rep',
      },
      { text: 'Reports launched on Mar 12, 2026.', source: 'vp-q1' },
      {
        text: 'Reports give an AI summary across selected changes, on a schedule: “Daily is the most common starting point”.',
        source: 'vp-rep',
      },
      { text: 'Reports are “included free with all Business plans”.', source: 'vp-rep' },
      { text: 'A REST API and an MCP server “come with every plan, including the free one”.', source: 'vp-price' },
      { text: 'The Visualping assistant (AI chat) launched on Aug 24, 2026, in beta.', source: 'vp-q3' },
      { text: notListed('Visualping', 'white-label', 'pricing page'), source: 'vp-price' },
    ],
    pricing: [
      { text: 'Free: $0.', source: 'vp-price' },
      { text: 'Personal 1K / 5K / 10K: $14 / $35 / $70 per month.', source: 'vp-price' },
      { text: 'Business 20K to 50K: $140 to $350 per month, or $100 to $250 per month billed annually.', source: 'vp-price' },
      { text: 'Solutions: custom pricing.', source: 'vp-price' },
      { text: 'Business trial: 14 days, no card required.', source: 'vp-price' },
    ],
    betterAt: [
      'Monitoring any web page, not just local businesses.',
      'Checks on a schedule you choose.',
      'Side-by-side screenshots of each change.',
      'A REST API and an MCP server on every plan, including the free one.',
      'A free tier.',
    ],
    weDiffer: [
      { text: "Local context: rivals' new Google reviews and Google Business Profile changes.", key: 'gbp' },
      { text: "Rivals' ads on Meta and Google.", key: 'ads' },
      { text: 'Weekly map rankings across the service area.', key: 'rankings' },
      { text: 'A plain-English brief every Monday that your team can edit or approve.', key: 'weeklyBrief' },
    ],
    cells: {
      websites: { mark: 'yes', label: 'Any web page, with screenshots', source: 'vp-rep' },
      reviews: U,
      ads: U,
      gbp: U,
      rankings: U,
      social: U,
      weeklyBrief: { mark: 'partial', label: 'Scheduled AI summary reports', source: 'vp-rep' },
      evidenceLinks: { mark: 'partial', label: 'Screenshots of each change', source: 'vp-rep' },
      assistant: { mark: 'yes', label: 'Beta', source: 'vp-q3' },
      mcp: { mark: 'yes', label: 'Every plan', source: 'vp-price' },
      api: { mark: 'yes', label: 'Every plan', source: 'vp-price' },
      whiteLabel: U,
      reseller: U,
      publicPricing: { mark: 'yes', label: 'Free tier; paid from $14/mo', source: 'vp-price' },
      trial: { mark: 'yes', label: 'Free plan; 14-day Business trial', source: 'vp-price' },
    },
  },
];

/** Hub table (spec § 7.5): descriptive, "typically …" for categories. Owner signs. */
export const CATEGORY_TABLE: { columns: string[]; rows: { label: string; cells: string[] }[] } = {
  columns: ['Rival Monday', 'DIY spreadsheets', 'Local-SEO toolkits', 'Reputation suites'],
  rows: [
    {
      label: 'What gets watched',
      cells: [
        "Rivals' Google reviews, Google Business Profiles, Meta and Google ads, and map rankings",
        'Whatever someone checks by hand',
        'Typically your own rankings and listings, with some competitor benchmarks',
        'Typically your own reviews and social, with competitor benchmarks',
      ],
    },
    {
      label: 'How often',
      cells: [
        'A brief every Monday, plus alerts on big moves',
        'Whenever someone has time',
        'Typically scheduled or on-demand reports',
        'Typically live dashboards',
      ],
    },
    {
      label: 'Evidence',
      cells: [
        'Every claim links to its evidence',
        'Screenshots, if someone saves them',
        'Typically charts and audit scores',
        'Typically review feeds and dashboards',
      ],
    },
    {
      label: 'Under your brand',
      cells: [
        'Your name, logo, colors, email sender and assistant name; your own web address is on the roadmap',
        'Your own templates',
        'Typically white-label reports',
        'Typically through a reseller program',
      ],
    },
    {
      label: 'Pricing',
      cells: [
        `$${P.monthlyUsd}/mo for the agency, ${P.seatsIncluded} client seats included`,
        "Your team's time",
        'Typically per location',
        'Typically by quote, per location',
      ],
    },
  ],
};

/** Named compare pages switched on by `NEXT_PUBLIC_COMPARE_PAGES`, in RIVALS order. */
export function enabledRivals(list: readonly string[] = siteEnv.comparePages): Rival[] {
  return RIVALS.filter((r) => list.includes(r.slug));
}

export const comparePageEntry = (r: Rival): { slug: string; title: string; description: string; crumb: string } => ({
  slug: r.slug,
  title: `Rival Monday vs ${r.name}`,
  description: `How Rival Monday compares with ${r.name}: what each watches, how often, and pricing, from public pages checked ${formatFactDate(r.factsCheckedOn)}.`,
  crumb: r.name,
});

/** Trust lines (plan P16). Owner signs. */
export const COMPARE_COPY: { asOf: (date: string) => string; trademark: (name: string) => string; corrections: string } = {
  asOf: (date) => `Information as of ${formatFactDate(date)}, from public vendor pages.`,
  trademark: (name) => `${name} is a trademark of its owner; Rival Monday is not affiliated with ${name}.`,
  corrections: 'Spotted something out of date or wrong? Email support@rivalmonday.app and we will correct it.',
};
