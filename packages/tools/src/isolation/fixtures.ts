/**
 * Phase 7c1: one isolation fixture per registered tool (plan Decisions 1–3). Kinds:
 *  - `client`: input names a client (`target.clientId`) — adminB→A1, ownerA2→A1, amA→A2 must refuse;
 *  - `object`: input names a tenant-owned object of the target (brief, alert, thread, lead…) — same scenarios;
 *  - `agency`: agency-level, no client input — client roles refuse; adminB / amA may run, output carries nothing forbidden;
 *  - `platform`: operator-only — every non-operator refuses, the operator is the positive control;
 *  - `caller`: only ever about the caller (or a global catalogue) — adminB / ownerA2 run, output carries nothing forbidden.
 * Task 3 covers the `access: 'read'` tools; Task 4 the `access: 'write'` tools (the suite reseeds the world per write tool,
 * so a positive control may mutate) and `VIEWER_WRITES`.
 * A failing case is a leak: fix the tool, never weaken the fixture. `skipPositive` needs a concrete, non-tenancy reason.
 */
import { createHash } from 'node:crypto';
import { type IsolationWorld, type TenantKey, type WorldUser, worldId } from '@cs/db/test-helpers';

export interface IsolationTarget { tenant: 'A1' | 'A2' | 'B1'; agencyId: string; clientId: string }
/**
 * `positiveAs` (Task 4): the user of the positive control when it is not `adminA` — for "my …" tools that act only on
 * the caller's own row (e.g. a client owner's own contact), so the control proves the path works for the right user.
 */
