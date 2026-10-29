/**
 * Phase 7c1: the isolation class of every public table, from its RLS policy (Task 0 census, checked against
 * `pg_policies` + `role_table_grants` at migration 0091). The RLS sweep and the isolation world key off this map, and
 * `isolation-world.test.ts` fails when a public table is missing or an entry is stale — a branch adding a table adds
 * its class here and its world rows in `isolation-world.ts`.
 *
 * - `tenant_client`: policy uses `app_client_visible(client_id)`. Mixed policies (`event`, `detected_change`: public
 *   when `client_id IS NULL`; `kb_article`, `kb_chunk`: platform / agency / client levels; `llm_call`, `vendor_call`:
 *   scope `all` OR a visible client) are client-tagged in the world. EXISTS-derived `event_change`, `move_event` take
 *   their parent's class.
 * - `tenant_agency`: `agency_id = app_agency_id()` only (some also gate on `app_role()` / `app_user_id()`).
 * - `global_public`: `app_competitor_visible(competitor_id)`; `evidence` is EXISTS(capture).
 * - `service_only`: forced RLS and no policy at all. Eleven still grant `app_user` SELECT and simply return no rows:
 *   competitor_source, decision_label, decision_review, decision_sample, model_batch, price_block_map, score_failure,
 *   stage_run, topic_proposal, vendor_task, volatile_block.
 * - `platform`: global reference / operator data with no tenant column (plans, the vertical catalogue, `platform_*`,
 *   `discount_code`); forced RLS, no policy, no `app_user` privilege.
 */
export type TableClass = 'tenant_client' | 'tenant_agency' | 'global_public' | 'service_only' | 'platform';

export const TABLE_CLASS: Record<string, TableClass> = {
  // tenant_client (30)
  alert: 'tenant_client',
  alert_event: 'tenant_client',
  ask_message: 'tenant_client',
  ask_starter: 'tenant_client',
  ask_thread: 'tenant_client',
  brief: 'tenant_client',
  brief_item: 'tenant_client',
  client: 'tenant_client',
  client_competitor: 'tenant_client',
  client_setup: 'tenant_client',
  competitor_signal: 'tenant_client',
  competitor_suggestion: 'tenant_client',
  detected_change: 'tenant_client',
  discovery_run: 'tenant_client',
  event: 'tenant_client',
  event_change: 'tenant_client',
  event_score: 'tenant_client',
  feedback: 'tenant_client',
  kb_article: 'tenant_client',
  kb_chunk: 'tenant_client',
  llm_call: 'tenant_client',
  move: 'tenant_client',
  move_event: 'tenant_client',
  prospect_report: 'tenant_client',
  rank_map_image: 'tenant_client',
  rank_scan: 'tenant_client',
  rank_snapshot: 'tenant_client',
  recommendation: 'tenant_client',
  trend_report: 'tenant_client',
  vendor_call: 'tenant_client',

  // tenant_agency (9)
  agency: 'tenant_agency',
  agency_onboarding: 'tenant_agency',
  agency_profile: 'tenant_agency',
  api_token: 'tenant_agency',
  audit_log: 'tenant_agency',
  intake_link: 'tenant_agency',
  lead: 'tenant_agency',
  oauth_grant_binding: 'tenant_agency',
  playbook_override: 'tenant_agency',

  // global_public (11)
  ad: 'global_public',
  capture: 'global_public',
  capture_block: 'global_public',
  competitor: 'global_public',
  evidence: 'global_public',
  observation: 'global_public',
  price_point: 'global_public',
  review: 'global_public',
  review_analysis: 'global_public',
  review_revision: 'global_public',
  tracked_page: 'global_public',

  // service_only (36)
  agency_billing: 'service_only',
  agency_billing_event: 'service_only',
  agency_connect: 'service_only',
  agency_daily_stat: 'service_only',
  agency_invite_link: 'service_only',
  agency_webhook: 'service_only',
  billing_notice: 'service_only',
  client_billing: 'service_only',
  competitor_source: 'service_only',
  contact: 'service_only',
  decision_label: 'service_only',
  decision_review: 'service_only',
  decision_sample: 'service_only',
  email_resend: 'service_only',
  intake_rate: 'service_only',
  invitation: 'service_only',
  mcp_rate_window: 'service_only',
  membership: 'service_only',
  model_batch: 'service_only',
  notification: 'service_only',
  notification_pref: 'service_only',
  pending_signup: 'service_only',
  price_block_map: 'service_only',
  runbook: 'service_only',
  runbook_item: 'service_only',
  score_failure: 'service_only',
  ops_alert: 'service_only',
  spend_guard_event: 'service_only',
  stage_run: 'service_only',
  stripe_connect_event: 'service_only',
  stripe_event: 'service_only',
  support_session: 'service_only',
  topic_proposal: 'service_only',
  vendor_task: 'service_only',
  vertical_draft: 'service_only',
  volatile_block: 'service_only',

  // platform (12)
  business_area: 'platform',
  discount_code: 'platform',
  plan: 'platform',
  platform_admin: 'platform',
  platform_audit_log: 'platform',
  platform_cost_item: 'platform',
  platform_cost_service: 'platform',
  platform_cost_snapshot: 'platform',
  platform_setting: 'platform',
  vertical: 'platform',
  vertical_category: 'platform',
  waitlist_entry: 'platform',
};
