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
delete_my_ask_thread (ask-threads.ts) | write | deletes thread (permission is read, but it deletes); supportHidden
get_ask_starters (ask-threads.ts) | read | read-only
list_briefs (briefs.ts) | read | read-only
get_brief (briefs.ts) | read | read-only
list_clients (clients.ts) | read | read-only
get_client_profile (clients.ts) | read | read-only
get_competitor_profile (competitor-profile.ts) | read | read-only
get_competitor_timeline (competitor-profile.ts) | read | read-only
list_competitor_suggestions (competitors.ts) | read | read-only
request_competitor_suggestions (competitors.ts) | write | enqueues suggest-competitors job
get_competitor_search_status (competitors.ts) | read | reads job state only
accept_competitor_suggestion (competitors.ts) | write | inserts competitor, enqueues discovery
dismiss_competitor_suggestion (competitors.ts) | write | updates suggestion
list_client_competitors (competitors.ts) | read | read-only
add_competitor (competitors.ts) | write | inserts competitor + link, enqueues discovery
remove_competitor (competitors.ts) | write | deletes link
search_events (events.ts) | read | read-only
get_event (events.ts) | read | read-only
submit_feedback (events.ts) | write | inserts feedback
get_evidence (evidence.ts) | read | read-only
compare_snapshots (evidence.ts) | read | read-only
fetch (fetch.ts) | read | read-only
list_kb_articles (knowledge-admin.ts) | read | read-only
list_kb_targets (knowledge-admin.ts) | read | read-only
get_kb_article_admin (knowledge-admin.ts) | read | read-only
upsert_kb_article (knowledge-admin.ts) | write | writes article, enqueues embed
delete_kb_article (knowledge-admin.ts) | write | deletes article
set_kb_auto_sync (knowledge-admin.ts) | write | updates article
import_kb_url (knowledge-admin.ts) | write | enqueues kb-import
get_kb_import_status (knowledge-admin.ts) | read | reads job state only
search_knowledge (knowledge.ts) | read | read; embedding skipped under support ctx
get_kb_article (knowledge.ts) | read | read-only
list_decision_reviews (model-ops.ts) | read | read; no side effects
resolve_decision_review (model-ops.ts) | write | answers a decision review
list_moves (moves.ts) | read | read-only
get_move (moves.ts) | read | read-only
create_client (onboarding.ts) | write | inserts client
update_client_profile (onboarding.ts) | write | updates client
get_ad_activity (overview.ts) | read | read-only
get_workspace_overview (overview.ts) | read | read-only
list_tracked_pages (pages.ts) | read | read-only
set_page_pin (pages.ts) | write | updates tracked page
add_tracked_page (pages.ts) | write | inserts tracked page
platform_overview (platform-console.ts) | read | read; audit row only
list_platform_agencies (platform-console.ts) | read | read; audit row only
get_platform_agency (platform-console.ts) | read | read; audit row only
list_platform_activity (platform-console.ts) | read | read; audit row only
list_playbooks (playbooks.ts) | read | read-only
update_playbook (playbooks.ts) | write | upserts playbook override
get_portfolio (portfolio.ts) | read | read-only
get_price_matrix (pricing.ts) | read | read-only
get_price_history (pricing.ts) | read | read-only
list_prospects (prospects.ts) | read | select only
run_prospect_snapshot (prospects.ts) | write | inserts report, enqueues job
get_prospect_report (prospects.ts) | read | select only
convert_prospect (prospects.ts) | write | updates client status
get_geogrid (rankings.ts) | read | read-only
get_share_of_voice (rankings.ts) | read | read-only
list_recommendations (recommendations.ts) | read | read-only
update_recommendation_status (recommendations.ts) | write | updates status
list_trend_reports (reports.ts) | read | read-only
get_trend_report (reports.ts) | read | read-only
get_theme_benchmark (reputation.ts) | read | read-only
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
invite_member (settings.ts) | write | creates invitation (email)
revoke_membership (settings.ts) | write | revokes
revoke_invitation (settings.ts) | write | revokes
update_agency_branding (settings.ts) | write | updates agency
add_webhook (settings.ts) | write | inserts webhook
set_webhook_active (settings.ts) | write | updates webhook
add_client_recipient (settings.ts) | write | inserts recipient
deactivate_recipient (settings.ts) | write | updates recipient
update_client_delivery (settings.ts) | write | updates delivery settings
set_my_notification_pref (settings.ts) | write | updates preference
update_my_contact (settings.ts) | write | updates contact
list_theme_proposals (themes.ts) | read | read-only
decide_theme_proposal (themes.ts) | write | decides proposal
get_usage (usage.ts) | read | read-only
set_client_limits (usage.ts) | write | updates client
start_support_session (support.ts) | write | opens a session row + audit; operator ctx only
end_support_session (support.ts) | write | ends the caller's open session
list_support_sessions (support.ts) | read | read-only; agency_admin; supportHidden
set_support_access_notify (support.ts) | write | updates agency flag
list_agency_support_sessions (support.ts) | read | read; audit row only (platform console)
