// Draft copy: owner signs. Every entry is checked against the claims ledger
// (docs/research/2026-10-29-phase-17c-claim-check.md, rows src-<slug>); evidence paths live in sources-evidence.ts.
// inTheBrief lines are illustrative examples, not product claims. competitor-websites is gated by WEB_MONITORING_ENABLED: the owner turns it on before this page deploys.
export interface Source {
  slug: 'competitor-websites' | 'google-reviews' | 'google-business-profile' | 'ads' | 'local-map-rankings' | 'job-postings';
  name: string;
  icon: 'globe' | 'star' | 'map-pin' | 'megaphone' | 'grid' | 'briefcase';
  oneLine: string;
  whatWeCollect: string[];
  howOften: string;
  whatWeDont: string[];
  inTheBrief: string;
  /** Feeds collectionPage(). */
  seo: { title: string; description: string; crumb: string };
}

const NO_LOGINS = 'We never log in to any site to collect, and we never use private data.';

export const SOURCES: readonly Source[] = [
  {
    slug: 'competitor-websites',
    name: 'Competitor websites',
    icon: 'globe',
    oneLine: "Snapshots of your rivals' key pages, with changes flagged.",
    whatWeCollect: [
      'A snapshot of each rival page we watch, such as services, pricing and offers, so a change can be shown against the earlier version.',
      'Only public pages. Our crawler identifies itself as RivalMondayBot, respects robots.txt, and waits at least 3 seconds between requests to the same site.',
    ],
    howOften: 'Daily or weekly for each page. Weekly during an open free trial.',
    whatWeDont: [NO_LOGINS, 'We do not read pages a site has asked crawlers to stay out of, and we do not try to get around a block.'],
    inTheBrief: 'A rival changes its offer or adds a service page, and the brief shows the page before and after.',
    seo: {
      title: 'Competitor website monitoring',
      description: "How Rival Monday snapshots your rivals' public web pages, respects robots.txt and flags what changed.",
      crumb: 'Competitor websites',
    },
  },
  {
    slug: 'google-reviews',
    name: 'Google reviews',
    icon: 'star',
    oneLine: "Your rivals' new Google reviews, weekly.",
    whatWeCollect: [
      "New public Google reviews on your rivals' listings: the rating, the text and the date.",
      'Reviewer names are pseudonymized and contact details are removed before a review is stored.',
    ],
    howOften: 'Weekly.',
    whatWeDont: [NO_LOGINS, 'We show reviewer names only in pseudonymized form, and we never keep contact details.'],
    inTheBrief: 'A burst of complaints about a rival, or a theme in what its customers praise, with the reviews linked as evidence.',
    seo: {
      title: 'Competitor Google reviews',
      description: "How Rival Monday collects your rivals' public Google reviews each week, with reviewer names pseudonymized.",
      crumb: 'Google reviews',
    },
  },
  {
    slug: 'google-business-profile',
    name: 'Google Business Profile',
    icon: 'map-pin',
    oneLine: "Changes to your rivals' Google Business Profile listings.",
    whatWeCollect: ['The public listing fields of each rival: its categories, opening hours and rating.'],
    howOften: 'Weekly.',
    whatWeDont: [NO_LOGINS, "We read the public listing only, never the owner's dashboard."],
    inTheBrief: "A rival extends its opening hours or adds a category, shown against the previous week's listing.",
    seo: {
      title: 'Google Business Profile monitoring',
      description: "How Rival Monday tracks changes to your rivals' public Google Business Profile listings every week.",
      crumb: 'Google Business Profile',
    },
  },
  {
    slug: 'ads',
    name: 'Ads on Meta and Google',
    icon: 'megaphone',
    oneLine: "Your rivals' ads on Meta and Google.",
    whatWeCollect: [
      'Ads your rivals are running, as listed in the Meta Ad Library.',
      'Ads your rivals are running, as listed in the Google Ads Transparency Center.',
    ],
    howOften: 'Weekly.',
    whatWeDont: [NO_LOGINS, 'We see only what the public ad libraries list.'],
    inTheBrief: 'A rival starts a new seasonal campaign, with the text of the ad where the library shows it.',
    seo: {
      title: 'Competitor ads on Meta and Google',
      description: "How Rival Monday follows your rivals' ads in the Meta Ad Library and the Google Ads Transparency Center.",
      crumb: 'Ads',
    },
  },
  {
    slug: 'local-map-rankings',
    name: 'Local map rankings',
    icon: 'grid',
    oneLine: 'Where you and your rivals show up on the map, across your service area.',
    whatWeCollect: [
      'A grid of points across your service area. At each point we record who ranks in the local map results.',
      'Up to five keywords per client.',
    ],
    howOften: 'Weekly, every Sunday. You can run one extra scan a week with "Scan now".',
    whatWeDont: [NO_LOGINS, 'We do not track individual searchers. A ranking is what a public map search shows at that point.'],
    inTheBrief: 'A rival moves ahead of you in one part of your service area.',
    seo: {
      title: 'Local map ranking grid',
      description: 'How Rival Monday scans local map rankings on a grid across your service area every Sunday.',
      crumb: 'Local map rankings',
    },
  },
  {
    slug: 'job-postings',
    name: 'Job postings',
    icon: 'briefcase',
    oneLine: 'The roles your rivals are hiring for.',
    whatWeCollect: ['Job listings on Google that match a rival, so you can see which roles it is hiring for.'],
    howOften: 'Weekly.',
    whatWeDont: [NO_LOGINS, 'We do not contact applicants or employers.'],
    inTheBrief: 'A rival hires a second crew lead or a new office role, a hint about where it is growing.',
    seo: {
      title: 'Competitor job postings',
      description: 'How Rival Monday follows the roles your rivals are hiring for, from public job listings, each week.',
      crumb: 'Job postings',
    },
  },
];

