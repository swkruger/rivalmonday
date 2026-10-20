import type { PageCopy } from '.';

/**
 * Short in-page help copy (15b-1 pilot; draft for owner sign-off in `docs/archive/phase-15b1-copy-signoff.md`).
 * `{agency}`, `{assistant}` and `{client}` are filled by `renderCopy` with the viewer's names. A tip or empty state without
 * an `audience` is for everyone; `agency` copy never reaches client roles. `guideAnchor` values are the guide's section
 * slugs (`what-this-page-tells-you`, `how-to-use-it`, `common-questions`). Metric copy cites the code that computes it.
 */
export const CLIENT_COPY = {
  'client.overview': {
    description: 'How {client} compares with its competitors this week.',
    tips: {
      // source: packages/tools/src/tools/overview.ts:getWorkspaceOverview (changes7d, alerts7d: routes alert + brief, last 7 days)
      changesWeek: {
        title: 'Changes this week',
        body: 'Competitor changes from the last 7 days that made the brief or an alert. The "high" pill counts how many of them were alerts.',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/tools/overview.ts:getWorkspaceOverview (priceMoves7d counts every route; priceCuts7d)
      priceMoves: {
        title: 'Competitor price moves',
        body: 'Competitor price changes from the last 7 days on services {client} offers, including small ones that did not make the brief. The pill counts the price cuts.',
      },
      // source: packages/tools/src/tools/overview.ts:getWorkspaceOverview (activeAds vs activeAds7dAgo)
      activeAds: {
        title: 'Active competitor ads',
        body: 'Competitor ads running now on Google and Meta, where the ad libraries show them, compared with a week ago.',
      },
      // source: packages/tools/src/tools/overview.ts:getWorkspaceOverview (rating.self vs mean of tracked competitors)
      ratingVsArea: {
        title: 'Your rating vs area',
        body: "{client}'s Google rating next to the average rating of the tracked competitors.",
      },
      // source: packages/tools/src/pressure.ts:combinePressure, pressureByClient
      pressure: {
        title: 'Competitive pressure',
        body: 'How much each competitor has been doing lately, from 0 to 100: its changes from the last 30 days that made the brief or an alert, plus its open moves. 70 and above is high, 40 to 69 elevated, below 40 low. The line under each name is its main reason.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noBrief: { title: 'No briefs yet', body: "The first brief arrives on a Monday morning. It covers what {client}'s competitors changed, why it matters and what to do." },
      noCompetitorsAgency: { title: 'No competitors tracked yet', body: 'Add competitors on the Competitors page to see how much pressure each one puts on {client}.', audience: 'agency' },
      noCompetitorsClient: { title: 'No competitors tracked yet', body: 'Your competitors appear here once {agency} has set them up.', audience: 'client' },
      noMoves: { title: 'No moves right now', body: "A move is a pattern in a competitor's changes, such as a price war or an ad surge. Moves show here when one is spotted." },
      noRecommendations: { title: 'Nothing open right now', body: 'New recommendations come with each brief. You can also save one from an {assistant} answer.' },
      noReports: { title: 'No quarterly reports yet', body: 'The first report arrives after a full quarter of monitoring.' },
    },
  },
  'client.changes': {
    description: "Everything {client}'s competitors changed, scored for how much it matters. Every change links to its evidence.",
    tips: {
      // source: packages/engine/src/score/score.ts:scoreForClient
      score: {
        title: 'How the score works',
        body: 'Each change scores 0 to 100: 100 × type × size × relevance × novelty, each factor between 0 and 1. The line under the bars shows where alerts and the brief start.',
        guideAnchor: 'how-to-use-it',
      },
      routes: {
        title: 'Alert, Brief and Archived',
        body: 'Alert: important enough to send between briefs. Brief: goes in the weekly brief. Archived: recorded, but too small to report. Choose All or Archived to see everything that was found.',
        audience: 'client',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/engine/src/score/score.ts:scoreForClient (thresholds, needsReviewCap, staleCap)
      routing: {
        title: 'Routing',
        body: "Alert at or above the alert level, Brief at or above the brief level, Archived below both. A change that still needs a check, or is too old to be urgent, goes to the brief instead of an alert. Change {client}'s levels under Settings › Alert rules.",
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noMatch: { title: 'No changes match these filters', body: 'Try a longer period, or All to include archived changes. A newly added competitor shows changes after its first checks.' },
      noSelection: { title: 'Pick a change', body: 'Select a change on the left to see the evidence behind it and why it scored as it did.' },
    },
  },
  'client.reviews': {
    description: 'What customers say about {client} and its competitors on Google.',
    tips: {
      // source: packages/engine/src/reviews/rating-trend.ts:ratingStats (reviews90d)
      newReviews: { title: 'New reviews (90 days)', body: "Reviews posted on {client}'s Google profile in the last 90 days." },
      // source: packages/engine/src/reviews/benchmark.ts:summarizeWindow; apps/web/src/components/charts/theme-heatmap.tsx:sentimentFill
      heatmap: {
        title: 'Reading the heatmap',
        body: "Rows are review topics; columns are businesses, {client} first. The number is the share of the reviews checked for that topic in the last 90 days that mention it. The color is how positive those mentions are: blue is positive, red is negative, gray is neutral. A dash means there are not enough reviews, and ▲▼ marks a change of 5 points or more since the previous 90 days.",
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/engine/src/reviews/rating-trend.ts:ratingStats (mix counts every collected review by stars)
      ratingMix: { title: 'Your rating mix', body: "How many of {client}'s collected Google reviews gave 1, 2, 3, 4 or 5 stars." },
      // source: packages/engine/src/reviews/rating-trend.ts:ratingStats (monthly average of reviews posted that month); reviews/trend-series.ts (fold beyond 5)
      ratingTrend: { title: 'Rating trend', body: 'The average stars of the reviews posted in each month, for {client} and each competitor. A month without reviews has no point. With many competitors, some are combined into one "Other (average)" line.' },
    },
    empty: {
      noMatch: { title: 'No reviews match', body: 'Try another business, topic or star rating, or a longer period.' },
    },
  },
  'client.competitors': {
    description: 'The competitors monitored for {client}. Each one is rated by how closely it competes with {client}.',
    tips: {
      // source: packages/collectors/src/rivals/score.ts:tierFor (overlap, activity; with activity unknown the best tier is Worth watching); labels: packages/core/src/domain.ts:TIER_LABELS; order: competitors/competitor-controls.tsx:TrackedCompetitorsTable (TIER_RANK)
      tiers: {
        title: 'Competitor tiers',
        body: "How closely a competitor competes with {client}. Top rival: it shows up in the same local searches and is active, with ads, new reviews or a claimed Google profile. Worth watching: strong on one of those. Minor: the rest. If a competitor's activity could not be checked, Worth watching is the highest tier it can get. The list starts with Top rivals.",
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/collectors/src/signals/tracked.ts:computeTrackedSignals (computedAt = when the tier and signals were last computed); apps/web/src/components/rival/rated-label.ts:ratedLabel
      rated: {
        title: 'The "Rated" date',
        body: 'The day this competitor\'s tier and signals were last refreshed. It is a date, not a star rating: Google star ratings are on the Reviews page. "Not rated yet" means no tier has been worked out for it yet.',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/competitors/competitor-controls.tsx:initialSelection (preselected = Top rivals, up to the room left), useSearchProgress (20-40 minute search); packages/tools/src/rival-search.ts:weeklyLimitMessage (one manual search per client-local week)
      suggestions: {
        title: 'Suggested competitors',
        body: 'Businesses found by searching {client}\'s service area, grouped by tier. Top rivals start ticked, up to the room left under the client\'s competitor limit. Dismiss hides one; "Show hidden" lists what the search left out and why. A search takes 20 to 40 minutes, and a client can have one manual search per week.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noTrackedAgency: { title: 'No competitors tracked yet', body: 'Accept a suggestion below or add one by name. A name is required; a website is optional.', audience: 'agency' },
      noTrackedManage: { title: 'No competitors tracked yet', body: 'Add one with the form below. A name is required; a website is optional.', audience: 'client' },
      noTrackedView: { title: 'No competitors tracked yet', body: 'Your competitors appear here once {agency} has set them up.', audience: 'client' },
    },
  },
  'client.competitors.detail': {
    description: 'Everything monitored for this competitor: its prices, ads, reviews, local rankings and a timeline of changes.',
    tips: {
      // source: apps/web/src/app/(app)/c/[clientId]/competitors/[competitorId]/source-status.ts:sourceStatusLabel; packages/tools/src/tools/competitor-profile.ts:getCompetitorProfile (sources: lastRunAt, lastStatus, active)
      collection: {
        title: 'Collection status',
        body: 'Each source monitored for this competitor, such as its Google profile or ads, and when it last ran. A note after the time, like "Not found" or "Retrying", describes that last run. "Paused" means the source is switched off.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/tools/src/tools/competitor-profile.ts:getCompetitorProfile (pages.active = active tracked pages; pages.blocked = latest capture blocked or robots_disallowed)
      pagesMonitored: {
        title: 'Pages monitored',
        body: 'Pages on the competitor\'s own website that are checked for changes, such as prices, offers and service pages. "Site blocks monitoring" appears when the latest check of a page was refused by the site, so changes on it cannot be seen.',
      },
      // source: packages/tools/src/tools/competitor-profile.ts:getCompetitorProfile (openMoves = this client's moves for the competitor with closedAt null and live events)
      openMoves: {
        title: 'Open moves',
        body: 'How many of this competitor\'s moves are still open. A move is a pattern across several of its changes, such as a price war. Select the number to open the Moves page.',
      },
      // source: packages/tools/src/tools/pages.ts:setPagePin (pinned = daily cadence, otherwise the default cadence for the page type); packages/db/src/schema/evidence.ts:trackedPage (shared by every client tracking the competitor)
      pinned: {
        title: 'Pinned pages',
        body: 'A pinned page is checked daily; other pages follow the default schedule for their type. Pages belong to the competitor, so pinning applies to every client that tracks it.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noPages: { title: 'No pages tracked yet', body: "Pages on the competitor's own website are found automatically and listed here once they are." },
    },
  },
  'client.pricing': {
    description: 'What each competitor charges on its website now, and how that changed. Pick a service to see its price history.',
    tips: {
      // source: packages/tools/src/tools/pricing.ts:getPriceMatrix (change = lowest price now vs 90 days ago, only when both known and different; promo flag); apps/web/src/app/(app)/c/[clientId]/pricing/price-card.tsx (CHANGE_TONE)
      priceChange: {
        title: 'Price change tag',
        body: "Compares the competitor's lowest price for a service now with its lowest price 90 days ago. A red ▼ means the price fell and a green ▲ means it rose. The tag shows only when both prices are known and they differ, and it always looks back 90 days, whatever period you pick for the history. PROMO marks a price listed as a promotion.",
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/pricing.ts:getPriceMatrix (services[].offered = the client's own services)
      yourService: {
        title: '"Your service" tag',
        body: "Marks a service {client} offers too, so you can compare like with like. It tags the service, not the price: every price on a card is the competitor's.",
      },
    },
    empty: {
      noCompetitorsAgency: { title: 'No competitors tracked yet', body: "Add competitors on the Competitors page. Prices come from each competitor's own website.", audience: 'agency' },
      noCompetitorsClient: { title: 'No competitors tracked yet', body: 'Your competitors appear here once {agency} has set them up.', audience: 'client' },
      noPrices: { title: 'No prices found yet', body: "Prices come from the competitors' own websites. A card fills in once a page that lists prices has been read; a competitor that does not publish prices stays empty." },
    },
  },
  'client.ads': {
    description: 'Ads your competitors run on Google and Meta, with when each one was first and last seen.',
    tips: {
      // source: packages/tools/src/workspace/ads.ts:adWeeklySeries (weekly dates, null before the first ad check); ads/page.tsx (weeks: 12)
      adsPerWeek: {
        title: 'Active ads per week',
        body: "How many ads each competitor had running on each weekly date, for the last 12 weeks. A week before a competitor's ads were first checked is left blank, not shown as zero.",
      },
      // source: packages/collectors/src/ads/google.ts:ACTIVE_WINDOW_MS (14 days); packages/collectors/src/ads/meta.ts (is_active flag); packages/tools/src/tools/ads.ts:listAds (status filter)
      status: {
        title: 'Active and ended ads',
        body: 'An ad is active while the ad library still shows it (for Google ads, if it was shown in the last 14 days). Ended ads have stopped; each card shows when it was first and last seen.',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/ads/ad-card.tsx ("Targeting not disclosed (US)"); packages/engine/src/briefs/rules.ts (a targeting claim without targeting evidence is dropped)
      targeting: {
        title: 'Targeting',
        body: 'The public ad libraries do not say who a US ad was aimed at, so each card reads "Targeting not disclosed (US)". Nothing on this page, and no brief, guesses at it.',
      },
    },
    empty: {
      noMatch: { title: 'No ads match these filters', body: 'Try All platforms and All statuses, or another competitor. A competitor with no ads in the Google or Meta libraries has nothing to show.' },
    },
  },
  'client.rankings': {
    description: 'Where each business shows up in Google’s local results across {client}’s service area, from the weekly rank scan.',
    tips: {
      // source: packages/collectors/src/rankings/scan.ts:scanRankings (gridSize 5 or 7, depth 20); apps/web/src/components/charts/geo-grid.tsx:rankFill (colour steps, "20+", no-data hatch)
      grid: {
        title: 'The rank grid',
        body: 'A square of search points spread across the service area; the page shows its size, such as 7×7. Each point is a Google Maps search made as if from that spot, and its cell shows where the business appeared in the first 20 results. Darker is better, 20+ means not in the first 20, and a hatched cell means no data for that point.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/structured/rank.ts:rankMetrics (NOT_FOUND_RANK = 21)
      avgRank: {
        title: 'Average map rank',
        body: 'For one search term, the average position the business holds across all points of the grid; 1 is best. A point where the business is not in the first 20 results counts as 21. The line chart shows the average scan by scan.',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/tools/src/tools/rankings.ts:getShareOfVoice (top-3 slots per grid point; OTHER_BUSINESSES = "Other businesses")
      sov: {
        title: 'Share of voice',
        body: 'Of all the top-3 spots in a scan (the local pack, the map results Google shows first), across every grid point, the share each business holds. A business holding 12 of 60 spots has 20%. Businesses that are not tracked are grouped as "Other businesses".',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/worker/src/jobs/vendor.ts:rankSchedule (cron "0 6 * * 0": weekly)
      schedule: {
        title: 'When scans run',
        body: 'A rank scan runs once a week. Every scan is kept, so you can follow the trend with the slider or compare two scans.',
      },
      // source: apps/web/src/components/charts/change-grid.tsx:changeFill (blue = moved up, orange = moved down, "=" = same; step per 1-2, 3-5, 6+ places); rankings/page.tsx (settingsKey must match)
      compare: {
        title: 'Compare two scans',
        body: 'Pick two scans to see the change at each point: blue means the business moved up, orange means it moved down, "=" means no change, and the number is how many places. Only scans with the same settings can be compared.',
      },
      // source: packages/tools/src/limits.ts:RANK_MANUAL_PER_CLIENT_DAYS (7), RANK_MANUAL_PER_AGENCY_DAY (10); packages/tools/src/rank-scan.ts:rankScanAvailability (UTC day; monthly cost cap); apps/worker/src/jobs/vendor.ts:rankSchedule (Sunday 06:00 UTC); packages/collectors/src/rankings/settings.ts (RANK_MAX_KEYWORDS 5)
      scanNow: {
        title: 'Scan now limits',
        body: 'The weekly scan runs on Sundays at 06:00 UTC. Scan now starts an extra one. A client can be scanned by hand once every 7 days, and your agency can start 10 manual scans a day (counted per UTC day). A scan that would push the client past its monthly cost cap is refused. Rank settings change the keywords (up to 5), grid size and radius for the next scan.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noKeywordsAgency: { title: 'Rank tracking has not started', body: 'Add keywords and a service area on the Business profile page. The weekly scan then picks the client up, or you can start one with Scan now.', audience: 'agency' },
      noKeywordsClient: { title: 'Rank tracking has not started', body: "Rank tracking starts once {agency} has set up {client}'s keywords and service area.", audience: 'client' },
      noScan: { title: 'No scan yet', body: 'Scans run once a week. The first one fills this page with a map of where {client} shows up in local results.' },
      noBusinessAgency: { title: 'No business to show yet', body: "Add {client}'s Google place id on the Business profile page, or track a competitor, to see a grid.", audience: 'agency' },
      noBusinessClient: { title: 'No business to show yet', body: "The grid appears once {agency} has added {client}'s Google business or a competitor.", audience: 'client' },
      compareNeedsTwo: { title: 'Compare needs two scans', body: 'Scans run once a week, so Compare is available after the second one.' },
    },
  },
  'client.moves': {
    description: 'Patterns across several changes, such as a competitor expanding, cutting prices or pushing ads. Each one is backed by the changes listed.',
    tips: {
      // source: packages/engine/src/moves/moves-stage.ts:nextStatus (ACTIVE_AFTER_DAYS 7, FADING_AFTER_DAYS 30, CLOSE_AFTER_DAYS 30); packages/tools/src/tools/moves.ts:listMoves (open = not closed)
      statuses: {
        title: 'Move statuses',
        body: 'Emerging: just spotted. Active: it has held for 7 days, or the evidence is strong. Fading: no new supporting change for 30 days. Closed: the pattern has not held for 30 days. Open covers every move that is not closed.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/moves/move-card.tsx (eventCount shown as "N signals"); packages/tools/src/tools/moves.ts (eventCount = live supporting events)
      signals: {
        title: 'Signals on a move',
        body: 'The signals on a move are the changes that support it: "3 signals" means three changes by this competitor fit the pattern. The list shows each one with its evidence. They are not the signal pills on the Competitors page.',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noOpen: { title: 'No open moves', body: "A move is a pattern in one competitor's changes, such as a price war or an ad surge. It appears here when one is spotted. Choose Closed or All to see earlier ones." },
      noMatch: { title: 'No moves here', body: "Moves are spotted from patterns in a competitor's changes, so a quiet stretch can have none." },
      noSelection: { title: 'Pick a move', body: 'Select a move on the left to see the changes behind it and their evidence.' },
    },
  },
} as const satisfies Record<`client.${string}`, PageCopy>;
