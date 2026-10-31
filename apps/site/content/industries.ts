// Draft copy: owner signs. Industry landing pages (SEO). Product statements use only the claims ledger's allowed
// wording (docs/research/2026-10-29-phase-17c-claim-check.md: cap-*, src-*); website monitoring follows
// WEBSITE_MONITORING_LIVE. "What rivals change", keyword and brief lines are illustrative examples of the trade,
// not product claims and not data. No customer names, counts or results (no social proof exists yet).
import type { Source } from './sources';
import { WEBSITE_MONITORING_LIVE } from './website-monitoring';

export interface Industry {
  slug: 'hvac' | 'plumbing' | 'dental' | 'roofing' | 'electrical' | 'landscaping' | 'pest-control' | 'cleaning' | 'auto-repair' | 'med-spas' | 'veterinary' | 'law-firms' | 'salons';
  /** Short name used in links and the footer. */
  name: string;
  /** Reads in "What {rivals} change". */
  rivals: string;
  /** Reads in "Map keywords {clientLabel} client might track". */
  clientLabel: string;
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
  a: 'No. Briefs, emails and client pages carry your agency name, logo and colors, and the assistant runs under the name you choose.',
};
const FAQ_REVIEW = {
  q: 'Can we check a brief before it goes to the client?',
  a: 'Yes. A brief arrives every Monday, and your team can edit or approve it first.',
};
const FAQ_PATIENT = {
  q: 'Does it read patient information?',
  a: 'No. It reads public information only. Reviewer names are pseudonymized and contact details are removed before anything is stored.',
};
const faqWatch = (trade: string) => ({
  q: `Which ${trade} competitors does it watch?`,
  a: 'When you add a client, we search its service area and suggest the competitors that matter, ranked Top rival, Worth watching or Minor. You pick which ones to follow.',
});
const faqKeywords = (a: string, b: string) => ({
  q: 'Which searches does the map scan cover?',
  a: `Up to five keywords per client, such as “${a}” or “${b}”, scanned weekly on a grid of points across the service area.`,
});

