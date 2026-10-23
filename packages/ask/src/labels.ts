/** Q7: progress labels shown while Ask runs a tool (fixed map; unknown tools → "Working…"). */
const LABELS: Readonly<Record<string, string>> = {
  list_clients: 'Checking your clients…',
  get_client_profile: 'Reading the business profile…',
  list_client_competitors: 'Listing competitors…',
  get_competitor_profile: 'Reading a competitor profile…',
  get_competitor_timeline: 'Reading a competitor timeline…',
  get_competitor_signals: 'Checking competitor ratings…',
  search_events: 'Searching competitor changes…',
  get_event: 'Reading a change…',
  get_evidence: 'Checking evidence…',
  compare_snapshots: 'Comparing snapshots…',
  get_price_matrix: 'Comparing prices…',
  get_price_history: 'Reading price history…',
  list_ads: 'Looking at ads…',
  get_ad_activity: 'Reading ad activity…',
  get_topic_benchmark: 'Comparing review topics…',
  search_reviews: 'Searching reviews…',
  get_rating_trend: 'Reading rating trends…',
  get_geogrid: 'Checking local rankings…',
  get_share_of_voice: 'Measuring share of voice…',
  get_rank_trend: 'Checking the ranking trend…',
  list_moves: 'Looking at competitor moves…',
  get_move: 'Reading a competitor move…',
  list_briefs: 'Looking at briefs…',
  get_brief: 'Reading a brief…',
  list_recommendations: 'Looking at recommendations…',
  list_alerts: 'Looking at alerts…',
  get_usage: 'Checking usage…',
  search: 'Searching…',
  fetch: 'Reading…',
  submit_feedback: 'Preparing feedback…',
  update_recommendation_status: 'Preparing a status change…',
  add_recommendation: 'Drafting a recommendation…',
};

export const DEFAULT_PROGRESS_LABEL = 'Working…';

export function progressLabel(tool: string): string {
  return Object.hasOwn(LABELS, tool) ? LABELS[tool]! : DEFAULT_PROGRESS_LABEL;
}
