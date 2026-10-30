// Draft copy: owner signs. Industry landing pages (SEO). Product statements use only the claims ledger's allowed
// wording (docs/research/2026-10-29-phase-17c-claim-check.md: cap-*, src-*); website monitoring follows
// WEBSITE_MONITORING_LIVE. "What rivals change", keyword and brief lines are illustrative examples of the trade,
// not product claims and not data. No customer names, counts or results (no social proof exists yet).
import type { Source } from './sources';
import { WEBSITE_MONITORING_LIVE } from './website-monitoring';

export interface Industry {
  slug: 'hvac' | 'plumbing' | 'dental';
  /** Short name used in links and the footer. */
  name: string;
  h1: string;
  lead: string;
  /** What local rivals in this trade tend to change; each is something the product's sources can see. */
  rivalMoves: { title: string; body: string; source: Source['slug'] }[];
  /** Example map keywords for a client in this trade (a client tracks up to five). */
  keywordExamples: string[];
  /** Example brief lines, written the way a Monday brief reads. Illustrative. */
  briefExamples: string[];
  faq: { q: string; a: string }[];
  /** Related guides by slug (content/guides.ts). */
  guides: string[];
  seo: { title: string; description: string; crumb: string };
}

/** The website line follows the one switch: no claim of live website monitoring until it is on. */
export function websitesLine(live: boolean = WEBSITE_MONITORING_LIVE): string {
  return live ? 'Snapshots of rivals’ key pages, with changes flagged.' : 'Website snapshots of rivals’ key pages: switching on soon.';
}

/** What Rival Monday watches, in the ledger's wording; shared by every industry page. */
export function watchList(live: boolean = WEBSITE_MONITORING_LIVE): { source: Source['slug']; line: string }[] {
  return [
    { source: 'google-reviews', line: 'Rivals’ new Google reviews, weekly.' },
    { source: 'google-business-profile', line: 'Changes to rivals’ Google Business Profiles: categories, hours and rating.' },
    { source: 'ads', line: 'Rivals’ ads on Meta and Google.' },
    { source: 'local-map-rankings', line: 'Weekly map rankings across the service area, for up to five keywords.' },
    { source: 'job-postings', line: 'The roles rivals are hiring for, from public job listings.' },
    { source: 'competitor-websites', line: websitesLine(live) },
  ];
}

/** Shared answers, worded from the ledger (cap-weeklyBrief, cap-evidenceLinks, cap-whiteLabel, src-*). */
const FAQ_EVIDENCE = {
  q: 'Where does the information come from?',
  a: 'Public information only: Google reviews and Business Profiles, public map results, the Meta Ad Library, the Google Ads Transparency Center and public job listings. We never log in to any site to collect, and every claim in a brief links to the evidence behind it.',
};
const FAQ_BRAND = {
  q: 'Does my client see the Rival Monday name?',
  a: 'No. Briefs, emails and client pages carry your agency name, logo and colours, and the assistant runs under the name you choose.',
};
const FAQ_REVIEW = {
  q: 'Can we check a brief before it goes to the client?',
  a: 'Yes. A brief arrives every Monday, and your team can edit or approve it first.',
};

