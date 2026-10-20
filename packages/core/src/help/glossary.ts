import { visibleAudiences, type HelpAudience, type ViewerAudience } from './audience';

export interface GlossaryTerm {
  id: string;
  term: string;
  audience: HelpAudience;
  short: string;
  long?: string;
  seeAlso?: string[];
}

/**
 * 15b-1 glossary (draft for owner sign-off, `docs/archive/phase-15b1-copy-signoff.md`). One source for term tips, the Help
 * pages and the generated KB articles. No placeholders: the web renders `{x}` and the KB `{{x}}`, so either kind would
 * stay literal in the other. Metric definitions cite the code that computes them; change both together.
 */
export const GLOSSARY: readonly GlossaryTerm[] = [
  {
    id: 'competitor',
    term: 'Competitor',
    audience: 'all',
    short: 'A local business that competes for the same customers in the same area. Each one is monitored from public information only: its website, Google profile, reviews, ads and job posts.',
    long: 'Competitors are grouped into tiers. "Top rival" is a tier, not another word for competitor.',
    seeAlso: ['tier', 'signal'],
  },
  {
    // source: packages/collectors/src/rivals/score.ts:tierFor (overlapScores, activityScore); labels: packages/core/src/domain.ts:TIER_LABELS
    id: 'tier',
    term: 'Tier',
    audience: 'all',
    short: 'How closely a competitor competes: Top rival, Worth watching or Minor.',
    long: 'Tiers come from two checks. Overlap: how often the business shows up in Google Maps searches for the same services nearby (a higher spot, a shorter distance and the same main category count for more). Activity: its Google and Meta ads, its new reviews in the last 30 days and whether it has claimed its Google profile. A Top rival is high on both, Worth watching is high on either, and the rest are Minor. When activity could not be checked, Worth watching is the highest tier possible.',
    seeAlso: ['competitor', 'signal'],
  },
  {
    // source: packages/engine/src/score/score.ts:scoreForClient (every change event is scored); cross-channel merge: event.channels
    id: 'change',
    term: 'Change',
    audience: 'all',
    short: "One difference found in a competitor's public information, such as a new price, a new offer or page, an ad that started or stopped, or a jump in reviews.",
    long: 'The same change seen in several places, say the website and an ad, is shown once. Every change links to its evidence and gets a score.',
    seeAlso: ['score', 'move', 'evidence'],
  },
  {
    // source: packages/engine/src/moves/moves-stage.ts:nextStatus (ACTIVE_AFTER_DAYS, ACTIVE_CONFIDENCE, FADING_AFTER_DAYS, CLOSE_AFTER_DAYS); rules.ts:MOVE_WINDOW_DAYS; packages/tools/src/pressure.ts:MOVE_LABELS
    id: 'move',
    term: 'Move',
    audience: 'all',
    short: "A pattern in one competitor's changes over the last 90 days, such as a price war, a promo blitz, an ad surge, a new service line or a push into new areas.",
    long: 'A move starts as Emerging. It becomes Active once it has held for 7 days, or straight away when the evidence is strong. It is Fading when no new supporting change has appeared for 30 days, and it closes when the pattern has not held for 30 days.',
    seeAlso: ['change', 'confidence', 'pressure'],
  },
  {
    // source: apps/web/src/components/rival/signal-pills.tsx:buildPills
    id: 'signal',
    term: 'Signal',
    audience: 'all',
    short: 'A quick fact about a competitor, shown as a small pill: its Google rating, its new reviews in the last 30 days, its Google ads and its Meta ads.',
    long: 'A highlighted pill is worth a look, for example 5 or more new reviews in 30 days, or Google ads that started in the last 30 days. "Not checked" means the fact could not be read yet; it never means zero.',
    seeAlso: ['competitor', 'tier'],
  },
  {
    // source: apps/web/src/app/(app)/c/[clientId]/overview-kpis.ts:latestBrief (weekly briefs carry the Monday date); views/brief-view.tsx
    id: 'brief',
    term: 'Brief',
    audience: 'all',
    short: 'The weekly report on competitors, dated each Monday. Each item says what changed, why it matters and what to do, with its evidence.',
    long: 'A quiet week says so instead of padding the brief, and shows "Where you stand": how the business compares with its competitors on rating, new reviews, reply rate and map positions.',
    seeAlso: ['alert', 'report', 'starting-point'],
  },
  {
    // source: packages/engine/src/reports/quarterly.ts
    id: 'report',
    term: 'Quarterly report',
    audience: 'all',
    short: 'A look at competitor trends over a whole quarter, as a page and a PDF. The first one arrives after a full quarter of monitoring.',
    seeAlso: ['brief'],
  },
  {
    // source: packages/engine/src/score/score.ts:scoreForClient (route 'alert')
    id: 'alert',
    term: 'Alert',
    audience: 'all',
    short: 'A change important enough not to wait for the weekly brief: its score reached the alert level. Alerts arrive between briefs.',
    seeAlso: ['score', 'brief'],
  },
  {
    // source: packages/tools/src/pressure.ts:combinePressure, pressureByClient (PRESSURE_WINDOW_DAYS = 30, moveWeight)
    id: 'pressure',
    term: 'Competitive pressure',
    audience: 'all',
    short: 'How much a competitor has been doing lately that could affect the business, from 0 to 100.',
    long: 'It combines the scores of its changes from the last 30 days that made the brief or an alert, plus its open moves (active, confident moves count for more). Each one adds to the total without it passing 100. 70 and above is high, 40 to 69 is elevated and below 40 is low. A competitor with nothing recent scores 0.',
    seeAlso: ['score', 'move'],
  },
  {
    // source: packages/engine/src/score/score.ts:scoreForClient; default levels: packages/verticals/packs/*.yaml scoring.routing (70 / 40)
    id: 'score',
    term: 'Score',
    audience: 'all',
    short: 'How much a change matters to the business, from 0 to 100. It is 100 × type × size × relevance × novelty, each factor between 0 and 1.',
    long: 'Type: how much this kind of change usually matters. Size: how big it is, such as the size of a price cut. Relevance: whether it touches services the business offers and, for changes to a service area, the area it serves. Novelty: whether it is new rather than a repeat of something already seen. By default a score of 70 or more is an alert, 40 or more goes in the brief, and anything lower is archived.',
    seeAlso: ['change', 'alert'],
  },
  {
    // source: packages/engine/src/score/score.ts:scoreForClient (thresholds, needsReviewCap, staleCap, tierChangeScore); daily cap: c/[clientId]/settings/alerts/page.tsx
    id: 'routing',
    term: 'Routing',
    audience: 'agency',
    short: 'Where a scored change goes: Alert (at or above the alert level), Brief (at or above the brief level) or Archived (below both).',
    long: "Two caps send a would-be alert to the brief instead: the change still needs a human check, or it is too old to be urgent. A competitor promoted to Top rival is routed as an alert, other promotions go to the brief, and demotions are archived. The levels default to 70 and 40 and can be changed per client under Settings › Alert rules. Instant alerts are limited to 3 a day; extra ones go into the daily digest. How an alert then reaches the client (direct, after your check, or digest only) is set under Settings › Delivery.",
    seeAlso: ['score', 'alert'],
  },
  {
    // source: packages/engine/src/moves/rules.ts:moveConfidence; apps/web/src/components/views/brief-view.tsx (amber edge at 0.85)
    id: 'confidence',
    term: 'Confidence',
    audience: 'all',
    short: 'How sure the system is about a change or a move, as a percentage.',
    long: 'For a change, it reflects how clearly the checks could read it. For a move, it grows with each extra supporting change and each extra channel. Brief items at 85% or more have an amber edge.',
    seeAlso: ['move', 'evidence'],
  },
  {
    // source: packages/billing/src/access.ts:countActiveClients (clientServiceable: status active, not paused)
    id: 'seat',
    term: 'Seat',
    audience: 'agency',
    short: "One active client on your agency's plan. Paused clients and prospects don't use a seat.",
    long: 'The plan includes a number of seats; each extra active client is billed as one more seat.',
    seeAlso: ['paused'],
  },
  {
    id: 'business-type',
    term: 'Business type',
    audience: 'all',
    short: 'The kind of business, such as HVAC and plumbing or dental. It decides which services, review themes and scoring rules apply.',
    long: 'Business types come from a shared catalog. Older screens may still call this the vertical or industry.',
    seeAlso: ['theme', 'score'],
  },
  {
    // source: packages/db/src/filters.ts:clientServiceable, agencyServiceable; packages/tools/src/billing-guard.ts (service_paused)
    id: 'paused',
    term: 'Paused',
    audience: 'agency',
    short: 'Means two different things. A paused client gets no scheduled checks, briefs or alerts and does not use a seat. A paused service is your agency subscription on hold for billing.',
    long: "While the service is paused the workspace is read-only and all recurring work stops until billing is sorted out. A paused client's owner sees that monitoring is paused and is asked to contact you.",
    seeAlso: ['seat'],
  },
  {
    // source: apps/web/src/components/shell/client-billing-banner.tsx:pausedCopy
    id: 'monitoring-paused',
    term: 'Monitoring paused',
    audience: 'client',
    short: 'Your agency has paused monitoring for your business. No new checks, briefs or alerts arrive until it is resumed.',
    long: 'Contact your agency to resume.',
  },
  {
    // source: packages/tools/src/tools/rankings.ts:getShareOfVoice
    id: 'share-of-voice',
    term: 'Share of voice',
    audience: 'all',
    short: 'Of all the top-3 map spots in a weekly rank scan (every grid point and search term), the share each business holds.',
    long: 'For example, a business that holds 12 of 60 top-3 spots has a 20% share of voice. Businesses that are not tracked are grouped as "Other businesses".',
    seeAlso: ['local-pack', 'average-map-rank'],
  },
  {
    // source: packages/engine/src/structured/rank.ts (NOT_FOUND_RANK, top-3 share); packages/tools/src/tools/rankings.ts:getShareOfVoice
    id: 'local-pack',
    term: 'Local pack',
    audience: 'all',
    short: 'The few businesses Google shows with a map at the top of local search results. Here it means the top 3 map results.',
    long: 'Rank scans read the first 20 map results from each point of a grid spread across the service area.',
    seeAlso: ['share-of-voice', 'average-map-rank'],
  },
  {
    // source: packages/engine/src/structured/rank.ts:rankMetrics (NOT_FOUND_RANK = 21); packages/tools/src/tools/rankings.ts (keyword summary)
    id: 'average-map-rank',
    term: 'Average map rank',
    audience: 'all',
    short: 'For one search term, the average position a business holds in Google Maps results across all points of the rank grid. 1 is best.',
    long: 'A point where the business is not in the first 20 results counts as 21.',
    seeAlso: ['local-pack', 'share-of-voice'],
  },
  {
    // source: packages/engine/src/reviews/rating-trend.ts:ratingStats (perMonth = reviews in the last 180 days / 6)
    id: 'review-velocity',
    term: 'Review velocity',
    audience: 'all',
    short: 'How fast a business gets new Google reviews, shown as reviews per month: the reviews posted in the last 6 months, divided by 6.',
    seeAlso: ['reply-rate'],
  },
  {
    // source: packages/engine/src/reviews/rating-trend.ts:ratingStats (replyRate = answered / posted, last 90 days)
    id: 'reply-rate',
    term: 'Reply rate',
    audience: 'all',
    short: "The share of a business's Google reviews from the last 90 days that have a reply from the owner.",
    long: 'It shows a dash when there were no reviews in that time.',
    seeAlso: ['review-velocity'],
  },
  {
    // source: packages/engine/src/reviews/benchmark.ts:summarizeWindow (share = mentioning / asked), sentimentScore; themes: packages/verticals/packs/*.yaml
    id: 'theme',
    term: 'Theme',
    audience: 'all',
    short: 'A topic customers bring up in reviews, such as response time, price transparency or cleanliness. Each business type has its own list.',
    long: "A theme's share is the percentage of the reviews checked for that theme in the last 90 days that mention it. Its sentiment runs from very negative to very positive.",
    seeAlso: ['business-type'],
  },
  {
    // source: apps/web/src/components/starting-point-card.tsx; packages/engine/src/briefs/starting-point.ts
    id: 'starting-point',
    term: 'Starting point',
    audience: 'all',
    short: 'The first brief for a new business: where it stands against its competitors before weekly briefs begin.',
    long: 'It is prepared once the competitor list is set, from the Google profile, reviews, map rankings and competitors, and suggests first steps.',
    seeAlso: ['brief'],
  },
  {
    // source: packages/db/src/schema/briefs.ts:RecommendationStatus
    id: 'recommendation',
    term: 'Recommendation',
    audience: 'all',
    short: 'A suggested next step, from a brief or saved from a chat answer, with an effort and impact rating.',
    long: 'Each one moves from To do to In progress to Done, or can be dismissed.',
    seeAlso: ['brief'],
  },
  {
    // source: apps/web/src/app/files/evidence (screenshot and text only); spec "no evidence, no claim"
    id: 'evidence',
    term: 'Evidence',
    audience: 'all',
    short: 'The proof behind a claim: a screenshot or the captured text, with where and when it was captured.',
    long: 'No evidence, no claim: nothing goes into a brief or an alert without it.',
    seeAlso: ['change'],
  },
  {
    // source: packages/engine/src/briefs/writer.ts:UPSELL_TAGS; stripped from every client read (spec §8.5)
    id: 'upsell-tag',
    term: 'Upsell tag',
    audience: 'agency',
    short: 'A note on a brief item or recommendation naming a service your agency could offer in response, such as local SEO, PPC or reputation work.',
    long: 'Only agency staff see it. It is removed from everything the client sees.',
    seeAlso: ['recommendation'],
  },
];

/** Filter + sort an explicit list (testable); `glossaryFor` applies it to `GLOSSARY`. */
export function filterGlossary(terms: readonly GlossaryTerm[], v: ViewerAudience): GlossaryTerm[] {
  const ok = visibleAudiences(v);
  return terms.filter((t) => ok.includes(t.audience)).sort((a, b) => a.term.localeCompare(b.term));
}

export function glossaryFor(v: ViewerAudience): GlossaryTerm[] {
  return filterGlossary(GLOSSARY, v);
}
