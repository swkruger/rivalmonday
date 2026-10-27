import type { PageCopy } from '.';

/**
 * Short in-page help copy for the client pages (`client.*`): the 15b-1 pilot pages plus the 15b-2 client batch, signed
 * off per batch (`docs/archive/phase-15b1-copy-signoff.md`, `docs/archive/phase-15b2-copy-signoff-client.md`).
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
        body: 'How much each competitor has been doing lately, from 0 to 100: its changes from the last 30 days that made the brief or an alert, plus its open moves. The label reads High pressure (70 and above), Medium pressure (40 to 69), Low pressure (1 to 39) or Quiet (0). The line under each name is its main reason.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noBrief: { title: 'No briefs yet', body: "The first brief arrives on a Monday morning. It covers what {client}'s competitors changed, why it matters and what to do." },
      noCompetitorsAgency: { title: 'No competitors tracked yet', body: 'Add competitors on the Competitors page to see how much pressure each one puts on {client}.', audience: 'agency' },
      noCompetitorsClient: { title: 'No competitors tracked yet', body: 'Your competitors appear here once {agency} has set them up.', audience: 'client' },
      noMoves: { title: 'No moves right now', body: "A move is a pattern in a competitor's changes, such as a price war or an ad surge. Moves show here when one is spotted." },
      // The page shows noRecommendationsAsk only to a viewer who can save from an answer (Ask on, feedback permission), noRecommendations otherwise.
      noRecommendations: { title: 'Nothing open right now', body: 'New recommendations come with each brief.' },
      noRecommendationsAsk: { title: 'Nothing open right now', body: 'New recommendations come with each brief. You can also save one from an {assistant} answer.' },
      // source: packages/engine/src/reports/quarterly.ts:runQuarterlyReports (days 1-7 of January, April, July and October, the previous quarter)
      noReports: { title: 'No quarterly reports yet', body: 'A report arrives in the first week after each quarter ends.' },
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
      // source: packages/engine/src/reviews/benchmark.ts:summarizeWindow; apps/web/src/components/charts/topic-heatmap.tsx:sentimentFill
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
      noTrackedReadOnly: { title: 'No competitors tracked yet', body: 'No competitors are tracked for {client} yet. This session is read-only, so none can be added.', audience: 'agency' },
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
        body: "Compares the competitor's lowest price for a service now with its lowest price 90 days ago. A red ▼ means the price fell and a green ▲ means it rose. The tag shows only when both prices are known and they differ, and it always looks back 90 days, whatever period you pick for the history. Promo marks a price listed as a promotion.",
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
      // source: packages/tools/src/limits.ts:RANK_MANUAL_PER_CLIENT_DAYS (7), RANK_MANUAL_PER_AGENCY_DAY (10); packages/tools/src/rank-scan.ts:rankScanAvailability (UTC day; monthly credit limit); apps/worker/src/jobs/vendor.ts:rankSchedule (Sunday 06:00 UTC); packages/collectors/src/rankings/settings.ts (RANK_MAX_KEYWORDS 5)
      scanNow: {
        title: 'Manual scan limits',
        body: 'The weekly scan runs on Sundays at 06:00 UTC. Scan now starts an extra one. A client can be scanned by hand once every 7 days, and your agency can start 10 manual scans a day (counted per UTC day). A scan that would take the client past its monthly credit limit waits until next month. Rank settings change the keywords (up to 5), grid size and radius for the next scan.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noKeywordsAgency: { title: 'Rank tracking has not started', body: 'Add keywords and a service area on the Business profile page. The weekly scan then picks the client up, or you can start one with Scan now.', audience: 'agency' },
      noKeywordsClient: { title: 'Rank tracking has not started', body: "Rank tracking starts once {agency} has set up {client}'s keywords and service area.", audience: 'client' },
      noScan: { title: 'No scan yet', body: 'Scans run once a week. The first one fills this page with a map of where {client} shows up in local results.' },
      noBusinessAgency: { title: 'No business to show yet', body: "Add {client}'s Google Place ID on the Business profile page, or track a competitor, to see a grid.", audience: 'agency' },
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
      // source: apps/web/src/app/(app)/c/[clientId]/moves/move-card.tsx (eventCount shown as "N changes"); packages/tools/src/tools/moves.ts (eventCount = live supporting events)
      signals: {
        title: 'Changes behind a move',
        body: 'A move is backed by changes: “3 changes” means three changes by this competitor fit the pattern. The list shows each one with its evidence. They are not the signal pills on the Competitors page.',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noOpen: { title: 'No open moves', body: "A move is a pattern in one competitor's changes, such as a price war or an ad surge. It appears here when one is spotted. Choose Closed or All to see earlier ones." },
      noMatch: { title: 'No moves here', body: "Moves are spotted from patterns in a competitor's changes, so a quiet stretch can have none." },
      noSelection: { title: 'Pick a move', body: 'Select a move on the left to see the changes behind it and their evidence.' },
    },
  },
  'client.recommendations': {
    description: 'Next steps from your weekly briefs and detected competitor moves.',
    tips: {
      // source: apps/web/src/components/recommendation-board.tsx:RecommendationBoard (columns, targetsFor, ReopenForm, DismissDialog); packages/core/src/access.ts:ROLE_PERMISSIONS (client_viewer has read only)
      stages: {
        title: 'Recommendation stages',
        body: 'To do, In progress and Done are the stages. Use Start, Done or Back to to-do on a card to move it. A dismissed recommendation goes to the list at the bottom with the reason given, and can be reopened. People with view-only access can read the board but not change it.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/components/recommendation-board.tsx:RecommendationCard (Effort/Impact chips via labelFor(LEVEL)); apps/web/src/lib/labels.ts:LEVEL (L, M, H shown as Low, Medium, High)
      effortImpact: {
        title: 'Effort and impact',
        body: 'Rough estimates, shown as Low, Medium or High: how much work the step is (Effort) and how much it could help (Impact). They help you pick where to start. They are estimates, not measurements.',
      },
      // source: packages/engine/src/briefs/recommendations.ts (owner client | agency); apps/web/src/components/recommendation-board.tsx:RecommendationCard ("For you" / "Agency"; agency roles see "Client" / "Agency")
      owner: {
        title: 'For you or Agency',
        body: '"For you" marks a step the business owner can take, such as asking customers for reviews. "Agency" marks a step {agency} can take. Agency users see "For you" as "Client".',
      },
      // source: apps/web/src/components/recommendation-board.tsx:SOURCE_LABEL; packages/engine/src/briefs/recommendations.ts:recommendationFromItem (source brief) and the move plays (source move)
      origin: {
        title: 'Where a recommendation came from',
        body: "From weekly brief: the step is the recommended action of a brief item. From a detected move: it answers a pattern in a competitor's changes. From Ask: it was saved from an assistant answer. The evidence links on each card open the stored proof.",
        guideAnchor: 'what-this-page-tells-you',
      },
    },
    empty: {
      // The page shows noRecsAsk only to a viewer who can save from an answer (the Ask module on and the feedback permission), noRecs otherwise.
      noRecs: { title: 'No recommendations yet', body: 'Recommendations arrive with each approved weekly brief, and when a competitor move calls for a response.' },
      noRecsAsk: { title: 'No recommendations yet', body: 'Recommendations arrive with each approved weekly brief, and when a competitor move calls for a response. You can also save one from an {assistant} answer.' },
    },
  },
  'client.ask': {
    description: 'Questions about your competitors and market, answered from the monitored evidence.',
    tips: {
      // source: packages/ask/src/prompt.ts:buildSystemPrompt (rules 1, 2, 6); packages/ask/src/grounding.ts:groundAnswer (unsupported sentences removed)
      answers: {
        title: 'How answers are checked',
        body: '{assistant} answers from what has been monitored for {client}, such as changes, prices, ads and reviews. Facts link to their evidence. A sentence that starts with "Possible reason:" is an interpretation, not a stated fact. Sentences the evidence does not support are removed before you see the answer, and if there is no evidence for something, the answer says so.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/ask/src/starters.ts:generateStarters (four questions from the last 7 days of events); packages/tools/src/tools/ask-threads.ts:getAskStarters (general questions until a set exists)
      starters: {
        title: 'Starter questions',
        body: 'Four suggested questions, written from what competitors did in the last 7 days. Until the first set exists you see general ones. Pick one to ask it, or type your own.',
      },
      // source: apps/web/src/components/ask/ask-chat.tsx:disclosureCopy; apps/web/src/components/ask/thread-list.tsx (delete); apps/web/src/app/(app)/c/[clientId]/ask/ask-screen.tsx:ASK_PRIVATE_COPY; packages/tools/src/tools/ask-threads.ts:getAskStarters (reviewAllowed)
      privacy: {
        title: 'Who can see your questions',
        body: 'Your questions and answers are private to you; other people at {client} or {agency} cannot open them. When a line under the box says conversations may be reviewed to improve answers, the people it names can read them. That line shows only while review is allowed for {client}. Delete a conversation with the bin icon beside it and confirm. While conversations may be reviewed, the people named in that line can still read it.',
        guideAnchor: 'common-questions',
      },
      // source: packages/ask/src/actions.ts:actionSummary (add_recommendation, update_recommendation_status, submit_feedback); apps/web/src/components/ask/confirm-card.tsx; apps/web/src/components/ask/save-recommendation-dialog.tsx
      changes: {
        title: 'What {assistant} can change',
        body: '{assistant} can propose saving a recommendation, changing a recommendation\'s status or rating a change. It shows a card with what it would do, and nothing happens until you confirm. Under an answer that cites evidence, "Save as recommendation" adds it to the Recommendations page.',
        guideAnchor: 'how-to-use-it',
      },
    },
  },
  'client.ask.thread': {
    description: 'A saved conversation. It is private to you, and you can delete it from the list.',
    // The thread page shows the tips of client.ask (answers, privacy, changes).
    tips: {},
  },
  'client.briefs': {
    description: "{client}'s weekly briefs, alerts and quarterly reports, newest first.",
    tips: {
      // source: packages/engine/src/briefs/deliver.ts:DELIVERY_LOCAL_HOUR (Monday 07:00 client time); packages/engine/src/score/score.ts:scoreForClient (alert and brief routes); packages/engine/src/reports/quarterly.ts:runQuarterlyReports (first week of a quarter); packages/engine/src/briefs/starting-point.ts (starting_point kind)
      kinds: {
        title: 'Briefs, alerts and reports',
        body: 'A weekly brief arrives on Monday morning: what changed, why it matters and what to do. An alert is a change important enough to send between briefs. A quarterly report gives the numbers for the quarter that just ended. A brief tagged Starting point is the first one, showing where {client} stands before weekly briefs begin.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/lib/labels.ts:BRIEF_STATUS, ALERT_STATUS, REPORT_STATUS; apps/web/src/app/(app)/c/[clientId]/briefs/page.tsx (chips for agency roles only; client roles only get delivered items)
      status: {
        title: 'Status chips',
        body: 'The chip shows where each item stands in your review, such as Ready for review (briefs), Waiting for review (alerts), Approved or Sent; a report that could not be prepared shows Failed. Items waiting for review are in Approvals. Client users only see items that were delivered, and no chips.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noBriefs: { title: 'No weekly briefs yet', body: 'The first one arrives the Monday after setup is complete.' },
      noAlerts: { title: 'No alerts yet', body: 'Alerts are sent when a competitor makes an urgent change.' },
      // source: packages/engine/src/reports/quarterly.ts:runQuarterlyReports (days 1-7 of January, April, July and October, the previous quarter)
      noReports: { title: 'No quarterly reports yet', body: 'A report arrives in the first week after each quarter ends, and covers that quarter.' },
    },
  },
  'client.briefs.detail': {
    description: "What {client}'s competitors did, why it matters and what to do about it. Every point links to its evidence.",
    tips: {
      // source: apps/web/src/components/confidence-label.ts:confidenceLabel ("High confidence NN%" / "Confidence NN%", amber edge on the high band; the threshold itself is agency-only); packages/db/src/schema/briefs.ts:briefItem.confidence
      confidence: {
        title: 'Confidence',
        body: 'The percentage on each point shows how well the evidence supports it. Higher is better supported. "High confidence" marks the points we are most sure of, which also have an amber edge. Every point links to its evidence either way.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/components/evidence-chips.tsx:EvidenceChips (Evidence N links open /c/<id>/evidence/<evidenceId>)
      evidence: {
        title: 'Evidence links',
        body: 'Each Evidence link opens the stored proof for the point above it: a snapshot, text or data captured from public information, with the date and a fingerprint that shows it has not been altered.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/briefs/generate.ts:QUIET_SUMMARY (kind quiet stores the scorecard); packages/engine/src/briefs/scorecard-model.ts:scorecardModel (tiles Rating, New reviews 90 d, Reply rate, Top-3 in map pack; rivals median; since your starting point)
      quiet: {
        title: 'Quiet weeks',
        body: 'When no competitor made a significant move, the brief shows where {client} stands instead: rating, new reviews in the last 90 days, reply rate and share of top-3 map spots, each next to the median of the rivals we watch and the change since the starting point. The table lists every business.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/briefs/starting-point.ts; packages/engine/src/briefs/scorecard-model.ts:scorecardModel; apps/web/src/components/views/brief-view.tsx:BriefView (First moves still open)
      startingPoint: {
        title: 'About the starting point',
        body: 'The first brief. It shows where {client} stands against the competitors we watch on day one, and the first moves to make. Weekly briefs after it show what has changed since.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/briefs/trend.ts:trendSnapshot (TREND_WINDOW_DAYS 30; reviews, rating before and after, active ads); apps/web/src/components/views/brief-view.tsx:TrendTable (caption "Last N days")
      trend: {
        title: 'The last-days table',
        body: 'Numbers for {client} and each competitor over the period in the table caption: new reviews, average rating before and after, and ads running now. A dash in Active ads means not checked for that business.',
      },
    },
  },
  'client.alerts.detail': {
    description: 'A change important enough to send between weekly briefs, with the evidence behind it.',
    tips: {
      // source: packages/engine/src/score/score.ts:scoreForClient (alert, brief and archived routes)
      alertVsBrief: {
        title: 'Alert or brief',
        body: 'An alert is a change that was important enough to send straight away. Smaller changes wait for the weekly brief, and the smallest are only recorded. Every alert links to the evidence behind it.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/score/score.ts:scoreForClient (score 0-100, alert level); apps/web/src/lib/labels.ts:ALERT_STATUS; apps/web/src/components/views/alert-view.tsx ("Template text")
      score: {
        title: 'Score, status and template text',
        body: 'The score is the change\'s score from 0 to 100; an alert is sent when it reaches the client\'s alert level (Settings › Alert rules). The status shows where the alert is in your review. "Template text" means the written text did not pass verification, so a fixed template was used instead.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
  },
  'client.reports.detail': {
    description: 'The numbers for one quarter: how {client} and its competitors compared, what changed and what was done about it.',
    tips: {
      // source: packages/engine/src/reports/quarterly.ts:computeTrendReport (QUARTER_WINDOW_DAYS 90, trendSnapshot businesses); packages/engine/src/briefs/trend.ts:trendSnapshot (activeAds = adActivity.activeNow, null for the client itself); apps/web/src/components/views/report-view.tsx (▲ ▼)
      businesses: {
        title: 'Reviews, rating and ads',
        body: 'Reviews: new Google reviews in the last 90 days of the quarter. Average rating: the average stars over those 90 days; ▲ or ▼ shows it rose or fell compared with the 90 days before. Active ads: ads running when the report was made, shown only for competitors.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/reports/quarterly.ts:computeTrendReport (byType: scored events in the period, cosmetic and retracted excluded)
      changes: {
        title: 'Changes detected',
        body: 'How many changes were scored for {client} during the quarter, grouped by type. Tiny cosmetic changes are left out.',
      },
      // source: packages/engine/src/reports/quarterly.ts:computeTrendReport (moves first detected in the period with at least one live event; status closed when closedAt is set)
      moves: {
        title: 'Moves in the quarter',
        body: 'Moves first detected during the quarter, with their status when the report was made. A move counts only while at least one change behind it is still valid.',
      },
      // source: packages/engine/src/reports/quarterly.ts:computeTrendReport (briefsSent, alertsDelivered, recommendations created, done, inProgress, dismissed by status at report time)
      activity: {
        title: 'Briefs, alerts and recommendations',
        body: 'Briefs sent and alerts delivered during the quarter, and the recommendations created in it, counted by where each one stood when the report was made: Done, In progress or Dismissed.',
      },
    },
    empty: {
      noData: { title: 'No figures in this report', body: 'This quarter had no data to report for {client}. The next report comes after the quarter ends.' },
    },
  },
  'client.evidence.detail': {
    description: 'The stored proof behind a point in a brief or alert: what was captured, when, and its fingerprint.',
    tips: {
      // source: apps/web/src/app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx (Source row: web evidence reads "captured by our monitoring service"); packages/db/src/schema/evidence.ts:capture, evidence (immutable)
      captured: {
        title: 'Where this was captured',
        body: "Pages on a competitor's own website are captured automatically by our monitoring service. Other sources, such as Google profiles and ad libraries, are recorded when their data is collected. Once stored, evidence is never edited.",
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/core/src/domain.ts:CAPTURE_STATUSES; packages/db/src/schema/evidence.ts:capture.status
      status: {
        title: 'Capture status',
        body: 'Whether the capture worked. "ok" means the page or data was read normally.',
      },
      // source: packages/collectors/src/evidence/recorder.ts:sha256Hex; packages/db/src/schema/evidence.ts:evidence.sha256
      fingerprint: {
        title: 'What the fingerprint is',
        body: 'A long code (a SHA-256 hash) worked out from the captured content. The same content always gives the same code, and changing even one character gives a completely different one. Working the code out again from the stored file and getting the same result shows it has not been altered since it was captured.',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx (Kept row: legalHold, retention policy, delivered brief)
      kept: {
        title: 'How long evidence is kept',
        body: 'Evidence is kept under the retention policy, and for as long as a delivered brief cites it. Evidence on legal hold is never deleted.',
      },
    },
  },
  'client.pitch-snapshot': {
    description: 'The market picture shown to {client} before it became a client: its Google profile, ads and map visibility next to its competitors.',
    tips: {
      // source: apps/web/src/components/prospect-landscape.tsx:ProspectLandscape ("No AI-written text"); packages/db/src/schema/client-intel.ts:ProspectBusiness (ads null = not checked)
      figures: {
        title: 'Where the figures come from',
        body: 'Figures only, straight from stored data, with no AI-written text. Rating, reviews and category come from the Google Business Profile, and ads running from the Google and Meta ad libraries. "Not checked" means there was no website or Meta page to look up.',
        audience: 'agency',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/collectors/src/prospect/report.ts:summarizeRanks (found, top3, averageRank over the points where the business appears); apps/web/src/components/prospect-landscape.tsx (3x3 grid, "not in the top 20")
      mapVisibility: {
        title: 'Reading map visibility',
        body: 'Each cell reads "found/points · top 3 · avg". For one search term, found is the number of grid points where the business appeared, top 3 is how many of those it was in the first three, and avg is its average position at the points where it appeared. Unlike Local rankings, points where it did not appear are not counted as 21.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
  },
  'client.setup': {
    description: 'Get {client} ready for monitoring: confirm the business, then choose the competitors to watch.',
    tips: {
      // source: apps/web/src/app/(app)/c/[clientId]/setup/wizard-steps.ts:STEPS, stepsFor (staff see 5 steps for a client, 4 for a prospect); setup-wizard.tsx (Dismiss setup; the stepper opens the first step not done); setup/page.tsx (closed setup stays editable in settings)
      stepsAgency: {
        title: 'About the setup steps',
        body: 'A client has five steps: Your business, Finding competitors, Pick competitors, Invite the owner and Billing. A prospect has the first four. You can skip a step and come back, and setup reopens at the first step that is not done. Dismiss setup hides it; everything stays editable under Client settings and on the Competitors page.',
        audience: 'agency',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/setup/wizard-steps.ts:stepsFor (client roles see the first 3 steps; currentStep = first step not done)
      stepsClient: {
        title: 'About the setup steps',
        body: 'Setup has three steps: Your business, Finding competitors and Pick competitors. Confirm the details, wait while we look for competitors, then choose the ones to watch. You can leave and come back; setup reopens at the first step that is not done.',
        audience: 'client',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/briefs/setup-clock.ts:startingPointClockStart, SETUP_HOLD_DAYS (14); packages/engine/src/briefs/readiness.ts:startingPointReadiness, STARTING_POINT_WAIT_HOURS (48)
      firstBrief: {
        title: 'Your first brief',
        body: 'The first brief, the starting point, shows where {client} stands next to its competitors. Its 48-hour wait starts when the competitors step is done (or setup is dismissed). It is made as soon as the business profile, reviews, first map scan and competitors are ready, or when those 48 hours are up. If setup never reaches the competitors step, the brief is held for at most 14 days after the client was added.',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/client-input.ts (service area, keywords); packages/engine/src/briefs/readiness.ts:startingPointReadiness (rankings need keywords and a service area); apps/web/src/app/(app)/c/[clientId]/setup/steps/business-step.tsx (Advanced: map centre, Google listing)
      serviceArea: {
        title: 'Service area',
        body: 'Where {client} serves: a radius around a centre point, plus ZIP codes and towns if you list them. Competitor suggestions and local-ranking scans both use it. The centre point and the Google listing sit under Advanced; they are filled in from the lookup, so you will rarely need to touch them.',
        guideAnchor: 'how-to-use-it',
      },
    },
  },
  // 16 §7 (Task 9): the owner's own pick screen; the staff wizard keeps `client.setup`. Tips and the guide text are Task 11.
  'client.setup.competitors': {
    description: 'Choose which nearby businesses {agency} should compare {client} with each week.',
    tips: {},
  },
  'client.settings.profile': {
    description: "The services, search keywords and service area used to find and compare {client}'s competitors.",
    tips: {
      // source: packages/tools/src/client-input.ts:MAX_KEYWORDS (5); apps/web/src/components/client-profile-form.tsx (keywords "Used for competitor discovery and local-ranking scans")
      servicesKeywords: {
        title: 'Services and keywords',
        body: 'Services are what the business offers. Keywords are the searches customers use, up to 5, for example “ac repair”. Both are used to find competitors and to scan local rankings.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/components/services-area-summary.tsx (Area line "N ZIP codes"); packages/engine/src/briefs/readiness.ts:startingPointReadiness (service area used for rank scans and discovery)
      area: {
        title: 'Service area',
        body: 'A radius around the business, plus any ZIP codes and towns that are listed. “0 ZIP codes” means none are listed; the radius still applies. It decides which competitors are suggested and where local rankings are scanned.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/components/services-area-summary.tsx (Linked / Not linked from placeId); apps/web/src/app/(app)/c/[clientId]/setup/steps/business-step.tsx (placeId hint: benchmark the business's own reviews)
      googleProfile: {
        title: 'Google Business Profile',
        body: "Linked means {client}'s Google listing is connected, which lets us compare its reviews with its competitors'. Not linked means the listing still needs to be connected.",
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/settings/profile/client-features-form.tsx:SWITCHES, askReviewAllowed (agency admins only)
      features: {
        title: 'Client features',
        body: "Which parts of the workspace the client can use: the dashboard, alert rules, managing competitors, the {assistant} and the AI connection page. A feature that is off is hidden from the client, not from your team. Allow review, for admins only, lets the platform team read this client's {assistant} conversations to improve answers.",
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      change: {
        title: 'Changing these details',
        body: 'Your agency keeps these details up to date because they decide which competitors are watched. If something is wrong, contact {agency}.',
        audience: 'client',
      },
    },
  },
  'client.settings.delivery': {
    description: "How and when {client} receives alerts and briefs, in the business's own time zone, and who they go to.",
    tips: {
      // source: apps/web/src/app/(app)/c/[clientId]/settings/delivery/delivery-controls.tsx:MODES; packages/engine/src/alerts/route.ts:processAlert, ALERTS_PER_DAY (3), releaseAlert; packages/engine/src/alerts/digest.ts:DIGEST_LOCAL_HOUR (17)
      alertMode: {
        title: 'Alert mode',
        body: 'Direct sends each alert to the client at once. I review alerts first holds each alert for you to approve or dismiss before it is sent. Digest only never sends alerts one by one: they go out together in one digest from 17:00 business time. In every mode a client gets at most 3 instant alerts a day; any extra waits for that evening digest.',
        audience: 'agency',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/briefs/deliver.ts:deliverDueBriefs, isUntouched (no human edit, drop or reorder), notifyOverdue, DELIVERY_LOCAL_HOUR (7)
      autoSend: {
        title: 'Automatic sending',
        body: 'When on, a weekly brief that nobody has edited, dropped or reordered items in is approved and sent on Monday from 07:00 business time. A brief you touched waits for your approval, and you are told it is overdue.',
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/engine/src/briefs/deliver.ts:DELIVERY_LOCAL_HOUR (7); packages/engine/src/alerts/digest.ts:DIGEST_LOCAL_HOUR (17); packages/engine/src/reports/quarterly.ts:runQuarterlyReports (08:00 client-local); packages/engine/src/alerts/route.ts:releaseAlert (local day)
      timezone: {
        title: 'What runs on this clock',
        body: "The clock for this client's deliveries: weekly briefs go out on Monday at 07:00, the evening digest from 17:00, quarterly reports from 08:00 in the first week of a quarter, and the 3-a-day alert limit counts each local day. It is the business's time zone, not your agency's.",
        audience: 'agency',
        guideAnchor: 'common-questions',
      },
      // source: packages/engine/src/delivery/contacts.ts:recipientsFor (active contacts of the client, each person's own notification preferences); settings/delivery/page.tsx:ROLE_LABEL; delivery-controls.tsx:DeactivateRecipientButton; packages/core/src/tokens.ts:grantableScopes; settings/billing/page.tsx (client owner only)
      recipients: {
        title: 'Recipients',
        body: "The people who get this client's alerts and briefs. An Owner can also sign in and use whatever the client's features allow, including billing; a Viewer can only look. Each person can switch off kinds of message in their own preferences. Deactivating someone stops their messages, and links already sent to them stop working.",
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
    },
    empty: {
      noRecipients: { title: 'No recipients yet', body: "Nobody receives this client's alerts or briefs yet. Add the owner's email below.", audience: 'agency' },
    },
  },
  'client.settings.alerts': {
    description: 'The score at which a competitor change becomes an instant alert or goes into the weekly brief.',
    tips: {
      // source: packages/engine/src/score/score.ts:scoreForClient (alert, brief and archived routes); apps/web/src/components/runbook/knob-card.tsx:thresholdError (brief 1-99, alert 2-100, brief below alert); settings/alerts/page.tsx
      levels: {
        title: 'Alert and brief levels',
        body: 'Every competitor change gets a score from 0 to 100 for how much it matters to {client}. At or above the alert level it is an instant alert; from the brief level up to the alert level it goes in the weekly brief; below the brief level it is archived but still listed under Changes. Both levels are whole numbers: brief 1 to 99, alert 2 to 100, with brief lower than alert. New levels apply to changes detected from now on.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/engine/src/alerts/route.ts:ALERTS_PER_DAY (3), releaseAlert (client-local day, extras become digest); packages/engine/src/alerts/digest.ts:DIGEST_LOCAL_HOUR (17)
      dailyLimit: {
        title: 'Instant alerts per day',
        body: "A client gets at most 3 instant alerts a day, counted on the business's local day. Extra alerts wait for the evening digest, sent from 17:00 business time. How alerts are released is set under Delivery.",
        audience: 'agency',
        guideAnchor: 'common-questions',
      },
    },
  },
  'client.settings.ai': {
    description: "Connect Claude, ChatGPT or another AI assistant to {client}'s competitor data. Answers come with the same evidence links you see here.",
    tips: {
      // source: apps/web/src/components/ai-connections.tsx:ConnectorUrlCard
      connector: {
        title: 'Adding the connector',
        body: 'Paste the connector URL into your AI assistant, then sign in and choose this workspace. Claude and ChatGPT add it from their Connectors settings. For Claude Code, create a token first and run the command shown.',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/components/ai-connections.tsx:AccessTokensCard, ShownOncePanel, RevokeTokenButton
      tokens: {
        title: 'What a token is',
        body: 'A token is a password for tools that cannot sign in, such as Claude Code or a script. It acts as you, with the permission level you choose. It is shown once when you create it, so copy it straight away. Revoke it at any time and anything using it stops working.',
        guideAnchor: 'common-questions',
      },
      // source: packages/core/src/tokens.ts:grantableScopes, effectiveScope (client owner: read, feedback; client viewer: read); packages/core/src/tools.ts:mcpScopeOf; apps/web/src/components/ai-connections.tsx:ACCESS_LABEL
      levels: {
        title: 'Permission levels',
        body: "Read only lets an assistant look things up. Read and feedback also lets it record feedback, such as changing a recommendation's status or rating a change. A token or connected app never gets more than your own role allows: owners can choose either level, viewers only Read only.",
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/settings/ai/page.tsx (agency roles cannot create tokens here; an admin sees everyone's)
      agencyTokens: {
        title: 'Agency tokens',
        body: "Agency roles do not create tokens on a client page. Agency-wide tokens live under Agency settings › AI connections, where a third level, Read, feedback and manage, is available. Here you see this client's tokens and connected apps; an admin sees everyone's.",
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/components/ai-connections.tsx:ConnectedAppsCard, DisconnectButton
      apps: {
        title: 'Connected apps',
        body: 'Apps that were connected by signing in, rather than with a token. Each shows its permission level and which workspace it can reach. Disconnect removes its access straight away, and the app has to ask again next time.',
        guideAnchor: 'common-questions',
      },
    },
    empty: {
      noTokens: { title: 'No access tokens yet', body: 'Create one when a tool such as Claude Code needs access. Assistants you connect by signing in, like Claude or ChatGPT, do not need a token.' },
      noApps: { title: 'No connected apps yet', body: 'Paste the connector URL into Claude or ChatGPT and sign in. The app then shows up here.' },
    },
  },
  'client.settings.billing': {
    description: 'The status of your plan, your next charge and your payment method.',
    tips: {
      // source: apps/web/src/app/(app)/c/[clientId]/settings/billing/page.tsx:statusOf
      status: {
        title: 'Billing status',
        body: 'Active: your plan is running. Payment needed: the last payment did not go through, so update your payment method. Awaiting payment setup: {agency} has emailed you a payment link. Cancelled: the plan is cancelled; if an end date is shown, that is the last day covered and there are no further charges. Paused: monitoring is paused, so contact {agency}. Not set up: billing has not been turned on for this workspace, so contact {agency}. Not available: your agency has not shared the billing details here; contact them.',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/app/(app)/c/[clientId]/settings/billing/page.tsx (nextChargeDate, nextChargeAmountCents, endsOn); packages/tools/src/tools/my-billing.ts:getMyBillingTool
      nextCharge: {
        title: 'Next charge',
        body: 'The date and amount of your next payment. If there is no next date, the page shows the monthly amount instead. When a plan is ending, it shows the day it ends rather than a charge.',
        guideAnchor: 'common-questions',
      },
      // source: packages/tools/src/tools/my-billing.ts:getMyBillingTool (canManagePayment), openBillingPortalTool (payment method and invoices, returns to this page)
      managePayment: {
        title: 'Manage payment details',
        body: 'Opens a secure payment page where you update your payment method and see your invoices, then brings you back here. The button appears once payment details exist; before that, use the payment link {agency} emailed you.',
        guideAnchor: 'how-to-use-it',
      },
    },
  },
  'client.settings.usage': {
    description: "This month's credits for {client}'s monitoring, compared with the monthly limit. Months run on UTC.",
    tips: {
      // source: packages/tools/src/tools/my-usage.ts:getMyUsageTool (credits used, limit; UTC month); apps/web/src/app/(app)/c/[clientId]/settings/usage/page.tsx
      credits: {
        title: 'Credits',
        body: 'Credits measure the monitoring and AI work done for {client} this month, against the monthly limit. The count starts again on the 1st of each month (UTC).',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: packages/core/src/spend.ts:SPEND_NEAR_RATIO (0.8), spendLevel; apps/web/src/components/spend-badge.tsx; apps/web/src/lib/spend-copy.ts
      status: {
        title: 'Near limit, limit reached and paused',
        body: 'From 80% of the limit the page says Near limit. At 100% it says Limit reached: nothing changes, and monitoring, briefs and Ask carry on as normal. Well past the limit, monitoring and new briefs pause for the rest of the month and the page says Paused. Past briefs and evidence stay available, and your agency is told.',
        guideAnchor: 'common-questions',
      },
    },
  },
  'client.settings.runbook': {
    description: 'The plays, starting-point rules and settings used for this client’s briefs and recommendations.',
    tips: {
      // source: apps/web/src/components/runbook/runbook-editor.tsx (Plays, Starting-point rules, Settings); knob-card.tsx:KNOB_TITLE; item-card.tsx:ItemCard (EnabledSwitch, rule text)
      sections: {
        title: 'Plays, rules and settings',
        body: 'Plays are the recommendations a brief can suggest, each with a trigger and a template. Starting-point rules shape the first brief. Settings cover the alert and brief thresholds, focus services and competitor tiers. Switch an item off to leave it out.',
        audience: 'agency',
        guideAnchor: 'what-this-page-tells-you',
      },
      // source: apps/web/src/components/runbook/item-card.tsx:badgeFor, PlayEditor
      badges: {
        title: 'Inherited and customised',
        body: "Inherited means the item matches the agency runbook. Customised means someone on your team changed it for this client. Edit changes a play's title, template and the services it applies to; saving marks it Customised.",
        audience: 'agency',
        guideAnchor: 'how-to-use-it',
      },
      // source: apps/web/src/components/runbook/item-card.tsx:UpdatePrompts (Review update, Use the update, Keep mine, Tailored for this client: Approve / Use as is; New: Add / Not now; Removed upstream: Keep / Remove)
      updates: {
        title: 'Update available',
        body: 'The agency runbook changed an item this client inherited. Review update shows what changed, and your own version if you customised it. Use the update takes the new text; for a play it is first tailored to this client, and you choose Approve or Use as is. Keep mine leaves the item as it is. A new item offers Add or Not now; one removed upstream offers Keep or Remove.',
        audience: 'agency',
        guideAnchor: 'common-questions',
      },
      // source: apps/web/src/components/runbook/runbook-editor.tsx (hasRunbook, canEdit); settings/runbook/page.tsx (admins and account managers edit); packages/engine/CLAUDE.md § Runbooks (loadClientRunbook order)
      ownRunbook: {
        title: 'This client’s own runbook',
        body: 'Until you create a runbook for this client, briefs use the agency runbook (HVAC and dental clients use the built-in plays) and this page is view-only. Creating one copies the agency items so you can tailor them. Only admins and account managers can edit.',
        audience: 'agency',
        guideAnchor: 'common-questions',
      },
    },
  },
} as const satisfies Record<`client.${string}`, PageCopy>;