export const INDUSTRIES: readonly Industry[] = [
  {
    slug: 'hvac',
    name: 'HVAC',
    h1: 'Competitor monitoring for HVAC companies',
    lead: 'Heating and air is won on the map, on price and on the season. Rival Monday watches each client’s local HVAC rivals and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Seasonal offers', body: 'A rival launches a fall furnace tune-up or a summer AC check special and pushes it with paid ads.', source: 'ads' },
      { title: 'Financing pushes', body: 'Ads for 0% financing on new systems usually mean a rival is chasing replacement jobs, the biggest tickets in the trade.', source: 'ads' },
      { title: 'Map position', body: 'A rival climbs into the map top 3 for “ac repair” in the neighbourhoods your client depends on.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A rival adds “heat pump installer” as a category or extends its emergency hours on its Google Business Profile.', source: 'google-business-profile' },
      { title: 'Review momentum', body: 'A burst of new reviews mentioning fast emergency service, or a run of complaints about callbacks.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A rival hires install technicians, a hint it is about to grow its replacement work.', source: 'job-postings' },
    ],
    keywordExamples: ['ac repair', 'furnace repair', 'hvac company near me', 'heat pump installation', 'emergency ac repair'],
    briefExamples: [
      'A rival now ranks in the map top 3 for “ac repair” at more points across the service area than last week.',
      'A rival started two Meta ads offering 0% financing on new systems.',
      'A rival added heat pump installation to its services.',
    ],
    faq: [
      {
        q: 'Which HVAC competitors does it watch?',
        a: 'When you add a client, we search its service area and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick which ones to follow.',
      },
      {
        q: 'Which searches does the map scan cover?',
        a: 'Up to five keywords per client, such as “ac repair” or “furnace repair”, scanned weekly on a grid of points across the service area.',
      },
      FAQ_EVIDENCE,
      FAQ_BRAND,
      FAQ_REVIEW,
    ],
    guides: ['local-competitor-analysis', 'map-rank-grid'],
    seo: {
      title: 'Competitor monitoring for HVAC companies',
      description: 'Weekly, evidence-backed briefs on your HVAC clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'HVAC',
    },
  },
  {
    slug: 'plumbing',
    name: 'Plumbing',
    h1: 'Competitor monitoring for plumbing companies',
    lead: 'Plumbing calls go to whoever shows up first when the water is on the floor. Rival Monday watches each client’s local plumbing rivals, from the map to their ads, and sends a short, evidence-backed brief every Monday under your agency’s brand.',
    rivalMoves: [
      { title: 'Emergency positioning', body: 'A rival advertises 24/7 service or same-day callouts, aimed squarely at urgent searches.', source: 'ads' },
      { title: 'Map position', body: 'A rival overtakes your client for “emergency plumber” in part of the service area.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A rival adds “water heater installation” as a category or changes its weekend hours.', source: 'google-business-profile' },
      { title: 'Price signals', body: 'A rival advertises a flat drain-cleaning price or a water heater rebate.', source: 'ads' },
      { title: 'Review themes', body: 'New reviews praising (or complaining about) response times, a clue to how a rival actually performs.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A rival hires more plumbers or a dispatcher, a sign it is adding capacity.', source: 'job-postings' },
    ],
    keywordExamples: ['plumber near me', 'emergency plumber', 'drain cleaning', 'water heater repair', 'leak detection'],
    briefExamples: [
      'A rival overtook you in the map top 3 for “emergency plumber” on the east side of the service area.',
      'A rival started a Google ad offering a flat price for drain cleaning.',
      'A rival changed its Saturday hours on its Google Business Profile.',
    ],
    faq: [
      {
        q: 'Which plumbing competitors does it watch?',
        a: 'When you add a client, we search its service area and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick which ones to follow.',
      },
      {
        q: 'Can it track emergency searches?',
        a: 'Yes. Each client can have up to five map keywords, such as “emergency plumber”, scanned weekly across the service area.',
      },
      FAQ_EVIDENCE,
      FAQ_BRAND,
      FAQ_REVIEW,
    ],
    guides: ['local-competitor-analysis', 'competitor-monitoring-checklist'],
    seo: {
      title: 'Competitor monitoring for plumbing companies',
      description: 'Weekly, evidence-backed briefs on your plumbing clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'Plumbing',
    },
  },
  {
    slug: 'dental',
    name: 'Dental',
    h1: 'Competitor monitoring for dental practices',
    lead: 'New patients compare practices on reviews, offers and convenience before they ever call. Rival Monday watches each client’s nearby practices and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'New-patient offers', body: 'A nearby practice advertises a new-patient exam special or a whitening offer.', source: 'ads' },
      { title: 'Treatment pushes', body: 'Ads for clear aligners or implants signal which high-value treatments a rival is chasing.', source: 'ads' },
      { title: 'Convenience', body: 'A practice adds Saturday or evening hours to its Google Business Profile.', source: 'google-business-profile' },
      { title: 'Review momentum', body: 'A practice gains a run of new reviews, or reviews start mentioning wait times or billing.', source: 'google-reviews' },
      { title: 'Map position', body: 'A practice moves into the map top 3 for “dentist near me” in the streets around your client’s office.', source: 'local-map-rankings' },
      { title: 'Hiring', body: 'A practice hires an associate dentist or a hygienist, often a sign it is adding chairs or hours.', source: 'job-postings' },
    ],
    keywordExamples: ['dentist near me', 'emergency dentist', 'teeth whitening', 'dental implants', 'family dentist'],
    briefExamples: [
      'A nearby practice started a Meta ad for a new-patient exam and cleaning offer.',
      'A nearby practice added Saturday hours to its Google Business Profile.',
      'A practice now ranks in the map top 3 for “dentist near me” around your client’s office.',
    ],
    faq: [
      {
        q: 'Does it read patient information?',
        a: 'No. It reads public information only. Reviewer names are pseudonymised and contact details are removed before anything is stored.',
      },
      {
        q: 'Which practices does it watch?',
        a: 'When you add a client, we search the area around the practice and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick which ones to follow.',
      },
      FAQ_EVIDENCE,
      FAQ_BRAND,
      FAQ_REVIEW,
    ],
    guides: ['local-competitor-analysis', 'competitor-monitoring-checklist'],
    seo: {
      title: 'Competitor monitoring for dental practices',
      description: 'Weekly, evidence-backed briefs on your dental clients’ nearby practices: reviews, offers, hours and map rankings, under your agency brand.',
      crumb: 'Dental',
    },
  },
];

export const INDUSTRIES_PAGE = {
  eyebrow: 'Who it’s for',
  h1: 'Competitor monitoring for local-service businesses',
  lead: 'Rival Monday is built for agencies whose clients win work locally: on the map, in reviews and with offers. These pages show what it watches for each trade.',
  seo: {
    title: 'Competitor monitoring by industry',
    description: 'What Rival Monday watches for HVAC, plumbing and dental clients: map rankings, ads, reviews, profile changes and hiring.',
    crumb: 'Industries',
  },
} as const;

/** Examples in the announcement bar that have an industry page (rendered as a quiet link). */
export const INDUSTRY_EXAMPLE_LINKS: Readonly<Record<string, string>> = {
  HVAC: '/for/hvac',
  plumbing: '/for/plumbing',
  dental: '/for/dental',
};