export type PositiveUser = Exclude<WorldUser, 'operator'>;
export type IsolationFixture =
  | { kind: 'client' | 'object'; input: (w: IsolationWorld, t: IsolationTarget) => unknown; skipPositive?: string; positiveAs?: PositiveUser }
  | { kind: 'agency'; input: (w: IsolationWorld) => unknown; skipPositive?: string }
  | { kind: 'platform'; input?: (w: IsolationWorld) => unknown; skipPositive?: string }
  // `user` (Task 4): the scenario's caller, so a global-catalogue write can name a distinct row per caller
  | { kind: 'caller'; reason: string; input?: (w: IsolationWorld, user?: WorldUser) => unknown };

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
const NOT_A_PROSPECT = "needs a prospect client: the world's clients are all active (a prospect would change every client list); covered in prospects.test.ts";
const A1_SUBSCRIBED = 'needs A1 off / invited: the world bills A1 (active subscription) so the disable / price / portal controls run; covered in client-billing.test.ts';
/** A client-level runbook owner for the target. */
const runbookOwner = (t: IsolationTarget) => ({ level: 'client' as const, clientId: t.clientId });
const runbook = (extra: Record<string, unknown> = {}): IsolationFixture => ({ kind: 'client', input: (_w, t) => ({ owner: runbookOwner(t), key: 'play:world_play', ...extra }) });
/** Membership of the target client (A1: its owner; B1 has no client members, so agency B's admin). */
const membershipOf = (w: IsolationWorld, t: IsolationTarget): string => idOf(w, 'membership', t.tenant === 'B1' ? 'B' : t.tenant);
/** A1's second Ask thread belongs to adminA (the control's user); A2 / B1 have one thread each. */
const askThreadOf = (w: IsolationWorld, t: IsolationTarget): string => idOf(w, 'ask_thread', t.tenant, t.tenant === 'A1' ? 1 : 0);
/** A 1x1 transparent PNG (the smallest image `upload_agency_logo` accepts) and its sha256. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_1X1_SHA = createHash('sha256').update(Buffer.from(PNG_1X1, 'base64')).digest('hex');

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
  // the after capture (index 1) of the target's competitor; its predecessor has no blocks, so the control answers no_blocks
  compare_captures: clientWith((w, t) => ({ captureId: idOf(w, 'capture', competitorTenant(t), 1) })),
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
  // client-owner-only by role (`requireOwnerOf`): the control runs as A1's owner
  get_my_billing: { kind: 'client', input: (_w, t) => ({ clientId: t.clientId }), positiveAs: 'ownerA1' },
  get_my_usage: client(),
  get_spend_status: client(),

  // ── object: tenant-owned rows addressed by id ──────────────────────────────────────────────────────
  get_brief: object((w, t) => ({ briefId: idOf(w, 'brief', t.tenant) })),
  get_brief_review: object((w, t) => ({ briefId: idOf(w, 'brief', t.tenant) })),
  get_alert: object((w, t) => ({ alertId: idOf(w, 'alert', t.tenant) })),
  get_trend_report: object((w, t) => ({ reportId: idOf(w, 'trend_report', t.tenant) })),
  get_kb_article: object((w, t) => ({ kbId: idOf(w, 'kb_article', t.tenant) })),
  fetch: object((w, t) => ({ id: `event:${idOf(w, 'event', t.tenant)}` })),
  get_my_ask_thread: object((w, t) => ({ threadId: askThreadOf(w, t) })),
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

  // ════════════════════════════════════ write tools (Task 4) ════════════════════════════════════════

  // ── client writes: profile, delivery, settings ─────────────────────────────────────────────────────
  update_client_profile: client({ keywords: ['ac repair', 'furnace repair'] }),
  set_brief_auto_send: client({ enabled: true }),
  // timezone only: the path that writes without the RLS-checked delivery update
  update_client_delivery: client({ timezone: 'America/Denver' }),
  add_client_recipient: client({ email: 'new-recipient@world.example', name: null, role: 'client_viewer' }),
  invite_member: client({ email: 'new-member@world.example', role: 'client_viewer' }),
  set_alert_rules: client({ alert: 75, brief: 45 }),
  update_client_rank_settings: client({ keywords: ['ac repair'], gridSize: 5, radiusKm: 10 }),
  request_rank_scan: client(),
  submit_feedback: clientWith((w, t) => ({ eventId: idOf(w, 'event', t.tenant), verdict: 'useful', reason: 'Spot on' })),
  add_recommendation: clientWith((w, t) => ({
    title: 'Match the tune-up price', rationale: 'The rival cut its tune-up price this week.', evidenceIds: [idOf(w, 'evidence', competitorTenant(t), 1)], effort: 'M', impact: 'M',
  })),
  run_prospect_snapshot: { kind: 'client', input: (_w, t) => ({ clientId: t.clientId }), skipPositive: NOT_A_PROSPECT },
  convert_prospect: { kind: 'client', input: (_w, t) => ({ clientId: t.clientId }), skipPositive: NOT_A_PROSPECT },

  // ── client writes: competitors, pages, ads ─────────────────────────────────────────────────────────
  request_competitor_suggestions: client(),
  accept_competitor_suggestions: clientWith((w, t) => ({ ids: [idOf(w, 'competitor_suggestion', t.tenant)] })),
  add_competitor: client({ name: 'Northside Air', domain: 'northsideair.example' }),
  remove_competitor: clientWith((w, t) => ({ competitorId: competitorOf(w, t) })),
  set_page_pin: clientWith((w, t) => ({ pageId: idOf(w, 'tracked_page', competitorTenant(t)), pinned: true })),
  add_tracked_page: clientWith((w, t) => ({
    competitorId: competitorOf(w, t), url: `https://${t.tenant === 'A2' ? 'brightsmiles' : 'smithhvac'}.example/services`, pageType: 'service',
  })),
  confirm_ad_match: clientWith((w, t) => ({ competitorId: competitorOf(w, t), platform: 'google', accountId: 'AR-world-1' })),
  remove_ad_match: clientWith((w, t) => ({ competitorId: competitorOf(w, t), platform: 'google', accountId: 'AR-world-1' })),

  // ── client writes: setup wizard ────────────────────────────────────────────────────────────────────
  save_setup_profile: client({ keywords: ['ac repair'] }),
  pick_setup_competitors: clientWith((w, t) => ({ accept: [idOf(w, 'competitor_suggestion', t.tenant)], dismiss: [] })),
  advance_client_setup: client({ action: 'dismiss' }),
  invite_client_owner: client({ name: 'New Owner', email: 'new-owner@world.example' }),
  send_competitor_review: client(),

  // ── client writes: lifecycle and billing ───────────────────────────────────────────────────────────
  pause_client: client(),
  resume_client: client(),
  enable_client_billing: { kind: 'client', input: (_w, t) => ({ clientId: t.clientId, priceCents: 9900 }), skipPositive: A1_SUBSCRIBED },
  disable_client_billing: client({ confirm: true }),
  resend_client_payment_link: { kind: 'client', input: (_w, t) => ({ clientId: t.clientId }), skipPositive: A1_SUBSCRIBED },
  set_client_price: client({ priceCents: 12900, applyTo: 'new_only' }),
  open_billing_portal: { kind: 'client', input: (_w, t) => ({ clientId: t.clientId }), positiveAs: 'ownerA1' }, // client-owner-only by role

  // ── client writes: runbook (client level; platform / agency levels are role-gated, not tenant data) ───
  update_runbook_item: runbook({ content: { trigger: 'map_climb', title: 'Check the map', template: 'Check the map pack this week.' } }),
  set_runbook_item_enabled: runbook({ enabled: false }),
  pull_runbook_update: runbook(),
  dismiss_runbook_update: runbook(),
  add_runbook_item: { kind: 'client', input: (_w, t) => ({ owner: runbookOwner(t), key: 'play:world_play_2' }) },
  remove_runbook_item: runbook(),
  retailor_runbook_item: runbook(),

  // ── object writes: alerts, suggestions, briefs, recommendations ────────────────────────────────────
  approve_alert: object((w, t) => ({ alertId: idOf(w, 'alert', t.tenant) })),
  dismiss_alert: object((w, t) => ({ alertId: idOf(w, 'alert', t.tenant), reason: 'Not relevant' })),
  accept_competitor_suggestion: object((w, t) => ({ suggestionId: idOf(w, 'competitor_suggestion', t.tenant) })),
  dismiss_competitor_suggestion: object((w, t) => ({ suggestionId: idOf(w, 'competitor_suggestion', t.tenant) })),
  edit_brief_item: object((w, t) => ({ itemId: idOf(w, 'brief_item', t.tenant), headline: 'Rival cut prices' })),
  drop_brief_item: object((w, t) => ({ itemId: idOf(w, 'brief_item', t.tenant), reason: 'Duplicate' })),
  rate_brief_item: object((w, t) => ({ itemId: idOf(w, 'brief_item', t.tenant), useful: true })),
  reorder_brief_items: object((w, t) => ({ briefId: idOf(w, 'brief', t.tenant), itemIds: [idOf(w, 'brief_item', t.tenant)] })),
  approve_brief: object((w, t) => ({ briefId: idOf(w, 'brief', t.tenant) })),
  send_brief_now: object((w, t) => ({ briefId: idOf(w, 'brief', t.tenant) })),
  update_recommendation_status: object((w, t) => ({ recommendationId: idOf(w, 'recommendation', t.tenant), status: 'done' })),

  // ── object writes: team, recipients, own contact ───────────────────────────────────────────────────
  revoke_membership: object((w, t) => ({ membershipId: membershipOf(w, t) })),
  revoke_invitation: object((w, t) => ({ invitationId: idOf(w, 'invitation', t.tenant) })),
  resend_invitation: object((w, t) => ({ invitationId: idOf(w, 'invitation', t.tenant) })),
  deactivate_recipient: object((w, t) => ({ contactId: idOf(w, 'contact', t.tenant) })),
  // "my" tools: the target's owner contact; the control runs as that owner (A1)
  set_my_notification_pref: { kind: 'object', input: (w, t) => ({ contactId: idOf(w, 'contact', t.tenant), kind: 'alert', channel: 'email', enabled: false }), positiveAs: 'ownerA1' },
  update_my_contact: { kind: 'object', input: (w, t) => ({ contactId: idOf(w, 'contact', t.tenant), timezone: 'America/Chicago' }), positiveAs: 'ownerA1' },
  // A1's control: adminA soft-deletes its own live thread (the hostile callers never own the target's thread)
  delete_ask_thread: clientWith((w, t) => ({ threadId: askThreadOf(w, t) })),

  // ── object writes: † agency-level objects (amA→A2 names agency A's object; refused because admin-only) ─
  set_webhook_active: object((w, t) => ({ webhookId: idOf(w, 'agency_webhook', agencyTenant(t)), active: false })),
  delete_webhook: object((w, t) => ({ webhookId: idOf(w, 'agency_webhook', agencyTenant(t)) })),
  test_webhook: object((w, t) => ({ webhookId: idOf(w, 'agency_webhook', agencyTenant(t)) })),
  revoke_api_token: object((w, t) => ({ tokenId: idOf(w, 'api_token', agencyTenant(t)) })),
  // the binding's pk is `consent_id`; its `id` (the grant id) is the deterministic first world id
  revoke_oauth_grant: object((_w, t) => ({ grantId: worldId('oauth_grant_binding', agencyTenant(t), 1) })),
  accept_lead: object((w, t) => ({ leadId: idOf(w, 'lead', agencyTenant(t)), verticalId: 'hvac_plumbing' })),
  decline_lead: object((w, t) => ({ leadId: idOf(w, 'lead', agencyTenant(t)), notify: false })),

  // ── agency writes ──────────────────────────────────────────────────────────────────────────────────
  create_client: agency({ name: 'Eastside Heating', verticalId: 'hvac_plumbing', services: [], keywords: ['furnace repair'], serviceArea: null, placeId: null }),
  update_agency_branding: agency({ displayName: 'Brand Co' }),
  add_webhook: agency({ kind: 'slack', url: 'https://hooks.slack.com/services/T000/B000/world' }),
  set_support_access_notify: agency({ enabled: true }),
  create_checkout_session: agency(),
  create_portal_session: agency(),
  redeem_discount_code: agency({ code: 'WORLD10' }),
  start_stripe_connect: agency(),
  disconnect_stripe: agency({ confirm: true }),
  set_client_billing_defaults: agency({ priceCents: 9900 }),
  mark_onboarding_step: agency({ step: 'branding', action: 'done' }),
  dismiss_onboarding_checklist: agency(),
  mark_onboarding_redirected: agency(),
  update_agency_profile: agency({
    name: 'Agency Renamed', contactName: 'Pat Doe', contactEmail: 'pat@agency.example', phone: '(404) 555-0100', timezone: 'America/Chicago',
  }),
  upload_agency_logo: agency({ png: PNG_1X1, sha256: PNG_1X1_SHA }),
  update_intake_link: agency({ enabled: false }),

  // ── platform writes (operator-only) ────────────────────────────────────────────────────────────────
  set_client_limits: platform((w) => ({ clientId: w.ids.clientA1, competitorLimit: 5 })),
  resolve_decision_review: platform((w) => ({ reviewId: idOf(w, 'decision_review', 'A1'), answers: { q1: 'true' } })),
  decide_topic_proposal: platform((w) => ({ proposalId: w.platformIds.topicProposal, decision: 'rejected' })),
  upsert_kb_article: platform(() => ({ level: 'platform', kind: 'help', title: 'World help', bodyMd: 'How it works.', status: 'draft' })),
  delete_kb_article: platform((w) => ({ id: idOf(w, 'kb_article', 'A') })),
  set_kb_auto_sync: platform((w) => ({ id: idOf(w, 'kb_article', 'A'), autoSync: false })),
  import_kb_url: platform(() => ({ url: 'https://example.com/help', level: 'platform', kind: 'help', autoSync: false })),
  start_support_session: platform((w) => ({ agencyId: w.ids.agencyA, reason: 'Checking a reported issue' })),
  refresh_platform_costs: platform(),
  update_platform_cost_service: platform(() => ({ service: 'openrouter', enabled: true })),
  save_platform_cost_item: platform(() => ({ name: 'Hosting', kind: 'one_off', amountUsd: 10, startsOn: '2026-01-01' })),
  archive_platform_cost_item: platform((w) => ({ id: w.platformIds.costItem })),
  create_plan_version: platform(() => ({ name: 'World plan v2', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30 })),
  create_discount_code: platform(() => ({ code: 'NEWCODE', percentOff: 10, appliesTo: 'base', duration: 'once' })),
  revoke_discount_code: platform((w) => ({ id: w.platformIds.discountCode })),
  create_invite_link: platform(() => ({ offer: 'trial' })),
  revoke_invite_link: platform((w) => ({ id: w.platformIds.inviteLink })),
  // agency B is trialing in the world (A is active), a valid source state for these two
  grant_pilot: platform((w) => ({ agencyId: w.ids.agencyB })),
  end_pilot: {
    kind: 'platform', input: (w) => ({ agencyId: w.ids.agencyB }),
    skipPositive: 'needs an agency on a pilot: the world has one active (A) and one trialing (B) agency; covered in platform-billing.test.ts',
  },
  extend_trial: platform((w) => ({ agencyId: w.ids.agencyB, until: new Date(Date.now() + 40 * 86_400_000).toISOString() })),
  attach_agency_discount: platform((w) => ({ agencyId: w.ids.agencyA, discountCodeId: w.platformIds.discountCode })),
  set_seat_cap_exempt: platform((w) => ({ agencyId: w.ids.agencyA, exempt: true })),
  set_connect_fee_percent: platform((w) => ({ agencyId: w.ids.agencyA, percent: 1 })),
  set_signups_paused: platform(() => ({ paused: true })),
  assign_lead: platform((w) => ({ leadId: w.platformIds.poolLead, agencyId: w.ids.agencyA })),
  review_vertical: platform((w) => ({ verticalId: w.platformIds.unreviewedVertical, action: 'approve' })),
  review_business_area: platform((w) => ({ verticalId: w.platformIds.unreviewedVertical, areaId: w.platformIds.unreviewedArea, action: 'approve' })),
  merge_vertical: platform((w) => ({ sourceId: w.platformIds.unreviewedVertical, targetId: 'hvac_plumbing', areaMap: { [w.platformIds.unreviewedArea]: null, [w.platformIds.unreviewedArea2]: null } })),
  merge_business_area: platform((w) => ({ verticalId: w.platformIds.unreviewedVertical, sourceAreaId: w.platformIds.unreviewedArea, targetAreaId: w.platformIds.unreviewedArea2 })),
  update_spend_guard_settings: platform(() => ({ creditsPerUsd: 100 })),
  reset_ai_pause: {
    kind: 'platform', input: () => ({ note: 'Checked the spike' }),
    skipPositive: "needs a paused / warned platform AI guard: the world's guard is ok (a paused one would block every AI path); covered in spend-guard.test.ts",
  },

  // ── caller writes: own token / session, global catalogue ───────────────────────────────────────────
  create_api_token: { kind: 'caller', reason: "creates the caller's own token in the caller's own agency (and client)", input: () => ({ name: 'World token', scope: 'read' }) },
  end_support_session: { kind: 'caller', reason: "ends only the caller's own support session", input: () => ({}) },
  create_vertical: {
    kind: 'caller', reason: 'adds an unreviewed row to the global catalogue, attributed to the caller agency',
    // one distinct catalogue row per caller (a second agency naming the same type would get "a similar type exists")
    input: (_w, user) => (user === 'adminB'
      ? { name: 'Gutter Guards', areas: [{ name: 'Gutter repair' }], categories: ['Gutter cleaning service'] }
      : { name: 'Window Washing', areas: [{ name: 'Window cleaning' }], categories: ['Window cleaning service'] }),
  },
  add_business_area: {
    kind: 'caller', reason: 'adds an unreviewed area (attributed to the caller agency) to a global catalogue row; editing another agency\'s unreviewed row is checked separately',
    input: () => ({ verticalId: 'hvac_plumbing', name: 'Duct cleaning' }),
  },
  update_vertical: {
    kind: 'caller', reason: 'edits a catalogue row the caller agency created while unreviewed; another agency\'s row is checked separately',
    input: (w) => ({ verticalId: w.platformIds.unreviewedVertical, audienceNoun: 'homeowners' }),
  },
  draft_vertical: {
    kind: 'caller', reason: 'drafts from public profile text; the draft cache is global by place id (no tenant data)',
    input: () => ({ placeId: 'world-place-new', nearbyCategories: [] }),
  },
};

/**
 * `permission: 'read'` + `access: 'write'` tools a client viewer may call (reviewed snapshot; `isolation.test.ts`
 * asserts it equals the computed set). Each acts only on the caller's own row: own notification prefs / contact, own
 * API tokens and OAuth grants, own Ask threads.
 */
export const VIEWER_WRITES: readonly string[] = [
  'create_api_token', 'delete_ask_thread', 'revoke_api_token', 'revoke_oauth_grant', 'set_my_notification_pref', 'update_my_contact',
];
