# Phase 8b tool access classification

Rule: `write` = inserts/updates/deletes tenant or external state, enqueues jobs, sends email; reads whose only side effect is an audit row stay `read`. Ambiguous = `write`. `supportHidden` = not offered in support sessions. No tool output has an email field today, so no `supportMask` is declared (the schema-walk test in `access-marks.test.ts` enforces it for future tools).

Tool | Access | Reason
--- | --- | ---
add_recommendation (add-recommendation.ts) | write | inserts recommendation + feedback
list_ads (ads.ts) | read | read-only
list_alert_queue (alert-queue.ts) | read | read-only
approve_alert (alert-queue.ts) | write | changes alert status
dismiss_alert (alert-queue.ts) | write | changes alert status
get_alert_rules (alert-rules.ts) | read | read-only
set_alert_rules (alert-rules.ts) | write | updates client thresholds
list_alerts (alerts.ts) | read | read-only
get_alert (alerts.ts) | read | read-only
create_api_token (api-tokens.ts) | write | inserts token
revoke_api_token (api-tokens.ts) | write | revokes token
list_api_tokens (api-tokens.ts) | read | read-only
list_oauth_grants (api-tokens.ts) | read | read-only
revoke_oauth_grant (api-tokens.ts) | write | revokes grant
list_my_ask_threads (ask-threads.ts) | read | read-only
get_my_ask_thread (ask-threads.ts) | read | read-only
delete_ask_thread (ask-threads.ts) | write | soft-deletes own thread (sets deleted_at; permission is read); supportHidden
get_ask_starters (ask-threads.ts) | read | read-only
list_briefs (briefs.ts) | read | read-only
get_brief (briefs.ts) | read | read-only
list_clients (clients.ts) | read | read-only
get_client_profile (clients.ts) | read | read-only
get_competitor_profile (competitor-profile.ts) | read | read-only
get_competitor_timeline (competitor-profile.ts) | read | read-only
list_competitor_suggestions (competitors.ts) | read | read-only
request_competitor_suggestions (competitors.ts) | write | inserts discovery_run, enqueues rival-search job
get_competitor_search_status (competitors.ts) | read | reads latest discovery_run only
get_competitor_signals (competitors.ts) | read | read-only
accept_competitor_suggestion (competitors.ts) | write | inserts competitor, attaches ad accounts, enqueues discovery
accept_competitor_suggestions (competitors.ts) | write | inserts competitors + links, attaches ad accounts, enqueues discovery
confirm_ad_match (competitors.ts) | write | updates competitor ad accounts + pending matches
remove_ad_match (competitors.ts) | write | updates competitor ad accounts, retires ads
dismiss_competitor_suggestion (competitors.ts) | write | updates suggestion
list_client_competitors (competitors.ts) | read | read-only
add_competitor (competitors.ts) | write | inserts competitor + link, enqueues discovery
remove_competitor (competitors.ts) | write | deletes link
search_events (events.ts) | read | read-only
get_event (events.ts) | read | read-only
submit_feedback (events.ts) | write | inserts feedback
get_evidence (evidence.ts) | read | read-only
compare_snapshots (evidence.ts) | read | read-only
compare_captures (evidence.ts) | read | read-only (no ensureBlocks)
fetch (fetch.ts) | read | read-only
list_kb_articles (knowledge-admin.ts) | read | read-only
list_kb_targets (knowledge-admin.ts) | read | read-only
get_kb_article_admin (knowledge-admin.ts) | read | read-only
upsert_kb_article (knowledge-admin.ts) | write | writes article, enqueues embed
delete_kb_article (knowledge-admin.ts) | write | deletes article
set_kb_auto_sync (knowledge-admin.ts) | write | updates article
import_kb_url (knowledge-admin.ts) | write | enqueues kb-import
get_kb_import_status (knowledge-admin.ts) | read | reads job state only
search_knowledge (knowledge.ts) | read | read; embedding skipped under support ctx; help-audience filtered (15b)
get_kb_article (knowledge.ts) | read | read-only
get_page_guide (help.ts) | read | read-only; audience-filtered page guide (15b)
list_help_guides (help.ts) | read | read-only; audience-filtered guide list (15b)
list_decision_reviews (model-ops.ts) | read | read; no side effects
resolve_decision_review (model-ops.ts) | write | answers a decision review
list_moves (moves.ts) | read | read-only
get_move (moves.ts) | read | read-only
create_client (onboarding.ts) | write | inserts client; may start a competitor search (discovery_run + rival-search job)
update_client_profile (onboarding.ts) | write | updates client; may start a competitor search
update_client_details (client-details.ts) | write | edits name, phone, address, owner contact; email masked in support sessions
upload_client_logo (client-details.ts) | write | stores a content-addressed PNG logo, sets client.logo_url
get_client_details (client-details.ts) | read | phone, address, logo, owner contact; contactEmail masked in support sessions
get_ad_activity (overview.ts) | read | read-only
get_workspace_overview (overview.ts) | read | read-only
list_tracked_pages (pages.ts) | read | read-only
set_page_pin (pages.ts) | write | updates tracked page
add_tracked_page (pages.ts) | write | inserts tracked page
platform_overview (platform-console.ts) | read | read; audit row only
list_platform_agencies (platform-console.ts) | read | read; audit row only
get_platform_agency (platform-console.ts) | read | read; audit row only
list_platform_activity (platform-console.ts) | read | read; audit row only
get_runbook (runbooks.ts) | read | lazily creates the platform/agency runbook (skipped under support)
update_runbook_item (runbooks.ts) | write | upserts runbook item; client thresholds write client.score_thresholds
set_runbook_item_enabled (runbooks.ts) | write | updates runbook item
pull_runbook_update (runbooks.ts) | write | updates runbook item from the level above
dismiss_runbook_update (runbooks.ts) | write | updates runbook item
add_runbook_item (runbooks.ts) | write | inserts item; key * creates the client runbook and enqueues runbook-tailor
remove_runbook_item (runbooks.ts) | write | tombstones or deletes runbook item
retailor_runbook_item (runbooks.ts) | write | one paid model call, saves nothing
get_portfolio (portfolio.ts) | read | read-only
get_price_matrix (pricing.ts) | read | read-only
get_price_history (pricing.ts) | read | read-only
list_prospects (prospects.ts) | read | select only
run_prospect_snapshot (prospects.ts) | write | inserts report, enqueues job
get_prospect_report (prospects.ts) | read | select only
convert_prospect (prospects.ts) | write | updates client status; may start a competitor search
get_geogrid (rankings.ts) | read | read-only
get_rank_trend (rankings.ts) | read | read-only
get_share_of_voice (rankings.ts) | read | read-only
list_recommendations (recommendations.ts) | read | read-only
update_recommendation_status (recommendations.ts) | write | updates status
list_trend_reports (reports.ts) | read | read-only
get_trend_report (reports.ts) | read | read-only
get_topic_benchmark (reputation.ts) | read | read-only
get_rating_trend (reputation.ts) | read | read-only
search_reviews (reputation.ts) | read | read-only
list_brief_queue (review.ts) | read | read
get_brief_review (review.ts) | read | read; computed touched flag
edit_brief_item (review.ts) | write | edits brief
drop_brief_item (review.ts) | write | edits brief
reorder_brief_items (review.ts) | write | edits brief
rate_brief_item (review.ts) | write | stores rating
approve_brief (review.ts) | write | approves brief
send_brief_now (review.ts) | write | sends brief, enqueues PDF
set_brief_auto_send (review.ts) | write | updates client setting
search (search.ts) | read | read; embedding skipped under support ctx
invite_member (settings.ts) | write | creates invitation (email); agency-role invites send `team_invite` directly, capped with agency resends at 20 per agency / 24 h (15c-2a)
revoke_membership (settings.ts) | write | revokes
revoke_invitation (settings.ts) | write | revokes
resend_invitation (settings.ts) | write | resets the 14-day expiry and emails the invite again (`client_invite` via the outbox, `team_invite` directly); 3 per invitation / 24 h, and agency-role resends count toward the 20 per agency / 24 h `team_invite` cap (15c-2a)
update_agency_branding (settings.ts) | write | updates agency
get_team (agency-settings-reads.ts) | read | read-only; agency roles; masks members[].email/name, invitations[].email (7a2)
get_agency_branding (agency-settings-reads.ts) | read | read-only; agency_admin; masks stored/resolved.fromEmail (7a2)
list_webhooks (agency-settings-reads.ts) | read | read-only; agency_admin; host only (7a2)
list_client_recipients (agency-settings-reads.ts) | read | read-only; agency roles; masks items[].email/name (7a2)
get_onboarding_status (agency-onboarding.ts) | read | read
save_agency_basics (agency-onboarding.ts) | write | updates agency, agency_profile, auth.user name
finish_onboarding (agency-onboarding.ts) | write | updates agency_onboarding
mark_onboarding_step (agency-onboarding.ts) | write | updates agency_onboarding
dismiss_onboarding_checklist (agency-onboarding.ts) | write | updates agency_onboarding
mark_onboarding_redirected (agency-onboarding.ts) | write | updates agency_onboarding
get_agency_profile (agency-onboarding.ts) | read | read (supportMask contactEmail, billingEmail)
update_agency_profile (agency-onboarding.ts) | write | updates agency + agency_profile
upload_agency_logo (agency-onboarding.ts) | write | puts logos/<agency>/<sha>.png in object storage; updates agency.branding.logoUrl
find_business (setup.ts) | read | paid vendor lookup, ledgered; refused under support sessions
get_client_setup (setup.ts) | read | read
save_setup_profile (setup.ts) | write | updates client profile + client_setup.last_changed_*; may start the first auto search
pick_setup_competitors (setup.ts) | write | accepts/dismisses competitor suggestions (links competitors, enqueues discovery)
advance_client_setup (setup.ts) | write | updates client_setup; start_search starts a discovery run
invite_client_owner (setup.ts) | write | creates invitation + contact, sets client_setup.invited_*, queues the client_invite email
list_leads (leads.ts) | read | read (supportMask leads[].email, leads[].message)
get_lead (leads.ts) | read | read (supportMask email, message)
accept_lead (leads.ts) | write | creates prospect client + client_setup, updates lead, creates invitation + contact, queues client_invite, enqueues setup-suggestions
decline_lead (leads.ts) | write | updates lead (back to pool or declined); sends the pool notice or the declined email directly
get_intake_link (leads.ts) | read | read
update_intake_link (leads.ts) | write | creates/updates intake_link
list_pool_leads (platform-leads.ts) | read | read (supportMask leads[].email, leads[].phone, leads[].message)
assign_lead (platform-leads.ts) | write | updates lead (agency, assigned_*, clears decided_*); sends the agency new-lead email directly
get_billing_summary (billing.ts) | read | gateway reads only
get_seat_report (billing.ts) | read | read
create_checkout_session (billing.ts) | write | creates Stripe customer/session
create_portal_session (billing.ts) | write | creates Stripe portal session
redeem_discount_code (billing.ts) | write | stores/attaches coupon
pause_client (client-pause.ts) | write | sets client.paused_at
resume_client (client-pause.ts) | write | clears client.paused_at
get_rank_settings (rankings.ts) | read | read (agency roles only)
update_client_rank_settings (rankings.ts) | write | updates client.rank_keywords/rank_grid_size/service_area; queues rank-map-refresh
request_rank_scan (rankings.ts) | write | inserts rank_scan row; queues rank-scan job (paid vendor calls)
get_connect_status (client-billing.ts) | read | live account read only; display-only merge, no writes
start_stripe_connect (client-billing.ts) | write | creates Stripe account link; upserts agency_connect
disconnect_stripe (client-billing.ts) | write | disconnects agency_connect and client_billing locally
set_client_billing_defaults (client-billing.ts) | write | creates connected product/price; updates agency_connect
enable_client_billing (client-billing.ts) | write | creates connected price + Checkout session; invites client; queues client notice
disable_client_billing (client-billing.ts) | write | cancels connected subscription at period end, expires pending Checkout session; updates client_billing
resend_client_payment_link (client-billing.ts) | write | expires old and creates new Checkout session; replaces unsent client notice
set_client_price (client-billing.ts) | write | creates connected price; updates connected subscription price (no proration)
get_client_revenue (client-billing.ts) | read | stored client_billing + 9a plan read only; agency admin
list_client_billing_status (client-billing.ts) | read | stored client_billing read only; AM payload has no amounts
get_my_billing (my-billing.ts) | read | stored client_billing + optional live subscription read; client owner only
get_my_usage (my-usage.ts) | read | read-only (ledger sums + client row); agency roles and the client owner, credits only
get_spend_status (my-usage.ts) | read | read-only (client rows); credits-paused clients visible to the caller
open_billing_portal (my-billing.ts) | write | creates connected portal session; client owner only
list_plans (platform-billing.ts) | read | read-only; platform operator
list_discount_codes (platform-billing.ts) | read | read-only; platform operator
list_invite_links (platform-billing.ts) | read | read-only; platform staff; supportMask emailLock
get_agency_billing (platform-billing.ts) | read | gateway invoice read only; platform operator
get_billing_overview (platform-billing.ts) | read | read-only; platform operator
get_connect_overview (platform-billing.ts) | read | read-only; platform operator
list_plan_agencies (platform-plan-move.ts) | read | read-only; platform operator
create_plan_version (platform-billing.ts) | write | creates Stripe prices; platform owner
move_agencies_to_current_plan (platform-plan-move.ts) | write | sets plan_id, swaps Stripe subscription prices, emails admins; platform owner
create_discount_code (platform-billing.ts) | write | creates Stripe coupon/promotion code; platform owner
revoke_discount_code (platform-billing.ts) | write | deactivates promotion code; platform owner
create_invite_link (platform-billing.ts) | write | stores hashed invite token; platform staff
revoke_invite_link (platform-billing.ts) | write | revokes link; platform staff
grant_pilot (platform-billing.ts) | write | billing state transition; platform staff
end_pilot (platform-billing.ts) | write | billing state transition; platform staff
extend_trial (platform-billing.ts) | write | billing state transition; platform staff
attach_agency_discount (platform-billing.ts) | write | creates Stripe customer, attaches coupon; platform staff
set_seat_cap_exempt (platform-billing.ts) | write | updates agency_billing; platform owner
set_connect_fee_percent (platform-billing.ts) | write | updates platform_setting or agency_connect fee; platform owner
list_agency_people (platform-agency.ts) | read | read-only (team via platform target-agency context); platform operator; archived agencies allowed; supportMask emails
platform_rename_agency (platform-agency.ts) | write | updates agency.name; platform staff
platform_change_member_role (platform-agency.ts) | write | updates membership role (last-admin lock); platform staff
platform_remove_member (platform-agency.ts) | write | deletes membership (last-admin lock); platform staff
platform_invite_agency_admin (platform-agency.ts) | write | inserts invitation; sends team_invite as the agency; platform staff; 20 / agency / 24 h
platform_resend_invitation (platform-agency.ts) | write | resets invitation expiry; re-sends the invite as the agency; platform staff; shares 3 / 24 h with resend_invitation
platform_revoke_invitation (platform-agency.ts) | write | revokes invitation; platform staff
platform_suspend_agency (platform-agency.ts) | write | sets agency.suspended_*; then pauses Stripe collection (platform + Connect subs) and emails agency_hold to the agency's admins; platform staff
platform_unsuspend_agency (platform-agency.ts) | write | clears agency.suspended_*; then resumes Stripe collection, post-commit seat sync, emails agency_hold (lifted); platform staff
platform_retry_hold_billing (platform-agency.ts) | write | re-runs the Stripe collection pause (held) / resume (lifted), inserts agency_billing_event; platform staff
platform_archive_agency (platform-agency.ts) | write | sets agency.archived_at (refused with live billing); platform owner
platform_unarchive_agency (platform-agency.ts) | write | clears agency.archived_at (archived agencies allowed); platform owner
get_signups_paused (platform-signups.ts) | read | read-only; platform operator
get_signup_funnel (platform-signups.ts) | read | read-only aggregate counts; platform operator
set_signups_paused (platform-signups.ts) | write | upserts platform_setting; platform owner
get_pilot_settings (platform-signups.ts) | read | read-only; platform operator (17a)
set_pilot_mode (platform-signups.ts) | write | upserts platform_setting `pilot_mode` (closes open agency sign-up); platform owner (17a)
set_sample_brief_limit (platform-signups.ts) | write | upserts platform_setting `sample_brief_monthly_limit`; platform owner (17a)
add_webhook (settings.ts) | write | inserts webhook
set_webhook_active (settings.ts) | write | updates webhook
delete_webhook (settings.ts) | write | deletes webhook (notifications cascade); agency_admin (15c-2a)
test_webhook (settings.ts) | write | sends one test message to the webhook (host allow-list, no redirects, 5 s); agency_admin; 5 per webhook / 10 min (15c-2a)
add_client_recipient (settings.ts) | write | inserts recipient
deactivate_recipient (settings.ts) | write | updates recipient
update_client_delivery (settings.ts) | write | updates delivery settings
set_my_notification_pref (settings.ts) | write | updates preference
update_my_contact (settings.ts) | write | updates contact
list_theme_proposals (themes.ts) | read | read-only
get_nav_counts (nav-counts.ts) | read | read-only counts (agency menu badges)
get_platform_nav_counts (nav-counts.ts) | read | read-only counts; platform operator
get_feedback_contact (feedback.ts) | read | read-only; the client's AM, else the agency admin (replyToFor); web only; email/name masked in support (7c2)
decide_theme_proposal (themes.ts) | write | decides proposal
get_usage (usage.ts) | read | read-only
set_client_limits (usage.ts) | write | updates client limits; platform staff only, supportHidden; lifts a spend pause + writes spend_guard_event in one tx (7b1)
get_client_limits (usage.ts) | read | read-only; platform operator, supportHidden (7b1)
get_spend_guard (spend-guard.ts) | read | read-only; platform operator, supportHidden, web only (7b1)
get_ai_guard_state (spend-guard.ts) | read | read-only; platform operator, supportHidden, web only (7b1)
update_spend_guard_settings (spend-guard.ts) | write | merges spend guard settings in platform_setting; platform owner only, supportHidden, web only (7b1)
reset_ai_pause (spend-guard.ts) | write | clears the platform AI pause, snoozes the guard, writes a spike_reset event; platform staff, supportHidden, web only (7b1)
start_support_session (support.ts) | write | opens a session row + audit; operator ctx only
end_support_session (support.ts) | write | ends the caller's open session; audited under the session's agency (7a2)
list_support_sessions (support.ts) | read | read-only; agency_admin; supportHidden
set_support_access_notify (support.ts) | write | updates agency flag
list_agency_support_sessions (support.ts) | read | read; audit row only (platform console)
list_platform_costs (platform-costs.ts) | read | read-only; platform owner; supportHidden
refresh_platform_costs (platform-costs.ts) | write | enqueues a worker job; platform owner; supportHidden
update_platform_cost_service (platform-costs.ts) | write | updates vendor settings; platform owner; supportHidden
save_platform_cost_item (platform-costs.ts) | write | inserts/updates a cost item; platform owner; supportHidden
archive_platform_cost_item (platform-costs.ts) | write | archives a cost item; platform owner; supportHidden
list_verticals (verticals.ts) | read | read-only
create_vertical (verticals.ts) | write | inserts vertical, areas, categories (service tx)
add_business_area (verticals.ts) | write | inserts an unreviewed business area
update_vertical (verticals.ts) | write | updates an unreviewed vertical the agency created, or any live vertical for platform staff
draft_vertical (verticals.ts) | write | one paid model call plus a vertical_draft insert (service); web only
review_vertical (platform-verticals.ts) | write | approves or renames a vertical (service tx, catalogue lock)
review_business_area (platform-verticals.ts) | write | approves or renames a business area
merge_vertical (platform-verticals.ts) | write | rewrites clients, events, prices and agency settings onto the target vertical
merge_business_area (platform-verticals.ts) | write | rewrites references from one area to another
list_catalog_review (platform-verticals.ts) | read | operator-only read of unreviewed catalogue entries
count_catalog_review (platform-verticals.ts) | read | operator-only count of unreviewed catalogue entries (sidebar badge; unaudited)
list_waitlist (platform-waitlist.ts) | read | read (supportMask entries[].email, entries[].emailConfirmed); platform operator, viewer and up (17a)
invite_waitlist_agencies (platform-waitlist.ts) | write | creates agency_invite_link rows, updates waitlist_entry status, sends the agency invite email directly; platform staff (17a)
decline_waitlist_entry (platform-waitlist.ts) | write | sets waitlist_entry status declined (and a requested sample declined); nobody is emailed; platform staff (17a)
platform_find_business (platform-waitlist.ts) | write | paid vendor listing lookup, ledgered with no agency; 50 per operator per UTC day via intake_rate; platform staff (17a)
assign_waitlist_business (platform-waitlist.ts) | write | inserts a verified pool lead, assigns it to an agency, updates waitlist_entry, sends the agency new-lead email directly; platform staff (17a)
decide_sample_brief (platform-waitlist.ts) | write | approve: creates the Samples agency once, an agency_admin membership and the sample client, updates waitlist_entry; decline or stop: updates waitlist_entry and pauses the sample client; platform staff (17a)
send_sample_brief (platform-waitlist.ts) | write | signs the 30-day sample link, emails it (supportMask emailed), sets sample status sent, pauses the sample client; platform staff (17a)