export const INDUSTRIES: readonly Industry[] = [
  {
    slug: 'hvac',
    name: 'HVAC',
    rivals: 'HVAC rivals',
    clientLabel: 'an HVAC',
    h1: 'Competitor monitoring for HVAC companies',
    lead: 'Heating and air is won on the map, on price and on the season. Rival Monday watches each client’s local HVAC rivals and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Seasonal offers', body: 'A rival launches a fall furnace tune-up or a summer AC check special and pushes it with paid ads.', source: 'ads' },
      { title: 'Financing pushes', body: 'Ads for 0% financing on new systems usually mean a rival is chasing replacement jobs, the biggest tickets in the trade.', source: 'ads' },
      { title: 'Map position', body: 'A rival climbs into the map top 3 for “ac repair” in the neighborhoods your client depends on.', source: 'local-map-rankings' },
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
    rivals: 'plumbing rivals',
    clientLabel: 'a plumbing',
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
    rivals: 'nearby practices',
    clientLabel: 'a dental',
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
        a: 'No. It reads public information only. Reviewer names are pseudonymized and contact details are removed before anything is stored.',
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
  {
    slug: 'roofing',
    name: 'Roofing',
    rivals: 'roofing rivals',
    clientLabel: 'a roofing',
    h1: 'Competitor monitoring for roofing companies',
    lead: 'Roofing work comes in waves after storms, and homeowners call whoever they find first and trust most. Rival Monday watches each client’s local roofing rivals and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Storm campaigns', body: 'A rival starts ads for free roof inspections right after a hail or wind event.', source: 'ads' },
      { title: 'Financing offers', body: 'Ads for monthly payments on a full replacement show a rival chasing the biggest jobs.', source: 'ads' },
      { title: 'Map position', body: 'A rival climbs into the map top 3 for “roof repair” in the suburbs your client works.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A rival adds “gutter installation” as a category or changes its hours for storm season.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews praise clean job sites, or complain about leaks and slow callbacks.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A rival hires crew leads or a sales rep, a hint it is taking on more jobs.', source: 'job-postings' },
    ],
    keywordExamples: ['roofer near me', 'roof repair', 'roof replacement', 'storm damage roof repair', 'metal roofing'],
    briefExamples: [
      'A rival started two Meta ads offering free roof inspections.',
      'A rival now ranks in the map top 3 for “roof repair” at more points across the service area than last week.',
      'A rival added gutter installation as a category on its Google Business Profile.',
    ],
    faq: [faqWatch('roofing'), faqKeywords('roof repair', 'roof replacement'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'map-rank-grid'],
    seo: {
      title: 'Competitor monitoring for roofers',
      description: 'Weekly, evidence-backed briefs on your roofing clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'Roofing',
    },
  },
  {
    slug: 'electrical',
    name: 'Electrical',
    rivals: 'electrical rivals',
    clientLabel: 'an electrical',
    h1: 'Competitor monitoring for electricians',
    lead: 'Electrical jobs start with an urgent search or a new project, and both go to the name at the top of the map. Rival Monday watches each client’s local electrical rivals and sends a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'New services', body: 'A rival advertises EV charger installation or home generators, a sign of where it wants to grow.', source: 'ads' },
      { title: 'Emergency positioning', body: 'Ads for same-day or 24/7 callouts aim straight at urgent searches.', source: 'ads' },
      { title: 'Map position', body: 'A rival overtakes your client for “electrician near me” in part of the service area.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A rival adds “lighting contractor” as a category or extends its weekend hours.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews mention punctuality and fair pricing, or surprise charges on the invoice.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A rival hires journeyman electricians, a hint it is adding capacity.', source: 'job-postings' },
    ],
    keywordExamples: ['electrician near me', 'emergency electrician', 'panel upgrade', 'ev charger installation', 'lighting installation'],
    briefExamples: [
      'A rival started a Google ad for EV charger installation.',
      'A rival overtook you in the map top 3 for “electrician near me” on the north side of the service area.',
      'A rival extended its Saturday hours on its Google Business Profile.',
    ],
    faq: [faqWatch('electrical'), faqKeywords('electrician near me', 'panel upgrade'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'competitor-monitoring-checklist'],
    seo: {
      title: 'Competitor monitoring for electricians',
      description: 'Weekly, evidence-backed briefs on your electrical clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'Electrical',
    },
  },
  {
    slug: 'landscaping',
    name: 'Landscaping',
    rivals: 'landscaping rivals',
    clientLabel: 'a landscaping',
    h1: 'Competitor monitoring for landscaping companies',
    lead: 'Landscaping contracts get signed in a short spring window, and rivals move early to lock them in. Rival Monday watches each client’s local landscaping rivals and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Seasonal offers', body: 'A rival advertises spring clean-ups or a discount for signing a full-season lawn contract early.', source: 'ads' },
      { title: 'Bigger projects', body: 'Ads for patios and outdoor kitchens show a rival moving from mowing into design and build work.', source: 'ads' },
      { title: 'Map position', body: 'A rival moves into the map top 3 for “lawn care” in the neighborhoods your client serves.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A rival adds “snow removal” as a category to keep its crews busy through winter.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews praise reliable weekly visits, or complain about missed ones.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A rival hires seasonal crews or a foreman, a sign it has sold more work.', source: 'job-postings' },
    ],
    keywordExamples: ['landscaper near me', 'lawn care', 'landscape design', 'yard clean up', 'patio installation'],
    briefExamples: [
      'A rival started a Meta ad offering a discount on full-season lawn contracts.',
      'A rival added snow removal as a category on its Google Business Profile.',
      'A rival now ranks in the map top 3 for “lawn care” at more points across the service area than last week.',
    ],
    faq: [faqWatch('landscaping'), faqKeywords('lawn care', 'landscape design'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'map-rank-grid'],
    seo: {
      title: 'Competitor monitoring for landscapers',
      description: 'Weekly, evidence-backed briefs on your landscaping clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'Landscaping',
    },
  },
  {
    slug: 'pest-control',
    name: 'Pest control',
    rivals: 'pest control rivals',
    clientLabel: 'a pest control',
    h1: 'Competitor monitoring for pest control companies',
    lead: 'Pest control customers search when the problem is already in the house, then stay for years if the plan is right. Rival Monday watches each client’s local rivals and sends a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Plan offers', body: 'A rival advertises a low first visit on a quarterly plan, aimed at long-term customers.', source: 'ads' },
      { title: 'Seasonal pushes', body: 'Ads for termite inspections or mosquito treatment show what a rival expects to sell this season.', source: 'ads' },
      { title: 'Map position', body: 'A rival climbs into the map top 3 for “exterminator near me” around your client’s best areas.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A rival adds “termite control” as a category or opens on Saturdays.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews mention whether the problem came back, the detail buyers read first.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A rival hires technicians or sales reps, a sign it is building its routes.', source: 'job-postings' },
    ],
    keywordExamples: ['pest control near me', 'exterminator', 'termite inspection', 'bed bug treatment', 'rodent control'],
    briefExamples: [
      'A rival started a Google ad offering a low first visit on a quarterly plan.',
      'A rival added termite control as a category on its Google Business Profile.',
      'A rival overtook you in the map top 3 for “exterminator” in part of the service area.',
    ],
    faq: [faqWatch('pest control'), faqKeywords('pest control near me', 'termite inspection'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'competitor-monitoring-checklist'],
    seo: {
      title: 'Competitor monitoring for pest control',
      description: 'Weekly, evidence-backed briefs on your pest control clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'Pest control',
    },
  },
  {
    slug: 'cleaning',
    name: 'Cleaning',
    rivals: 'cleaning rivals',
    clientLabel: 'a cleaning',
    h1: 'Competitor monitoring for cleaning companies',
    lead: 'Cleaning customers choose on trust and price, and a good recurring client is worth years of work. Rival Monday watches each client’s local cleaning rivals and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'First-clean offers', body: 'A rival advertises a discount on the first clean to win recurring customers.', source: 'ads' },
      { title: 'New markets', body: 'Ads for office or move-out cleaning show a rival going after new kinds of work.', source: 'ads' },
      { title: 'Map position', body: 'A rival moves into the map top 3 for “house cleaning” in the areas your client serves.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A rival adds “carpet cleaning” as a category or changes its opening hours.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews mention trust, punctuality and thoroughness, or staff who keep changing.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A rival hires cleaners or a team lead, a hint that demand is outrunning its crew.', source: 'job-postings' },
    ],
    keywordExamples: ['house cleaning near me', 'maid service', 'deep cleaning', 'move out cleaning', 'office cleaning'],
    briefExamples: [
      'A rival started a Meta ad offering a discount on the first clean.',
      'A rival added carpet cleaning as a category on its Google Business Profile.',
      'A rival now ranks in the map top 3 for “house cleaning” at more points across the service area than last week.',
    ],
    faq: [faqWatch('cleaning'), faqKeywords('house cleaning', 'deep cleaning'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'competitor-monitoring-checklist'],
    seo: {
      title: 'Competitor monitoring for cleaning companies',
      description: 'Weekly, evidence-backed briefs on your cleaning clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'Cleaning',
    },
  },
  {
    slug: 'auto-repair',
    name: 'Auto repair',
    rivals: 'nearby shops',
    clientLabel: 'an auto repair',
    h1: 'Competitor monitoring for auto repair shops',
    lead: 'Drivers pick a shop close by with reviews they believe, often with the car already making the noise. Rival Monday watches each client’s nearby shops and sends a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Service specials', body: 'A nearby shop advertises an oil change or brake special to bring in new customers.', source: 'ads' },
      { title: 'Specialist work', body: 'Ads for hybrid or European car repair show a shop chasing higher-value jobs.', source: 'ads' },
      { title: 'Map position', body: 'A shop moves into the map top 3 for “auto repair near me” in the streets around your client.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A shop adds Saturday hours or “tire shop” as a category.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews mention honest quotes and fast turnaround, or repairs that didn’t hold.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A shop hires a mechanic or a service advisor, often a sign it is adding bays or hours.', source: 'job-postings' },
    ],
    keywordExamples: ['auto repair near me', 'mechanic', 'brake repair', 'oil change', 'check engine light'],
    briefExamples: [
      'A nearby shop started a Google ad for a brake special.',
      'A nearby shop added Saturday hours to its Google Business Profile.',
      'A shop now ranks in the map top 3 for “auto repair near me” around your client’s location.',
    ],
    faq: [faqWatch('auto repair'), faqKeywords('mechanic', 'brake repair'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'map-rank-grid'],
    seo: {
      title: 'Competitor monitoring for auto repair',
      description: 'Weekly, evidence-backed briefs on your auto repair clients’ nearby shops: map rankings, ads, reviews and hours, under your agency brand.',
      crumb: 'Auto repair',
    },
  },
  {
    slug: 'med-spas',
    name: 'Med spas',
    rivals: 'nearby med spas',
    clientLabel: 'a med spa',
    h1: 'Competitor monitoring for med spas',
    lead: 'Med spa clients compare offers, results and reviews before they book a consultation. Rival Monday watches each client’s nearby med spas and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Treatment offers', body: 'A nearby med spa advertises a price on injectables or a laser package.', source: 'ads' },
      { title: 'Memberships', body: 'Ads for a monthly membership show a rival trying to lock in repeat visits.', source: 'ads' },
      { title: 'Map position', body: 'A med spa moves into the map top 3 for “med spa near me” around your client’s location.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A med spa adds evening hours or “laser hair removal” as a category.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews mention results and bedside manner, or a hard sell at the appointment.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A med spa hires a nurse injector, often a sign it is adding appointments.', source: 'job-postings' },
    ],
    keywordExamples: ['med spa near me', 'laser hair removal', 'lip filler', 'facial treatment', 'body contouring'],
    briefExamples: [
      'A nearby med spa started a Meta ad for a monthly membership.',
      'A nearby med spa added evening hours to its Google Business Profile.',
      'A med spa now ranks in the map top 3 for “med spa near me” around your client’s location.',
    ],
    faq: [FAQ_PATIENT, faqWatch('med spa'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'competitor-monitoring-checklist'],
    seo: {
      title: 'Competitor monitoring for med spas',
      description: 'Weekly, evidence-backed briefs on your med spa clients’ nearby rivals: offers, reviews, hours and map rankings, under your agency brand.',
      crumb: 'Med spas',
    },
  },
  {
    slug: 'veterinary',
    name: 'Veterinary',
    rivals: 'nearby clinics',
    clientLabel: 'a veterinary',
    h1: 'Competitor monitoring for veterinary clinics',
    lead: 'Pet owners stay with a vet for years, and most choose one from the map and its reviews. Rival Monday watches each client’s nearby clinics and sends a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'New-client offers', body: 'A nearby clinic advertises a discounted first exam or puppy and kitten package.', source: 'ads' },
      { title: 'Wellness plans', body: 'Ads for monthly wellness plans show a clinic working to keep clients year-round.', source: 'ads' },
      { title: 'Convenience', body: 'A clinic adds evening or Sunday hours to its Google Business Profile.', source: 'google-business-profile' },
      { title: 'Map position', body: 'A clinic moves into the map top 3 for “vet near me” in the neighborhoods around your client.', source: 'local-map-rankings' },
      { title: 'Review themes', body: 'New reviews mention gentle handling and clear pricing, or long waits and surprise bills.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A clinic hires an associate vet or a technician, often a sign it is adding appointments.', source: 'job-postings' },
    ],
    keywordExamples: ['vet near me', 'emergency vet', 'animal hospital', 'pet vaccinations', 'dog dental cleaning'],
    briefExamples: [
      'A nearby clinic started a Meta ad for a discounted first exam.',
      'A nearby clinic added Sunday hours to its Google Business Profile.',
      'A clinic now ranks in the map top 3 for “vet near me” around your client’s location.',
    ],
    faq: [faqWatch('veterinary'), faqKeywords('vet near me', 'emergency vet'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'map-rank-grid'],
    seo: {
      title: 'Competitor monitoring for vet clinics',
      description: 'Weekly, evidence-backed briefs on your veterinary clients’ nearby clinics: reviews, offers, hours and map rankings, under your agency brand.',
      crumb: 'Veterinary',
    },
  },
  {
    slug: 'law-firms',
    name: 'Law firms',
    rivals: 'local firms',
    clientLabel: 'a law firm',
    h1: 'Competitor monitoring for local law firms',
    lead: 'People looking for a lawyer search close to home, read reviews and call only a few firms. Rival Monday watches each client’s local firms and turns what changed into a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'Consultation offers', body: 'A local firm advertises free consultations or flat fees for a common matter.', source: 'ads' },
      { title: 'New practice areas', body: 'Ads for estate planning or family law show which work a firm is moving into.', source: 'ads' },
      { title: 'Map position', body: 'A firm moves into the map top 3 for “divorce lawyer near me” around your client’s office.', source: 'local-map-rankings' },
      { title: 'Profile changes', body: 'A firm adds “estate planning attorney” as a category or changes its office hours.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews mention how well a firm kept clients informed, or how hard it was to reach.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A firm hires an associate or a paralegal, a hint it is taking on more cases.', source: 'job-postings' },
    ],
    keywordExamples: ['lawyer near me', 'divorce lawyer', 'personal injury attorney', 'estate planning attorney', 'criminal defense lawyer'],
    briefExamples: [
      'A local firm started a Google ad offering free consultations.',
      'A local firm added estate planning attorney as a category on its Google Business Profile.',
      'A firm now ranks in the map top 3 for “divorce lawyer near me” around your client’s office.',
    ],
    faq: [
      {
        q: 'Does it read client or case information?',
        a: 'No. It reads public information only. Reviewer names are pseudonymized and contact details are removed before anything is stored.',
      },
      faqWatch('law firm'),
      FAQ_EVIDENCE,
      FAQ_BRAND,
      FAQ_REVIEW,
    ],
    guides: ['local-competitor-analysis', 'competitor-monitoring-checklist'],
    seo: {
      title: 'Competitor monitoring for law firms',
      description: 'Weekly, evidence-backed briefs on your law firm clients’ local rivals: map rankings, ads, reviews and profile changes, under your agency brand.',
      crumb: 'Law firms',
    },
  },
  {
    slug: 'salons',
    name: 'Salons',
    rivals: 'nearby salons',
    clientLabel: 'a salon',
    h1: 'Competitor monitoring for hair and beauty salons',
    lead: 'Salon clients are loyal once they find the right chair, and they find it through the map and reviews. Rival Monday watches each client’s nearby salons and sends a short, evidence-backed brief every Monday, under your agency’s brand.',
    rivalMoves: [
      { title: 'New-client offers', body: 'A nearby salon advertises a discount on a first cut and color.', source: 'ads' },
      { title: 'Seasonal pushes', body: 'Ads for bridal packages or holiday gift cards show what a salon is selling next.', source: 'ads' },
      { title: 'Map position', body: 'A salon moves into the map top 3 for “hair salon near me” in the streets around your client.', source: 'local-map-rankings' },
      { title: 'Convenience', body: 'A salon adds late evening or Sunday hours to its Google Business Profile.', source: 'google-business-profile' },
      { title: 'Review themes', body: 'New reviews name what clients love, or mention rushed appointments.', source: 'google-reviews' },
      { title: 'Hiring', body: 'A salon hires a stylist, a sign it has chairs to fill or clients to serve.', source: 'job-postings' },
    ],
    keywordExamples: ['hair salon near me', 'balayage', 'barber shop', 'nail salon', 'bridal hair'],
    briefExamples: [
      'A nearby salon started a Meta ad offering a discount on a first cut and color.',
      'A nearby salon added Sunday hours to its Google Business Profile.',
      'A salon now ranks in the map top 3 for “hair salon near me” around your client’s location.',
    ],
    faq: [faqWatch('salon'), faqKeywords('hair salon near me', 'barber shop'), FAQ_EVIDENCE, FAQ_BRAND, FAQ_REVIEW],
    guides: ['local-competitor-analysis', 'map-rank-grid'],
    seo: {
      title: 'Competitor monitoring for salons',
      description: 'Weekly, evidence-backed briefs on your salon clients’ nearby rivals: reviews, offers, hours and map rankings, under your agency brand.',
      crumb: 'Salons',
    },
  },
];

