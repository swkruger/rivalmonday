/**
 * Phase 7c1: one isolation fixture per registered tool (plan Decisions 1–3). Kinds:
 *  - `client`: input names a client (`target.clientId`) — adminB→A1, ownerA2→A1, amA→A2 must refuse;
 *  - `object`: input names a tenant-owned object of the target (brief, alert, thread, lead…) — same scenarios;
 *  - `agency`: agency-level, no client input — client roles refuse; adminB / amA may run, output carries nothing forbidden;
 *  - `platform`: operator-only — every non-operator refuses, the operator is the positive control;
 *  - `caller`: only ever about the caller (or a global catalogue) — adminB / ownerA2 run, output carries nothing forbidden.
 * Task 3 covers the `access: 'read'` tools; Task 4 adds the write tools and `VIEWER_WRITES`.
 * A failing case is a leak: fix the tool, never weaken the fixture. `skipPositive` needs a concrete, non-tenancy reason.
 */
import type { IsolationWorld, TenantKey } from '@cs/db/test-helpers';

export interface IsolationTarget { tenant: 'A1' | 'A2' | 'B1'; agencyId: string; clientId: string }
export type IsolationFixture =
  | { kind: 'client' | 'object'; input: (w: IsolationWorld, t: IsolationTarget) => unknown; skipPositive?: string }
  | { kind: 'agency'; input: (w: IsolationWorld) => unknown; skipPositive?: string }
  | { kind: 'platform'; input?: (w: IsolationWorld) => unknown; skipPositive?: string }
  | { kind: 'caller'; reason: string; input?: (w: IsolationWorld) => unknown };

/** Primary-key column `col` (default `id`) of the `i`-th world row of `table` seeded for `tenant`. */
function idOf(w: IsolationWorld, table: string, tenant: TenantKey, i = 0, col = 'id'): string {
  const v = w.rows[table]?.[tenant]?.[i]?.[col];
  if (typeof v !== 'string') throw new Error(`isolation fixtures: no ${table}.${col} row #${i} for ${tenant}`);
  return v;
}
/** The target client's tracked competitor (A1/B1 track X, A2 tracks Y). */
const competitorOf = (w: IsolationWorld, t: IsolationTarget): string => (t.tenant === 'A2' ? w.ids.competitorY : w.ids.competitorX);
const competitorTenant = (t: IsolationTarget): TenantKey => (t.tenant === 'A2' ? 'Y' : 'X');
const serviceOf = (t: IsolationTarget): string => (t.tenant === 'A2' ? 'teeth_cleaning' : 'ac_tune_up');
const agencyTenant = (t: IsolationTarget): TenantKey => (t.tenant === 'B1' ? 'B' : 'A');

const client = (extra: Record<string, unknown> = {}): IsolationFixture => ({ kind: 'client', input: (_w, t) => ({ clientId: t.clientId, ...extra }) });
const clientWith = (extra: (w: IsolationWorld, t: IsolationTarget) => Record<string, unknown>): IsolationFixture => ({
  kind: 'client', input: (w, t) => ({ clientId: t.clientId, ...extra(w, t) }),
});
const object = (input: (w: IsolationWorld, t: IsolationTarget) => unknown, skipPositive?: string): IsolationFixture =>
  skipPositive ? { kind: 'object', input, skipPositive } : { kind: 'object', input };
const agency = (input: Record<string, unknown> = {}): IsolationFixture => ({ kind: 'agency', input: () => input });
const platform = (input?: (w: IsolationWorld) => unknown): IsolationFixture => (input ? { kind: 'platform', input } : { kind: 'platform' });

