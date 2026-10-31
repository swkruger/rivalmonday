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
  slug: 'local-competitor-analysis' | 'map-rank-grid' | 'competitor-monitoring-checklist' | 'read-competitor-reviews' | 'read-competitor-ads' | 'write-competitor-brief';
  h1: string;
  lead: string;
  /** ISO date first published (Article JSON-LD `datePublished`). */
  published: string;
  /** ISO date of the last substantive edit (`dateModified`). */
  updated: string;
  /** Committed in `public/sample`; never generated at runtime. `caption` marks sample or fictional content. */
  image: { src: `/sample/${string}`; alt: string; width: number; height: number; caption?: string };
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
    image: {
      src: '/sample/home-street.webp',
      alt: 'Local shops on a small-town main street with two plain white service vans parked outside',
      width: 1200,
      height: 800,
    },
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
    image: {
      src: '/sample/hero-map.webp',
      alt: 'Map rankings for a sample keyword: a grid of ranks over the service area, strongest around the business',
      width: 960,
      height: 1120,
      caption: 'Sample data from a fictional business.',
    },
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
    image: {
      src: '/sample/home-counter.webp',
      alt: 'A phone, keys, a clipboard and a cup of coffee on a service counter, with a work van outside the window',
      width: 1200,
      height: 800,
    },
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
  {
    slug: 'read-competitor-reviews',
    h1: 'How to read a rival’s Google reviews',
    lead: 'A rival’s rating tells you very little. The words in its reviews tell you what customers in your client’s area value, what they are annoyed by, and where your client can win the next call. Here is how to read them with a purpose.',
    published: '2026-10-31',
    updated: '2026-10-31',
    image: {
      src: '/sample/site-heat-pump.webp',
      alt: 'A heat pump on a concrete pad outside a house, the kind of finished job a customer writes a review about',
      width: 960,
      height: 640,
    },
    sections: [
      {
        heading: 'Start with the newest, not the best known',
        paragraphs: [
          'Sort each rival’s reviews by newest first. Old reviews describe a business that may no longer exist: a different owner, a different crew, a different price list. The last few months tell you what a customer would experience if they called today.',
          'Read enough to see repetition, then stop. You are looking for what comes up again and again, not for every story. One angry review is an anecdote. The same complaint from several customers in a few months is a pattern.',
        ],
      },
      {
        heading: 'Sort what you read into themes',
        paragraphs: ['Most reviews of a local-service business are about the same handful of things. Tally them per rival, so you can compare businesses rather than remember individual stories.'],
        list: [
          'Speed: how quickly someone answered, arrived or finished.',
          'Price: whether the bill matched the quote, and whether it felt fair.',
          'People: named staff, manners, how the problem was explained.',
          'Quality: whether the fix lasted, and whether anyone had to come back.',
          'Trust: pressure to buy, surprise add-ons, cleanliness in the home.',
        ],
      },
      {
        heading: 'Look at momentum as well as the rating',
        paragraphs: [
          'A rating moves slowly because it averages everything a business has ever collected. The pace of new reviews moves quickly. A rival that suddenly gathers far more reviews than usual has probably started asking for them, and that matters even if its rating has not changed.',
          'Compare the same period for each rival and for your client. If a rival is gathering reviews faster, it will look more active to a customer comparing listings, and the gap will widen every month it continues.',
        ],
      },
      {
        heading: 'Read the replies too',
        paragraphs: [
          'How a business answers criticism is public, and customers read it. A calm reply that names the problem and offers a next step can be more reassuring than a clean record. A rival that argues with reviewers, or never replies at all, has left an opening.',
          'Note how often each rival replies, how quickly, and whether the reply is written by a person or pasted from a template. Then look at your client’s replies with the same eyes.',
        ],
      },
      {
        heading: 'Turn themes into something to do',
        paragraphs: ['A theme is only useful once it changes what the client does. Match each pattern you find with one concrete step, and keep it small enough to happen this month.'],
        list: [
          'Rivals are praised for fast response: if your client is quick too, say so on the profile and in the ads.',
          'Rivals are criticized for surprise bills: lead with upfront pricing, if your client really offers it.',
          'A rival’s named technician keeps getting praise: encourage your client’s customers to mention who helped them.',
          'A rival is gathering reviews quickly: set up a simple way to ask every customer, as Google requires.',
        ],
      },
      {
        heading: 'What to stay away from',
        paragraphs: [
          'Reviews are written by real people, so treat them with care. Report what the pattern is, not who said it. Never contact a rival’s reviewers, and never suggest that your client pays for reviews, posts fake ones or asks only happy customers. All of those break Google’s rules and can damage the client far more than a rival’s good month.',
          'Be careful with sensitive trades too. A dental or medical practice must not confirm that someone is a patient, even when replying to a public review.',
        ],
      },
      {
        heading: 'Keep doing it every week',
        paragraphs: [
          'Reviews are one of the few signals that change every week, which makes them easy to neglect and useful to track. Save what you read, with its date, so you can show when a complaint started or a rival’s pace changed.',
          'Rival Monday collects rivals’ new Google reviews weekly. Reviewer names are pseudonymized and contact details removed before a review is stored, and any claim about reviews in a brief links to the evidence behind it.',
        ],
      },
    ],
    related: [
      { label: 'Rivals’ Google reviews', href: '/sources/google-reviews' },
      { label: 'Competitor monitoring for dental practices', href: '/for/dental' },
      { label: 'A weekly competitor monitoring checklist', href: '/guides/competitor-monitoring-checklist' },
      { label: 'How to run a local competitor analysis', href: '/guides/local-competitor-analysis' },
    ],
    seo: {
      title: 'How to read a rival’s Google reviews',
      description: 'How agencies can read competitors’ Google reviews for themes, momentum and replies, and turn what they find into action for a local client.',
      crumb: 'Reading rivals’ reviews',
    },
  },
  {
    slug: 'read-competitor-ads',
    h1: 'How to read a rival’s ads on Meta and Google',
    lead: 'Every ad a local rival runs is a public statement of what it wants to sell, and to whom. You can see those ads for free. Here is where to find them, what to look for, and what they can and cannot tell you.',
    published: '2026-10-31',
    updated: '2026-10-31',
    image: {
      src: '/sample/ad-comfort-club.webp',
      alt: 'A bright living room with a thermostat on the wall, the image from a fictional rival’s membership ad',
      width: 720,
      height: 480,
      caption: 'From a fictional rival’s sample ad.',
    },
    sections: [
      {
        heading: 'Where to find them',
        paragraphs: [
          'Two free public libraries do most of the work. The Meta Ad Library lists ads running on Facebook and Instagram, and the Google Ads Transparency Center lists ads by advertiser. Search each by the rival’s business name, and check that the result really is that business, because local names are often shared.',
          'You do not need an account with the rival to look. Save what you find, because an ad can be harder to find once it stops running.',
        ],
      },
      {
        heading: 'Start with the offer',
        paragraphs: ['Ignore the design at first and write down what the ad promises. In local services, most offers fall into a few groups, and each one tells you something different about how the rival is trying to win.'],
        list: [
          'Discounts and low entry prices: competing on price, often for a service used to start the relationship.',
          'Financing: going after bigger jobs, and buyers who worry about the upfront cost.',
          'Free estimates or inspections: trying to get through the door first.',
          'Memberships and maintenance plans: trying to keep customers rather than win one job.',
          'Speed and availability: same-day, weekend or emergency service.',
        ],
      },
      {
        heading: 'Look at the pattern over time',
        paragraphs: [
          'One ad on its own says little. What matters is what changes. Several new ads in the same week usually mean a deliberate push. An ad that keeps running for months probably earns its place, since few businesses keep paying for something that does not bring in work. An ad that stops quickly may have failed, or may simply have reached the end of a season.',
          'Compare with the time of year as well. A heating offer in the first cold week is normal. The same offer in early summer is a business trying something new.',
        ],
      },
      {
        heading: 'What ads cannot tell you',
        paragraphs: [
          'Be honest with a client about the limits. For a local business, these libraries generally do not show how much a rival spends, how many calls an ad brings in, or whether it makes money. A long-running ad is a hint that it works, not proof.',
          'So avoid telling a client that a rival is “spending heavily” or “winning with” an ad unless you have evidence for it. Say what you can show: which ad, what it offers, and when you first saw it.',
        ],
      },
      {
        heading: 'Connect ads to the rest of the picture',
        paragraphs: ['Ads are more useful alongside other signals. A rival advertising a service it has just added to its Google Business Profile is moving into that work. A rival advertising speed while its reviews complain about slow response has a gap your client can use. A push of ads followed by better map coverage is worth watching, although it does not show that one caused the other.'],
      },
      {
        heading: 'Respond without starting a price war',
        paragraphs: [
          'The instinct is to match a rival’s discount. That is rarely the best move. Most local customers are not choosing on price alone, and a matched discount gives away margin on jobs your client would have won anyway.',
          'Answer the worry behind the offer instead. If a rival leads with financing, the customer is worried about the upfront cost, and your client might offer payment options or a clear fixed price. If a rival leads with a low diagnostic fee, your client might explain what the visit includes. Only advise on what your client can actually deliver.',
        ],
      },
      {
        heading: 'Make it part of the week',
        paragraphs: [
          'Ads change often, and a client who hears about a rival’s offer from a customer has already lost a little ground. A short weekly check, with each new ad saved and dated, means you can tell them first.',
          'Rival Monday collects rivals’ ads on Meta and Google weekly from the public libraries. It does not show what a rival spends. When a brief mentions an ad, the claim links to the ad behind it.',
        ],
      },
    ],
    related: [
      { label: 'Watching rivals’ ads on Meta and Google', href: '/sources/ads' },
      { label: 'Competitor monitoring for HVAC companies', href: '/for/hvac' },
      { label: 'A weekly competitor monitoring checklist', href: '/guides/competitor-monitoring-checklist' },
      { label: 'See the full sample brief', href: '/sample-brief' },
    ],
    seo: {
      title: 'How to read a rival’s ads on Meta and Google',
      description: 'Where to find a local rival’s ads, how to read the offer and the pattern over time, what ads cannot tell you, and how to respond.',
      crumb: 'Reading rivals’ ads',
    },
  },
  {
    slug: 'write-competitor-brief',
    h1: 'How to write a competitor brief a business owner will read',
    lead: 'Most competitor reports are built to show how much work went into them. A good brief is built for an owner reading on a phone between jobs. Here is how to decide what goes in, how to word it, and how to keep it believable.',
    published: '2026-10-31',
    updated: '2026-10-31',
    image: {
      src: '/sample/hero-overview.webp',
      alt: 'A client dashboard for a sample heating and air business, showing the week in four numbers, where it stands against its rivals and the Ask Friday card',
      width: 1720,
      height: 948,
      caption: 'Sample data from a fictional business.',
    },
    sections: [
      {
        heading: 'Write for one reader',
        paragraphs: [
          'Picture the owner standing in a driveway with a few minutes before the next job. They want to know three things: did anything happen that matters, what does it mean for me, and what should I do about it? Everything in the brief should help answer one of those questions.',
          'That rules out a lot. Charts of everything you tracked, summaries of quiet rivals and explanations of your method can all live elsewhere. The owner hired you so they would not have to read them.',
        ],
      },
      {
        heading: 'Choose the few things that matter',
        paragraphs: [
          'Most weeks, only a small number of changes deserve an owner’s time. A useful test for each one: would the owner do something differently if they knew? A rival’s new financing offer passes. A rival’s reworded About page does not.',
          'Rank what is left by how close it sits to the client’s money. A change affecting their best-earning service, in the part of town they care about most, goes first.',
        ],
      },
      {
        heading: 'Use a simple shape for each item',
        paragraphs: ['Give every item the same three parts, so the owner learns how to read it once. The example here comes from a fictional business.'],
        list: [
          'What happened: one sentence, with the rival’s name and the fact. “Kestrel cut its AC diagnostic fee to $69 (was $89).”',
          'Why it matters: one sentence, about this business. “Price-sensitive customers compare this fee before they book.”',
          'What to do: one action they could start this week. “Explain what your diagnostic visit includes on your AC repair page.”',
        ],
      },
      {
        heading: 'Back up every claim',
        paragraphs: [
          'An owner will test the first thing you tell them against what they know. If one claim turns out to be wrong or vague, they stop trusting the rest. So write only what you can show, and keep the source one click away: the ad, the review, the profile field, the map scan.',
          'Be strict with yourself. If you cannot point to the evidence, take the sentence out rather than softening it with “seems” or “may”. A shorter brief that is all true is worth more than a longer one that is mostly true.',
        ],
      },
      {
        heading: 'Keep the wording plain',
        paragraphs: [
          'Use the words the owner would use. “Shows up in the top three on the map across most of your area” beats “improved local pack visibility”. Name rivals rather than saying “a competitor”. Use real numbers, and say what they were before, because a change means nothing without its starting point.',
          'Avoid adjectives that claim more than you can show, such as “aggressive”, “dominant” or “massive”. Let the fact do the work.',
        ],
      },
      {
        heading: 'Say so when it was a quiet week',
        paragraphs: ['Sometimes nothing important happens. Do not pad the brief to look busy, because an owner who reads a filler item learns to skip the next one. Say it was a quiet week, and use the space to show where the client stands against their rivals, so the brief still earns its place.'],
      },
      {
        heading: 'Send it at the same time every week',
        paragraphs: [
          'A brief that arrives at a predictable moment becomes a habit. Monday morning suits most local businesses: the owner is planning the week, and there is still time to act on what they read. Put the most important item in the subject line, so the email is useful even before it is opened.',
          'Rival Monday writes a brief like this for each client and sends it every Monday under your agency’s brand. Every claim links to its evidence, and your team can edit or approve each brief before it goes out.',
        ],
      },
    ],
    related: [
      { label: 'See the full sample brief', href: '/sample-brief' },
      { label: 'How evidence-backed briefs work', href: '/how-it-works' },
      { label: 'How to run a local competitor analysis', href: '/guides/local-competitor-analysis' },
      { label: 'Resell Rival Monday under your brand', href: '/partners' },
    ],
    seo: {
      title: 'How to write a competitor brief owners read',
      description: 'A simple format for competitor briefs: choose what matters, say what it means and what to do, back up every claim and keep the wording plain.',
      crumb: 'Writing a competitor brief',
    },
  },
];

/** Reading time from the visible text, at about 220 words a minute. */
export function guideReadMinutes(g: Guide): number {
  const text = [g.lead, ...g.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.list ?? [])])].join(' ');
  return Math.max(1, Math.round(text.split(/\s+/).length / 220));
}

export const GUIDES_LINK = { label: 'All guides →', href: '/guides' } as const;

export const GUIDES_PAGE = {
  eyebrow: 'Guides',
  h1: 'Guides for agencies watching local competitors',
  lead: 'Practical methods for finding the rivals that matter, reading their rankings, reviews and ads, and telling clients what it means every week.',
  seo: {
    title: 'Competitor analysis guides for agencies',
    description: 'Practical guides for agencies: local competitor analysis, map rank grids, rivals’ reviews and ads, client briefs and a weekly checklist.',
    crumb: 'Guides',
  },
} as const;
