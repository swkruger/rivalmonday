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
| `/agency` | admin | `get_portfolio` | — |
| `/agency/alerts` | admin | `list_alert_queue` | — |
| `/agency/approvals` | admin | `list_brief_queue` | — |
| `/agency/approvals/[briefId]` | admin | `get_brief_review` | — |
| `/agency/approvals/[briefId] (quiet)` | admin | — | `get_brief_review`: Brazos’s brief is held as quiet |
| `/agency/branding` | admin | `fn:getAgencyBranding` | — |
| `/agency/playbooks` | admin | `list_playbooks` | — |
| `/agency/prospects` | admin | `list_prospects` | — |
| `/agency/prospects/[clientId]` | admin | `get_client_profile`, `get_prospect_report`, `list_client_competitors` | — |
| `/agency/team` | admin | `fn:listTeam`, `list_clients` | — |
| `/agency/usage` | admin | `get_usage` | — |
| `/agency/webhooks` | admin | `fn:listWebhooks` | — |
| `/c/[clientId]` | admin | `get_client_profile`, `get_workspace_overview`, `get_ad_activity`, `get_brief`, `list_alerts`, `list_briefs`, `list_moves`, `list_recommendations`, `list_trend_reports` | — |
| `/c/[clientId] (client owner)` | ownerLoneStar | `get_workspace_overview`, `list_briefs`, `get_brief` | — |
| `/c/[clientId]/ads` | admin | `get_ad_activity`, `list_ads` | `list_ads`: one competitor runs no ads |
| `/c/[clientId]/alerts/[alertId]` | admin | `get_alert` | — |
| `/c/[clientId]/briefs/[briefId]` | ownerLoneStar | `get_brief` | — |
| `/c/[clientId]/changes` | admin | `search_events`, `get_event`, `compare_snapshots`, `list_client_competitors`, `get_client_profile` | — |
| `/c/[clientId]/competitors` | admin | `get_client_profile`, `list_client_competitors`, `list_competitor_suggestions`, `get_competitor_search_status` | — |
| `/c/[clientId]/competitors/[competitorId]` | admin | `get_competitor_profile`, `get_competitor_timeline`, `list_tracked_pages`, `get_price_matrix`, `list_ads`, `get_theme_benchmark`, `get_geogrid` | — |
| `/c/[clientId]/evidence/[evidenceId]` | admin | `get_evidence` | — |
| `/c/[clientId]/moves` | admin | `list_moves`, `get_move` | — |
| `/c/[clientId]/pitch-snapshot` | admin | `get_client_profile`, `get_prospect_report` | — |
| `/c/[clientId]/pricing` | admin | `get_price_matrix`, `get_price_history` | `get_price_history`: one competitor shows no prices |
| `/c/[clientId]/rankings` | admin | `get_geogrid`, `get_share_of_voice` | `get_geogrid`: one competitor never ranks |
| `/c/[clientId]/rankings (Brazos)` | admin | `get_geogrid` | — |
| `/c/[clientId]/recommendations` | admin | `get_client_profile`, `list_recommendations` | — |
| `/c/[clientId]/reports/[reportId]` | admin | `get_trend_report` | — |
| `/c/[clientId]/reviews` | admin | `get_theme_benchmark`, `get_rating_trend`, `search_reviews` | — |
| `/c/[clientId]/reviews (Brazos)` | admin | `get_rating_trend` | `search_reviews`: Brazos has no own business ("add your place id"); `search_reviews`: one competitor has no reviews |
| `/c/[clientId]/settings/ai` | admin | `get_client_profile` | — |
| `/c/[clientId]/settings/alerts` | admin | `get_client_profile`, `get_alert_rules` | — |
| `/c/[clientId]/settings/delivery` | admin | `get_client_profile` | — |
| `/c/[clientId]/settings/profile` | admin | `get_client_profile` | — |
| `/inbox` | admin | `fn:listInbox` | — |
| `/inbox (client owner)` | ownerLoneStar | `fn:listInbox` | — |
| `/platform/reviews` | operator | `list_decision_reviews` | — |
| `/platform/themes` | operator | `list_theme_proposals` | — |
| `/settings/notifications` | admin | `fn:myNotificationSettings` | — |
<!-- coverage:end -->