export const ISOLATION_FIXTURES: Record<string, IsolationFixture> = {
  // ── client: profile, setup, briefs, alerts, reports ────────────────────────────────────────────────
  get_client_profile: client(),
  get_client_setup: client(),
  get_starting_point_status: client(),
  list_briefs: client(),
  list_alerts: client(),
  list_alert_queue: client(),
  list_trend_reports: client(),
  list_recommendations: client(),
  get_prospect_report: client(),
  list_client_recipients: client(),

  // ── client: competitors and discovery ──────────────────────────────────────────────────────────────
  list_client_competitors: client(),
  list_competitor_suggestions: client(),
  get_competitor_search_status: client(),
  get_competitor_signals: client(),
  get_competitor_ad_matches: clientWith((w, t) => ({ competitorId: competitorOf(w, t) })),
  list_tracked_pages: clientWith((w, t) => ({ competitorId: competitorOf(w, t) })),

  // ── client: workspace (events, evidence, moves, competitors) ───────────────────────────────────────
  get_workspace_overview: client(),
  search_events: client({ route: 'all', days: 365 }),
  get_event: clientWith((w, t) => ({ eventId: idOf(w, 'event', t.tenant) })),
  // the after capture's evidence (index 1): the one the target's alert, brief item and recommendation cite
  get_evidence: clientWith((w, t) => ({ evidenceId: idOf(w, 'evidence', competitorTenant(t), 1) })),
  compare_snapshots: clientWith((w, t) => ({ changeId: idOf(w, 'detected_change', t.tenant) })),
  list_moves: client({ status: 'all' }),
  get_move: clientWith((w, t) => ({ moveId: idOf(w, 'move', t.tenant) })),
  get_competitor_profile: clientWith((w, t) => ({ competitorId: competitorOf(w, t) })),
  get_competitor_timeline: clientWith((w, t) => ({ competitorId: competitorOf(w, t), days: 30 })),
  get_alert_rules: client(),

  // ── client: pricing, ads, reputation, rankings ─────────────────────────────────────────────────────
  get_price_matrix: client(),
  get_price_history: clientWith((_w, t) => ({ serviceId: serviceOf(t), days: 365 })),
  list_ads: client({ status: 'all' }),
  get_ad_activity: client(),
  get_topic_benchmark: client(),
  get_rating_trend: client(),
  search_reviews: client({ days: 365 }),
  get_geogrid: clientWith((w, t) => ({ scanId: idOf(w, 'rank_scan', t.tenant) })),
  get_rank_trend: client({ keyword: 'ac repair' }),
  get_share_of_voice: client(),
  get_rank_settings: client(),

  // ── client: search, knowledge, Ask, help ───────────────────────────────────────────────────────────
  search: client({ query: 'CANARY' }),
  search_knowledge: client({ query: 'knowledge' }),
  list_my_ask_threads: client(),
  get_ask_starters: client(),
  get_page_guide: client({ helpKey: 'page:client.overview', context: 'client' }),
  list_help_guides: client({ context: 'client' }),
  get_runbook: { kind: 'client', input: (_w, t) => ({ owner: { level: 'client', clientId: t.clientId } }) },

  // ── client: tokens, billing, usage ─────────────────────────────────────────────────────────────────
  list_api_tokens: client(),
  list_oauth_grants: client(),
  get_my_billing: {
    kind: 'client', input: (_w, t) => ({ clientId: t.clientId }),
    skipPositive: "client-owner-only by role (`requireOwnerOf`): an agency admin is refused whatever the tenant; the owner's own view is covered in my-billing.test.ts",
  },
  get_my_usage: client(),
  get_spend_status: client(),

  // ── object: tenant-owned rows addressed by id ──────────────────────────────────────────────────────
  get_brief: object((w, t) => ({ briefId: idOf(w, 'brief', t.tenant) })),
  get_brief_review: object((w, t) => ({ briefId: idOf(w, 'brief', t.tenant) })),
  get_alert: object((w, t) => ({ alertId: idOf(w, 'alert', t.tenant) })),
  get_trend_report: object((w, t) => ({ reportId: idOf(w, 'trend_report', t.tenant) })),
  get_kb_article: object((w, t) => ({ kbId: idOf(w, 'kb_article', t.tenant) })),
  fetch: object((w, t) => ({ id: `event:${idOf(w, 'event', t.tenant)}` })),
  get_my_ask_thread: object(
    (w, t) => ({ threadId: idOf(w, 'ask_thread', t.tenant) }),
    "Ask threads are per user: the world's A1 thread belongs to ownerA1 and the positive control runs as adminA (own-thread refusal, not tenancy)",
  ),
  // † agency-level object: amA→A2 is refused because leads are admin-only
  get_lead: object((w, t) => ({ leadId: idOf(w, 'lead', agencyTenant(t)) })),

  // ── agency: agency-level reads ─────────────────────────────────────────────────────────────────────
  list_clients: agency(),
  get_portfolio: agency(),
  list_brief_queue: agency(),
  get_usage: agency(),
  list_prospects: agency(),
  get_nav_counts: agency(),
  get_team: agency(),
  get_agency_branding: agency(),
  get_agency_profile: agency(),
  list_webhooks: agency(),
  list_support_sessions: agency(),
  get_onboarding_status: agency(),
  get_intake_link: agency(),
  list_leads: agency(),
  find_business: agency({ name: 'Smith HVAC', location: 'Austin, TX' }),
  get_billing_summary: agency(),
  get_seat_report: agency(),
  get_connect_status: agency(),
  get_client_revenue: agency(),
  list_client_billing_status: agency(),

  // ── platform: operator-only reads ──────────────────────────────────────────────────────────────────
  platform_overview: platform(() => ({ range: '12w' })),
  get_platform_nav_counts: platform(),
  get_platform_health: platform(),
  list_platform_agencies: platform(),
  get_platform_agency: platform((w) => ({ agencyId: w.ids.agencyA, range: '12w' })),
  list_platform_activity: platform(),
  list_agency_support_sessions: platform((w) => ({ agencyId: w.ids.agencyA })),
  list_platform_costs: platform(),
  get_client_limits: platform((w) => ({ agencyId: w.ids.agencyA })),
  get_spend_guard: platform(),
  get_ai_guard_state: platform(),
  list_decision_reviews: platform(),
  list_topic_proposals: platform(),
  list_kb_articles: platform(),
  list_kb_targets: platform(),
  get_kb_article_admin: platform((w) => ({ id: idOf(w, 'kb_article', 'A') })),
  get_kb_import_status: platform(() => ({ key: 'world-import' })),
  list_plans: platform(),
  list_discount_codes: platform(),
  list_invite_links: platform(),
  get_agency_billing: platform((w) => ({ agencyId: w.ids.agencyA })),
  get_billing_overview: platform(),
  get_connect_overview: platform(),
  get_signups_paused: platform(),
  get_signup_funnel: platform(() => ({ days: 30 })),
  list_pool_leads: platform(),
  list_catalog_review: platform(),
  count_catalog_review: platform(),

  // ── caller: global catalogue ───────────────────────────────────────────────────────────────────────
  list_verticals: { kind: 'caller', reason: 'the global vertical catalogue: the same rows for every caller' },
};

/** `permission: 'read'` + `access: 'write'` tools a client viewer may call (reviewed snapshot; Task 4 fills). */
export const VIEWER_WRITES: readonly string[] = [];