export const SOURCES_PAGE = {
  eyebrow: 'Sources',
  h1: 'What Rival Monday collects',
  lead: 'Everything comes from public information. Here is what we collect, how often, and what we leave alone.',
  trademarkNote:
    'Meta, Google and other names on this page are trademarks of their owners. We name them only to say where public information comes from. Listing a source does not mean its owner endorses Rival Monday.',
};

/**
 * Depth for each source page (SEO): why the signal matters to a local business, and short answers to the questions
 * agencies ask. Same rules as above: ledger wording for anything about Rival Monday, examples are illustrative.
 * `guide` links the page to the guide that goes deeper (content/guides.ts).
 */
export const SOURCE_DEPTH: Record<Source['slug'], { whyItMatters: readonly string[]; faq: readonly { q: string; a: string }[]; guide?: string }> = {
  'competitor-websites': {
    whyItMatters: [
      'A rival’s website is where prices, offers and services are stated in its own words. When a rival cuts a price, adds a service or launches a new offer, the website usually changes first.',
      'Seeing the page before and after makes the change concrete for a client: not “they seem cheaper now”, but the exact line that changed and when.',
    ],
    faq: [
      { q: 'Which pages are watched?', a: 'The pages that matter for each rival, such as services, pricing and offers. Each one is snapshotted so a change can be shown against the earlier version.' },
      { q: 'Does the crawler identify itself?', a: 'Yes. It identifies itself as RivalMondayBot, respects robots.txt and waits at least 3 seconds between requests to the same site.' },
    ],
    guide: 'competitor-monitoring-checklist',
  },
  'google-reviews': {
    whyItMatters: [
      'Reviews are often the last thing a customer reads before choosing a local business, and they say what customers really think of a rival: fast, fair, rude, late.',
      'Watching rivals’ new reviews each week shows momentum (a rival suddenly collecting reviews) and themes (repeated praise or complaints) that a client can answer in its own marketing.',
    ],
    faq: [
      { q: 'Are reviewer names shown?', a: 'Only in pseudonymized form. Reviewer names are pseudonymized and contact details are removed before a review is stored.' },
      { q: 'Does it reply to reviews?', a: 'No. It reads public reviews on rivals’ listings. It does not post or reply anywhere.' },
    ],
    guide: 'competitor-monitoring-checklist',
  },
  'google-business-profile': {
    whyItMatters: [
      'A Google Business Profile is the listing customers see on the map: its categories decide which searches a business can show up for, and its hours decide whether it looks open when someone needs help.',
      'Rivals change these quietly. A new category is often the first sign a rival is going after a service your client offers.',
    ],
    faq: [
      { q: 'Which fields are watched?', a: 'The public listing fields of each rival: its categories, opening hours and rating, compared week to week.' },
      { q: 'Does it need access to the rival’s account?', a: 'No. It reads the public listing only, never the owner’s dashboard.' },
    ],
    guide: 'competitor-monitoring-checklist',
  },
  ads: {
    whyItMatters: [
      'Paid ads show what a rival is willing to spend money on right now: a seasonal service, a financing offer, a membership plan. New ads usually mean a deliberate push.',
      'Both Meta and Google publish the ads a business is running in public libraries. Watching them weekly turns those libraries into a running record of each rival’s offers.',
    ],
    faq: [
      { q: 'Does it show how much a rival spends?', a: 'No. It shows the ads a rival is running as the public libraries list them, with the ad text where the library shows it.' },
      { q: 'Which ad platforms are covered?', a: 'Meta (Facebook and Instagram), through the Meta Ad Library, and Google, through the Google Ads Transparency Center.' },
    ],
    guide: 'local-competitor-analysis',
  },
  'local-map-rankings': {
    whyItMatters: [
      'For most local-service businesses the map results are where customers choose who to call, and map results change with where the searcher stands. A business can lead near its office and be invisible a few miles away.',
      'A grid of scan points across the service area shows that shape: where a client is in the top three, how far its reach extends, and where a rival leads. Repeated every week, it shows whether coverage is growing or shrinking.',
      'Every ranking in a brief links to the scan behind it, so a client can see the exact map, point by point.',
    ],
    faq: [
      { q: 'How many keywords can a client track?', a: 'Up to five keywords per client, such as “emergency plumber” or “dentist near me”.' },
      { q: 'How often are scans run?', a: 'Weekly, every Sunday. You can run one extra scan a week with “Scan now”.' },
      { q: 'What does a rank at a point mean?', a: 'It is what a public map search shows at that point on the grid. It does not track any individual searcher.' },
    ],
    guide: 'map-rank-grid',
  },
  'job-postings': {
    whyItMatters: [
      'Hiring is an early signal. A rival advertising for more technicians, a specialist or a new office role is usually about to grow, often before its website or ads say so.',
      'Seen week by week, job listings help an agency warn a client before the rival’s expansion shows up on the map.',
    ],
    faq: [
      { q: 'Where do the listings come from?', a: 'From public job listings on Google that match a rival.' },
      { q: 'Does it contact anyone?', a: 'No. It does not contact applicants or employers.' },
    ],
    guide: 'competitor-monitoring-checklist',
  },
};
