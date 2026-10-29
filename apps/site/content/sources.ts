// Draft copy: owner signs. Every entry is checked against the claims ledger
// (docs/research/2026-10-29-phase-17c-claim-check.md, rows src-<slug>); evidence paths live in sources-evidence.ts.
// competitor-websites is gated by WEB_MONITORING_ENABLED: the owner turns it on before this page deploys.
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

const NO_LOGINS = 'We never log in anywhere, and we never use private data.';

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
    howOften: 'Daily or weekly for each page. A trial agency gets weekly checks.',
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
      'Reviewer names are pseudonymised and contact details are removed before a review is stored.',
    ],
    howOften: 'Weekly.',
    whatWeDont: [NO_LOGINS, 'We show reviewer names only in pseudonymised form, and we never keep contact details.'],
    inTheBrief: 'A burst of complaints about a rival, or a theme in what its customers praise, with the reviews linked as evidence.',
    seo: {
      title: 'Competitor Google reviews',
      description: "How Rival Monday collects your rivals' public Google reviews each week, with reviewer names pseudonymised.",
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
    whatWeDont: [NO_LOGINS, 'We do not see what a rival spends or who it targets, only what the public libraries list.'],
    inTheBrief: 'A rival starts a new seasonal campaign, with the ad text and the date it first appeared.',
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
    howOften: 'Weekly, every Sunday. A "Scan now" button runs an extra scan once a week.',
    whatWeDont: [NO_LOGINS, 'We do not track individual searchers. A ranking is what a public map search shows at that point.'],
    inTheBrief: 'A rival moves ahead of you in one part of town, shown on a map of the grid.',
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
