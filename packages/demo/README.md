# @cs/demo

Fictional demo data for Rival Monday (spec: `docs/superpowers/specs/2026-10-09-demo-data-and-snapshots-design.md`).

- `pnpm demo:reset` creates `cs_demo` if it is missing, then wipes, migrates and seeds it, writes the evidence files to `apps/worker/.evidence-demo` and prints sign-in links.
- `pnpm demo:links` prints fresh sign-in links. They open `/dev-panel/sign-in/<token>` and work only while the app runs with the dev panel on (`pnpm dev` or `pnpm demo:dev`).
- `pnpm db:snapshot` and `pnpm db:restore <folder> [--into <db>]` back up and restore `cs_dev` and its evidence (see the root README).

Everything is fictional: businesses use `.example` domains, people use `@demo.rivalmonday.test`, and no vendor, AI model or email service is ever called. Timestamps are relative to the moment of seeding, and one fixed random seed makes every reset produce the same data.

## Adding a screen

A later phase that adds a screen adds its seed data (a new `src/<area>.ts`, called from `src/seed.ts`) and an entry in `src/coverage.ts`. `src/coverage.test.ts` fails when an app screen has no entry, or when a listed tool returns nothing. Then run `pnpm --filter @cs/demo coverage:readme` to refresh the table below.

## Screen coverage

