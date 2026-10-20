import type { HelpAudience } from '@cs/core';

export type PageKey = 'client.overview' | 'client.changes' | 'client.reviews'; // 15b-2 extends
export interface Tip { title: string; body: string; audience?: HelpAudience; guideAnchor?: string }
export interface EmptyCopy { title: string; body: string; audience?: HelpAudience }
export interface PageCopy { description: string; tips?: Record<string, Tip>; empty?: Record<string, EmptyCopy> }

/**
 * Short in-page help copy (15b-1 pilot; draft for owner sign-off in `docs/archive/phase-15b1-copy-signoff.md`).
 * `{agency}`, `{assistant}` and `{client}` are filled by `renderCopy` with the viewer's names. A tip or empty state without
 * an `audience` is for everyone; `agency` copy never reaches client roles. `guideAnchor` values are the guide's section
 * slugs (`what-this-page-tells-you`, `how-to-use-it`, `common-questions`). Metric copy cites the code that computes it.
 */
export const PAGE_COPY = {
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
        body: "Rows are review themes; columns are businesses, {client} first. The number is the share of the last 90 days' reviews that mention the theme. The colour is how positive those mentions are: blue is positive, red is negative, grey is neutral. A dash means there are not enough reviews, and ▲▼ marks a change of 5 points or more since the previous 90 days.",
        guideAnchor: 'how-to-use-it',
      },
      // source: packages/engine/src/reviews/rating-trend.ts:ratingStats (mix counts every collected review by stars)
      ratingMix: { title: 'Your rating mix', body: "How many of {client}'s collected Google reviews gave 1, 2, 3, 4 or 5 stars." },
      // source: packages/engine/src/reviews/rating-trend.ts:ratingStats (monthly average of reviews posted that month); reviews/trend-series.ts (fold beyond 5)
      ratingTrend: { title: 'Rating trend', body: 'The average stars of the reviews posted in each month, for {client} and each competitor. A month without reviews has no point. With many competitors, some are combined into one "Other (average)" line.' },
    },
    empty: {
      noMatch: { title: 'No reviews match', body: 'Try another business, theme or star rating, or a longer period.' },
    },
  },
} as const satisfies Record<PageKey, PageCopy>;
