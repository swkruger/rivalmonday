// Draft copy: owner signs. Evergreen guides for agencies (SEO). Method and judgement only: no statistics, no
// customer results, no claims about Rival Monday beyond the ledger's allowed wording
// (docs/research/2026-10-29-phase-17c-claim-check.md). Examples are illustrative.

export interface GuideSection {
  heading: string;
  paragraphs: readonly string[];
  /** Optional bullet list after the paragraphs. */
  list?: readonly string[];
}

export interface Guide {
  slug: 'local-competitor-analysis' | 'map-rank-grid' | 'competitor-monitoring-checklist';
  h1: string;
  lead: string;
  /** ISO date first published (Article JSON-LD `datePublished`). */
  published: string;
  /** ISO date of the last substantive edit (`dateModified`). */
  updated: string;
  sections: readonly GuideSection[];
  /** Internal links shown under the guide: source pages and industry pages that go deeper. */
  related: readonly { label: string; href: string }[];
  /** Where the sample map story helps the reader (map-rank-grid only). */
  showSampleMap?: boolean;
  seo: { title: string; description: string; crumb: string };
}

export const GUIDES: readonly Guide[] = [
  {
    slug: 'local-competitor-analysis',
    h1: 'How to run a local competitor analysis for a client',
    lead: 'A local competitor analysis answers one question for a business owner: who is taking the calls I should be getting, and how? Here is a method an agency can repeat for every local-service client, and keep up to date.',
    published: '2026-10-29',
    updated: '2026-10-29',
    sections: [
      {
        heading: 'Start with who actually competes',
        paragraphs: [
          'The competitors that matter are rarely the ones the owner names first. Owners remember the business across the street or the one that poached a technician. Customers see whoever shows up when they search.',
          'So begin with the searches customers make. Pick the three to five services that bring in most of the revenue, search for each one from inside the service area, and note which businesses keep appearing in the map results and the ads. A business that appears for several services in several neighborhoods is a real rival. One that appears once is background.',
        ],
        list: [
          'Top rivals: show up for most of the client’s main services across most of the area.',
          'Worth watching: strong in one service or one part of the area.',
          'Minor: present, but rarely in front of customers.',
        ],
      },
      {
        heading: 'Look where customers decide',
        paragraphs: [
          'For a local-service business, the decision usually happens in four places: the map results, the Google Business Profile, the reviews, and the ads that sit above the results. The website matters too, mostly for prices and offers.',
          'For each rival, capture what a customer would see today: its map position for each service, its categories, hours and rating, its recent reviews, the ads it is running and the offers on its site. Keep the capture itself, such as a screenshot, the ad copy or the review text, not just your notes about it. You will need it later.',
        ],
      },
      {
        heading: 'Compare like with like',
        paragraphs: [
          'Raw lists are hard to act on. Line the client up against each top rival on the same questions: who ranks higher for which service, and where in the area? Whose rating is higher, and is the gap growing? Who is advertising, and with what offer? Who has the more complete profile?',
          'A simple table per service, with the client in the first column, makes the gaps obvious to an owner in a minute.',
        ],
      },
      {
        heading: 'Where to look for each signal',
        paragraphs: [
          'Every one of these is public, which matters: you can show the client exactly what you saw, and nobody can say the analysis rests on guesswork.',
        ],
        list: [
          'Map rankings: search each service from several spots across the service area, not just the office. Results change with location.',
          'Business Profiles: categories, hours, services, photos and the rating, straight from each rival’s public listing.',
          'Reviews: the newest reviews first. Volume tells you about momentum; the text tells you what customers value.',
          'Ads: the Meta Ad Library and the Google Ads Transparency Center list the ads a business is running, with the copy.',
          'Websites: service pages, prices, offers, financing and warranties, and any new locations or service areas.',
          'Hiring: public job listings show which roles a rival is filling, an early hint of expansion.',
        ],
      },
      {
        heading: 'Present it so an owner reads it',
        paragraphs: [
          'Owners of local-service businesses are busy, and most competitor reports are too long to read on a phone between jobs. Lead with the two or three changes that matter most, each in a single sentence an owner can repeat to their team.',
          'Under each one, say why it matters for this business and what to do about it, and keep the evidence a click away rather than pasted into the report. A short page the owner reads beats a long deck they skim.',
        ],
      },
      {
        heading: 'Turn findings into actions',
        paragraphs: [
          'Every finding should end in something the client can do this month. A rival in the map top 3 where the client is not points to the Business Profile: categories, photos, review volume in that area. A rival’s new financing ad points to the client’s own offer, not necessarily a price cut. A run of complaints about a rival’s response times is a message the client can use.',
          'Keep the action next to the evidence that prompted it, so the owner can see why you are recommending it.',
        ],
      },
      {
        heading: 'Make it weekly, not yearly',
        paragraphs: [
          'A one-off analysis is out of date within weeks: offers change, rankings move, a rival hires and expands. The value is in noticing the change while there is still time to respond.',
          'That is what Rival Monday does for agencies: it watches each client’s rivals from public information, and every Monday sends a short brief under your brand, with every claim linked to its evidence.',
        ],
      },
    ],
    related: [
      { label: 'How map rankings are scanned', href: '/sources/local-map-rankings' },
      { label: 'Watching rivals’ ads on Meta and Google', href: '/sources/ads' },
      { label: 'Competitor monitoring for HVAC companies', href: '/for/hvac' },
      { label: 'Competitor monitoring for dental practices', href: '/for/dental' },
    ],
    seo: {
      title: 'How to run a local competitor analysis',
      description: 'A repeatable method for agencies: find the rivals that matter, compare them where customers decide, and turn findings into actions.',
      crumb: 'Local competitor analysis',
    },
  },
  {
    slug: 'map-rank-grid',
    h1: 'What a map rank grid tells you, and what it doesn’t',
    lead: 'A single “we rank third” hides most of the story. Local map results change with where the searcher stands, so the useful question is where a business ranks across its service area. A rank grid answers that.',
    published: '2026-10-29',
    updated: '2026-10-29',
    showSampleMap: true,
    sections: [
      {
        heading: 'Why one ranking is not enough',
        paragraphs: [
          'Map results are local to the searcher. The same search for “ac repair” can show a business first near its office and nowhere a few miles away. A single rank check, run from one spot, describes one street.',
          'A rank grid runs the same search from many points laid out evenly over the service area and records the rank at each one. The result reads like a weather map: strong where it is dark, weak where it is pale.',
        ],
      },
      {
        heading: 'How to read a grid',
        paragraphs: [
          'Start at the business’s own location. Most businesses rank best close to their address, so a strong center is normal. What matters is how far that strength reaches.',
          'Then look for shapes. A dark patch that stops at a river or a highway often marks a real boundary in how customers search. A pale gap in the middle of good coverage usually points to a rival based right there.',
        ],
        list: [
          'Top-3 coverage: the share of points where the business is in the top three, the results most searchers see.',
          'Reach: how far from the office the business still ranks well.',
          'Gaps: pockets inside the service area where a rival leads.',
        ],
      },
      {
        heading: 'Watch it change week by week',
        paragraphs: [
          'One grid is a snapshot. The insight comes from comparing scans of the same keyword over time. When top-3 coverage spreads outward week after week, the work is paying off. When a rival’s coverage grows into the client’s area, it is time to look at what that rival changed.',
          'The sample below shows a fictional business over twelve weekly scans. In the first week it holds the top three only at its own location, and its reach grows outward as the weeks pass.',
        ],
      },
      {
        heading: 'Patterns worth knowing',
        paragraphs: ['A few shapes come up again and again. Each one points to a different next step.'],
        list: [
          'Strong center, pale edges: normal for a business with one location. Growing reach usually comes from profile strength and reviews, not from the address.',
          'A pale hole inside good coverage: often a rival based in that pocket. Check its profile and recent reviews.',
          'Coverage that shrinks from one side: a rival on that side is gaining. Look at what it changed in the same weeks.',
          'Good coverage for one keyword, weak for another: the profile may not cover that service well. Check categories and services.',
          'Sudden, area-wide change in one week: look for a profile change first, such as a category, hours or a suspension, before reading too much into it.',
        ],
      },
      {
        heading: 'What a grid does not tell you',
        paragraphs: [
          'A grid shows positions, not causes. It cannot tell you why a rival moved up. For that, look at what changed in the same weeks: new reviews, new categories or hours on its profile, new ads.',
          'It also reflects public map results at each point, not the behaviour of any individual searcher, and results can vary a little from one check to the next. Treat small week-to-week wobbles as noise and look for sustained movement.',
        ],
      },
      {
        heading: 'Choosing keywords',
        paragraphs: [
          'Pick a handful of searches that map to real revenue, such as “emergency plumber” rather than “plumbing”. Include at least one high-intent search customers make when they are ready to call. Five well-chosen keywords tell you more than twenty loose ones.',
          'Rival Monday scans up to five keywords per client on a grid across the service area every week, and every brief that mentions a ranking links to the scan behind it.',
        ],
      },
    ],
    related: [
      { label: 'How Rival Monday scans local map rankings', href: '/sources/local-map-rankings' },
      { label: 'See the full sample brief', href: '/sample-brief' },
      { label: 'Competitor monitoring for HVAC companies', href: '/for/hvac' },
      { label: 'How to run a local competitor analysis', href: '/guides/local-competitor-analysis' },
    ],
    seo: {
      title: 'What a map rank grid tells you',
      description: 'How local map rank grids work, how to read top-3 coverage, reach and gaps, and what a grid cannot tell you about your rivals.',
      crumb: 'Map rank grids',
    },
  },
  {
    slug: 'competitor-monitoring-checklist',
    h1: 'A weekly competitor monitoring checklist for agencies',
    lead: 'Most competitor changes that matter to a local business are visible in public, if someone looks every week. This checklist covers what to watch for each client, where to find it, and what each change usually means.',
    published: '2026-10-29',
    updated: '2026-10-29',
    sections: [
      {
        heading: 'Map rankings',
        paragraphs: ['Check the client’s main searches across the service area, not from one spot.'],
        list: [
          'Has a rival entered the top three anywhere it was not last week?',
          'Has the client’s top-3 coverage grown or shrunk?',
          'Is a gap forming in one neighborhood?',
        ],
      },
      {
        heading: 'Google Business Profiles',
        paragraphs: ['Profiles change quietly and matter a lot for map results.'],
        list: [
          'New or removed categories, a common sign a rival is going after a new service.',
          'Changed hours, especially evenings, weekends or emergency hours.',
          'Rating movement, and whether it is driven by a few recent reviews.',
        ],
      },
      {
        heading: 'Reviews',
        paragraphs: ['Read what changed, not just how many.'],
        list: [
          'A burst of new reviews for a rival, which often follows a review campaign.',
          'Themes: response time, price, cleanliness, staff. Repeated complaints are an opening for the client.',
          'How quickly rivals reply to criticism.',
        ],
      },
      {
        heading: 'Ads',
        paragraphs: ['The Meta Ad Library and the Google Ads Transparency Center show which ads a business is running.'],
        list: [
          'New ads, and the offer in each: financing, discounts, free estimates, memberships.',
          'Ads that stop, which can mean an offer failed or a season ended.',
          'Several new ads at once, usually a deliberate push.',
        ],
      },
      {
        heading: 'Websites',
        paragraphs: ['Rival sites change less often, but the changes are telling.'],
        list: [
          'Prices and offers on service pages.',
          'New service pages, a rival moving into the client’s work.',
          'New locations or service areas.',
        ],
      },
      {
        heading: 'Hiring',
        paragraphs: ['Job listings are an early signal of where a rival is growing.'],
        list: ['More technicians or a new specialist role.', 'A new office or a second location.'],
      },
      {
        heading: 'Keep a record, not just a feeling',
        paragraphs: [
          'Each week, save what you saw: the ad text, the review, the profile field, the map result. Memory is unreliable, and a client who asks “when did they start that offer?” deserves a dated answer.',
          'A record also shows patterns a single week hides. A rival that changes its hours twice in a month, or keeps adding categories, is telling you where it is heading. Comparing this week with last week is only possible if last week was kept.',
        ],
        list: [
          'Date every capture.',
          'Keep the original, such as a screenshot or the exact text, next to your summary.',
          'Note which rival and which service area each item is about.',
        ],
      },
      {
        heading: 'Give it an owner and a day',
        paragraphs: [
          'Checklists that belong to everyone get done by no one. Give each client’s checklist to one person on the team, and pick a fixed day for it, ideally just before the week starts, so findings reach the client while they can still act on them.',
          'If the same rival keeps appearing in the findings week after week, raise it with the client directly rather than waiting for the next report.',
        ],
      },
      {
        heading: 'Separate signal from noise',
        paragraphs: [
          'Not every change deserves a client’s attention. A rival fixing a typo on its website or gaining one review is noise. A rival launching a financing offer, adding a category that matches your client’s best service, or climbing into the map top three across a neighborhood is signal.',
          'A useful test: would the owner do something differently if they knew? If not, leave it out of the brief and keep it in your notes. Repeated small changes in the same direction, such as a steady run of reviews, can add up to signal over a few weeks.',
        ],
      },
      {
        heading: 'Make it a habit the client sees',
        paragraphs: [
          'The checklist only works if it happens every week and the client hears about it. Keep each finding short, say why it matters, recommend one action, and keep the evidence one click away.',
          'Rival Monday runs this checklist for each client from public information and sends the result as a Monday brief under your agency’s brand. Your team can edit or approve each brief before it goes out.',
        ],
      },
    ],
    related: [
      { label: 'Rivals’ Google reviews', href: '/sources/google-reviews' },
      { label: 'Google Business Profile changes', href: '/sources/google-business-profile' },
      { label: 'Competitor job postings', href: '/sources/job-postings' },
      { label: 'Competitor monitoring for plumbing companies', href: '/for/plumbing' },
    ],
    seo: {
      title: 'Weekly competitor monitoring checklist',
      description: 'What agencies should check every week for each local client: map rankings, Business Profiles, reviews, ads, websites and hiring.',
      crumb: 'Monitoring checklist',
    },
  },
];

export const GUIDES_PAGE = {
  eyebrow: 'Guides',
  h1: 'Guides for agencies watching local competitors',
  lead: 'Practical methods for finding the rivals that matter, reading map rankings and keeping clients ahead every week.',
  seo: {
    title: 'Competitor analysis guides for agencies',
    description: 'Practical guides for agencies: local competitor analysis, map rank grids and a weekly competitor monitoring checklist.',
    crumb: 'Guides',
  },
} as const;