<!-- coverage:start -->
| Screen | Signed in as | Tools that must return data | Empty on purpose |
|---|---|---|---|
| `/agency` | admin | `get_portfolio`, `list_client_billing_status`, `get_onboarding_status`, `get_billing_summary`, `list_help_guides` | `get_spend_status`: no demo client is spend-paused |
| `/agency/settings/ai` | admin | `list_api_tokens`, `list_help_guides` | `list_oauth_grants`: OAuth grants need a real AI app to connect |
| `/agency/alerts` | admin | `list_alert_queue`, `list_help_guides` | — |
| `/agency/approvals` | admin | `list_brief_queue`, `list_help_guides` | — |
| `/agency/approvals/[briefId]` | admin | `get_brief_review`, `list_help_guides` | — |
| `/agency/approvals/[briefId] (quiet)` | admin | — | `get_brief_review`: Brazos’s brief is held as quiet |
| `/agency/settings/branding` | admin | `get_agency_branding`, `list_help_guides` | — |
| `/agency/settings/platform-access` | admin | `list_support_sessions`, `list_help_guides` | — |
| `/agency/settings/runbook` | admin | `get_runbook`, `list_help_guides` | — |
| `/c/[clientId]/setup` | admin | `get_client_setup`, `get_client_profile`, `get_client_details`, `get_connect_status`, `list_client_billing_status`, `list_help_guides` | — |
| `/agency/leads` | admin | `list_leads`, `list_help_guides` | — |
| `/agency/settings/intake` | admin | `get_intake_link`, `list_help_guides` | — |
| `/agency/settings/intake/preview` | admin | `get_intake_link`, `list_help_guides` | — |
| `/agency/prospects` | admin | `list_prospects`, `list_help_guides` | — |
| `/agency/prospects/[clientId]` | admin | `get_client_profile`, `get_prospect_report`, `list_client_competitors`, `list_help_guides` | — |
| `/agency/settings/team` | admin | `get_team`, `list_clients`, `list_help_guides` | — |
| `/agency/settings/usage` | admin | `get_usage`, `list_help_guides` | — |
| `/agency/settings/slack-teams` | admin | `list_webhooks`, `list_help_guides` | — |
| `/c/[clientId]` | admin | `get_client_profile`, `list_help_guides`, `get_workspace_overview`, `get_ad_activity`, `get_brief`, `list_alerts`, `list_briefs`, `list_moves`, `list_recommendations`, `list_trend_reports`, `get_starting_point_status`, `get_client_setup`, `get_ask_starters` | — |
| `/c/[clientId] (client owner)` | ownerLoneStar | `get_starting_point_status`, `get_workspace_overview`, `list_briefs`, `get_brief` | — |
| `/c/[clientId]/ads` | admin | `get_ad_activity`, `list_ads`, `list_client_competitors`, `get_client_profile`, `list_help_guides` | `list_ads`: one competitor runs no ads |
| `/c/[clientId]/alerts/[alertId]` | admin | `get_alert`, `get_client_profile`, `list_alerts`, `list_help_guides` | — |
| `/c/[clientId]/ask` | admin | `get_ask_starters`, `list_my_ask_threads`, `get_my_ask_thread`, `get_client_profile` | — |
| `/c/[clientId]/ask/[threadId]` | admin | `get_ask_starters`, `list_my_ask_threads`, `get_my_ask_thread`, `get_client_profile` | — |
| `/c/[clientId]/ask/[threadId] (client owner)` | ownerLoneStar | `list_my_ask_threads`, `get_my_ask_thread` | `get_my_ask_thread`: threads are author-only |
| `/c/[clientId]/briefs` | admin | `get_client_profile`, `list_briefs`, `list_alerts`, `list_trend_reports`, `list_help_guides` | — |
| `/c/[clientId]/briefs/[briefId]` | ownerLoneStar | `get_brief`, `get_client_profile`, `list_briefs`, `get_feedback_contact`, `list_help_guides` | — |
| `/c/[clientId]/briefs/[briefId] (starting point)` | ownerBrazos | `get_brief` | — |
| `/c/[clientId]/briefs/[briefId] (starting point findings)` | ownerBrazos | `get_brief` | — |
| `/c/[clientId]/briefs/[briefId] (quiet week)` | admin | `get_brief` | — |
| `/c/[clientId]/changes` | admin | `search_events`, `get_event`, `compare_snapshots`, `compare_captures`, `list_client_competitors`, `get_client_profile`, `list_help_guides` | — |
| `/c/[clientId]/competitors` | admin | `get_client_profile`, `list_client_competitors`, `list_competitor_suggestions`, `get_competitor_search_status`, `get_competitor_signals`, `list_help_guides` | — |
| `/c/[clientId]/competitors/[competitorId]` | admin | `get_competitor_profile`, `get_competitor_timeline`, `list_tracked_pages`, `get_price_matrix`, `list_ads`, `get_topic_benchmark`, `get_geogrid`, `get_competitor_signals`, `get_competitor_ad_matches`, `get_client_profile`, `list_help_guides` | — |
| `/c/[clientId]/evidence/[evidenceId]` | admin | `get_evidence`, `compare_captures`, `get_client_profile`, `list_help_guides` | — |
| `/c/[clientId]/moves` | admin | `list_moves`, `get_move`, `get_client_profile`, `list_help_guides` | — |
| `/c/[clientId]/pitch-snapshot` | admin | `get_client_profile`, `get_prospect_report`, `list_help_guides` | — |
| `/c/[clientId]/pricing` | admin | `get_price_matrix`, `get_price_history`, `get_client_profile`, `list_help_guides` | `get_price_history`: one competitor shows no prices |
| `/c/[clientId]/rankings` | admin | `get_geogrid`, `get_rank_trend`, `get_share_of_voice`, `get_rank_settings`, `get_client_profile`, `list_help_guides` | `get_geogrid`: one competitor never ranks |
| `/c/[clientId]/rankings (Brazos)` | admin | `get_geogrid` | — |
| `/c/[clientId]/recommendations` | admin | `get_client_profile`, `list_recommendations`, `list_help_guides` | — |
| `/c/[clientId]/reports/[reportId]` | admin | `get_trend_report`, `get_client_profile`, `list_trend_reports`, `list_help_guides` | — |
| `/c/[clientId]/reviews` | admin | `get_topic_benchmark`, `get_rating_trend`, `search_reviews`, `get_client_profile`, `list_help_guides` | — |
| `/c/[clientId]/reviews (Brazos)` | admin | `get_rating_trend` | `search_reviews`: Brazos has no own business ("add your place id"); `search_reviews`: one competitor has no reviews |
| `/c/[clientId]/settings/ai` | admin | `get_client_profile`, `list_api_tokens`, `list_help_guides` | `list_oauth_grants`: OAuth grants need a real AI app to connect |
| `/c/[clientId]/settings/ai (client owner)` | ownerLoneStar | `get_client_profile`, `list_api_tokens` | — |
| `/c/[clientId]/settings/usage` | admin | `get_client_profile`, `get_my_usage`, `list_help_guides` | — |
| `/c/[clientId]/settings/alerts` | admin | `get_client_profile`, `get_alert_rules`, `list_help_guides` | — |
| `/c/[clientId]/settings/runbook` | admin | `get_client_profile`, `get_runbook`, `list_help_guides` | — |
| `/c/[clientId]/settings/delivery` | admin | `get_client_profile`, `list_client_recipients`, `list_help_guides` | — |
| `/c/[clientId]/settings/profile` | admin | `get_client_profile`, `get_ask_starters`, `list_client_billing_status`, `list_help_guides` | — |
| `/c/[clientId]/settings/billing (client owner)` | ownerLoneStar | `get_my_billing`, `get_client_profile`, `list_help_guides` | — |
| `/agency/settings/billing` | admin | `get_billing_summary`, `get_connect_status`, `get_client_revenue`, `list_help_guides` | — |
| `/onboarding (step=profile)` | admin | `get_onboarding_status`, `get_agency_profile`, `get_agency_branding`, `list_help_guides` | — |
| `/onboarding (step=team)` | admin | `get_onboarding_status`, `get_agency_profile`, `get_agency_branding` | — |
| `/onboarding (step=branding)` | admin | `get_onboarding_status`, `get_agency_profile`, `get_agency_branding` | — |
| `/onboarding (step=done)` | admin | `get_onboarding_status`, `get_agency_profile`, `get_agency_branding`, `get_team` | — |
| `/agency/clients/new` | admin | `list_help_guides` | — |
| `/agency/prospects/new` | admin | `list_help_guides` | — |
| `/paused` | admin | — | — |
| `/inbox` | admin | `fn:listInbox`, `list_help_guides` | — |
| `/inbox (client owner)` | ownerLoneStar | `fn:listInbox` | — |
| `/kb/[id]` | admin | `get_kb_article` | — |
| `/platform` | operator | `platform_overview`, `list_platform_activity`, `list_help_guides` | — |
| `/platform/runbook` | operator | `get_runbook`, `list_help_guides` | — |
| `/platform/agencies` | operator | `list_platform_agencies`, `list_help_guides` | — |
| `/platform/agencies/[id]` | operator | `get_platform_agency`, `list_agency_support_sessions`, `get_agency_billing`, `list_discount_codes`, `get_client_limits`, `list_agency_people`, `list_help_guides` | `list_plan_agencies`: every demo agency is on the current plan version |
| `/platform/billing` | operator | `get_billing_overview`, `list_plans`, `list_discount_codes`, `get_connect_overview`, `get_signup_funnel`, `list_help_guides` | `list_plan_agencies`: every demo agency is on the current plan version; `list_invite_links`: the demo seeds no invite links; `get_signups_paused`: open sign-up is not paused in the demo |
| `/platform/costs` | operator | `list_platform_costs`, `get_spend_guard`, `list_help_guides` | — |
| `/platform/leads` | operator | `list_pool_leads`, `list_help_guides` | — |
| `/platform/health` | operator | `get_platform_health`, `get_spend_guard`, `list_help_guides` | — |
| `/platform/ask` | operator | `fn:listReviewableAskThreads`, `list_help_guides` | — |
| `/platform/ask/[threadId]` | operator | `fn:getReviewableAskThread`, `list_help_guides` | — |
| `/platform/knowledge` | operator | `list_kb_articles`, `list_kb_targets`, `list_help_guides` | — |
| `/platform/knowledge/new` | operator | `list_kb_targets`, `list_help_guides` | — |
| `/platform/knowledge/[id]` | operator | `get_kb_article_admin`, `list_kb_targets`, `list_help_guides` | — |
| `/platform/reviews` | operator | `list_decision_reviews`, `list_help_guides` | — |
| `/platform/verticals` | operator | `list_verticals`, `list_help_guides` | `list_catalog_review`: the demo agencies add no business types; `list_catalog_review`: the demo agencies add no services; `count_catalog_review`: nothing waits for review in the demo |
| `/platform/topics` | operator | `list_topic_proposals`, `list_help_guides` | — |
| `/agency/help` | admin | `list_help_guides`, `search_knowledge` | — |
| `/c/[clientId]/help` | admin | `list_help_guides`, `search_knowledge`, `get_client_profile` | — |
| `/c/[clientId]/help (client owner)` | ownerLoneStar | `list_help_guides`, `search_knowledge`, `get_client_profile` | — |
| `/platform/help` | operator | `list_help_guides`, `search_knowledge` | — |
| `/settings/notifications` | admin | `fn:myNotificationSettings`, `list_help_guides` | — |
| `/sign-up` | public | — | sign-up form (paused copy while sign-ups are paused) |
| `/sign-up/problem` | public | — | needs a signed-in user whose invite-link sign-up failed |
| `/join/[token]` | public | — | needs a fresh invite link (create one in /platform/billing) |
| `/u/[token]/confirm` | public | — | needs a setup-tip unsubscribe token (from a tip email) |
| `/u/[token]/done` | public | — | shown after unsubscribing |
| `/start` | public | — | platform intake form (the business search needs a vendor call) |
| `/start/[slug]` | public | — | agency intake form; the demo link is /start/demo-agency |
| `/start/v/[leadId]` | public | — | free preview; needs a view token (issued when a visitor opens the verify email link) |
| `/start/verify` | public | — | expired-link page; /start/verify/[token] is a redirect handler |
<!-- coverage:end -->