export const INDUSTRIES_PAGE = {
  eyebrow: 'Who it’s for',
  h1: 'Competitor monitoring for local-service businesses',
  lead: 'Rival Monday is built for agencies whose clients win work locally: on the map, in reviews and with offers. These pages show what it watches for each trade.',
  seo: {
    title: 'Competitor monitoring by industry',
    description: 'What Rival Monday watches for local businesses, from HVAC and dental to law firms and salons: map rankings, ads, reviews, profiles and hiring.',
    crumb: 'Industries',
  },
} as const;

/** Ledger: ind-any. The app's business-type catalog is open, and collection doesn't depend on the trade. */
export const ANY_INDUSTRY = {
  heading: 'Works well with any industry',
  body: 'These trades are examples. Any local business works the same way: we search its area, suggest the rivals that matter and watch them every week.',
  link: 'See what it watches, by industry →',
} as const;

/** Examples in the announcement bar that have an industry page (rendered as a quiet link). */
export const INDUSTRY_EXAMPLE_LINKS: Readonly<Record<string, string>> = {
  HVAC: '/for/hvac',
  plumbing: '/for/plumbing',
  dental: '/for/dental',
  roofing: '/for/roofing',
  electrical: '/for/electrical',
  landscaping: '/for/landscaping',
  'pest control': '/for/pest-control',
  cleaning: '/for/cleaning',
  'auto repair': '/for/auto-repair',
  'med spas': '/for/med-spas',
  veterinary: '/for/veterinary',
  'law firms': '/for/law-firms',
  salons: '/for/salons',
};
