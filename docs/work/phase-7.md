# phase-7 — Launch readiness (7a production & security, 7b money, 7c scale & pilot)

**Kind:** implementation (7a1 + 7a2)   **Worktree:** ../CompetitorSpy-wt/phase-7   **Base:** main @ 10ce242d (15b2 merged)
**Plan/spec:** [7a spec](../superpowers/specs/2026-10-19-phase-7a-launch-production-security-design.md) (supersedes the parked 2026-10-12 spec); plans [7a1](../superpowers/plans/2026-10-19-phase-7a1-deploy-observability.md), [7a2](../superpowers/plans/2026-10-19-phase-7a2-security-data-lifecycle.md). Item lists: [phase-7-scope.md](phase-7-scope.md).

## Status (overwrite)
2026-10-22: **7a1 Tasks 0-11 and all of 7a2 built, reviewed, final review + fix wave done** (0083 archived visibility), on main 10ce242d; test DB `cs_phase_7_test` (at 0083). **7a1 Task 12 (live deploy) waits on the owner's prod accounts (O17)** and the shell-DB-stages gate. `/rm-merge` needs the owner's go-ahead.

## Next (overwrite)
1. `/rm-merge` (owner go-ahead).
2. Owner: prod accounts (O17); create `cs_worker`/`cs_web` on Neon dev (below) before `0081` reaches `cs_dev`.
3. Fix shell DB stages (gate below), then 7a1 Task 12. 7b brainstorming may start any time (O1).

## Interfaces this branch adds or changes
- **Migrations:** `0081_runtime_roles` (after 15b's `0080`); `0082_lifecycle`: `client`/`agency.archived_at`, `plan.features` (`ask`,`mcp`), notification status `skipped`, 5 ledger/audit FKs dropped (`audit_log`, `llm_call`, `vendor_call`), `client_isolation` archived clause; `0083_archived_client_visibility`: `app_client_visible()` false for an archived client (SECURITY DEFINER `app_client_archived()`).
- **7a1:** `@cs/core/server` (logging/redaction), tool `get_platform_health`, pages `/platform/health`, `/bot`, `/robots.txt`, worker `/healthz`, `REQUIRED_PROD_ENV`, `profile:pages`, `predeploy-check`, `ensureQueueGrants`, `docs/DEPLOY.md`, worker Dockerfile + `railway.json`.
- **7a2:** `@cs/collectors` `net/guard.ts` (sole URL fetch path; renderer `route.fetch` per hop); `hasChannel(ctx, 'ask'|'mcp')`, `planFeaturesFor`, `scopeToClient` (`@cs/core`); Ask route order 404 -> Origin -> 415 -> 413 (32 KB), Ask action allowlist + $0.30 turn budget; `ObjectStore.put` `{ overwrite }` (default refuse); `support_view_*` / `end_support_session` audit rows; `POST /api/postmark/webhook` (basic auth `postmark:<POSTMARK_WEBHOOK_SECRET>`; Bounce HardBounce + SpamComplaint; 200 after auth); CLIs `pnpm --filter @cs/worker archive <agency|client> <id> [--undo]` and `purge-archived --older-than <n>d [--dry-run]` (n >= 30; `docs/OPS.md`); daily jobs: verified leads deleted at 180 d, pending notifications > 7 d overdue -> `skipped`. E2E: `security.spec.ts`, one case in `support.spec.ts`.

## Owner verification steps
Before migrating `cs_dev` to 0081, in the Neon SQL editor **as the owner role**: `CREATE ROLE cs_worker LOGIN PASSWORD '...'; CREATE ROLE cs_web LOGIN PASSWORD '...';` (not the console "add role").
At first deploy (`docs/DEPLOY.md`):
1. `https://rivalmonday.app` serves with TLS; magic-link sign-in arrives from `briefs@mail.rivalmonday.app`; mail-tester >= 9/10.
2. A Sentry test event arrives from web and worker (worker release = commit SHA).
3. Railway marks the deployment Active; `/healthz` 200; `/platform/health` green after one hour.
4. `/bot` and `/robots.txt` load signed-out; then set `WEB_MONITORING_ENABLED=true` (last step).
5. `profile:pages --base https://rivalmonday.app --cookie FILE`: agency/workspace p75 <= 1.5 s, every page <= 3 s.
6. Run `pnpm kb:seed` against prod.

7a2 (owner adds `POSTMARK_WEBHOOK_SECRET` to Vercel; not in local `.env`):
7. Postmark server -> Webhooks: `https://postmark:<secret>@rivalmonday.app/api/postmark/webhook`, Bounce + Spam complaint. Send a Postmark test bounce to the deployed webhook: the contact goes inactive and the agency gets a notice; a wrong password gets 401.
8. Live R2 no-overwrite put at deploy: re-putting an existing key fails (HEAD-then-put; untested live).
9. Archive a throwaway client: `archive client <id>`, its pages 404; `--undo` restores; `purge-archived --older-than 90d --dry-run` lists nothing yet.
10. Ask/MCP plan gate: a plan without `ask` hides Ask pages (default plans keep both).
11. Sign off the `/platform/health` help copy (description, 4 status tips, operator guide) drafted during the rebase.

## Assumes from other branches
- **phase-14b / 15b — merged:** `llm_call.vertical_id` (0078; 7b `cost_usd → numeric` must follow it), `0080_kb_help_key`, `packages/core/src/help/*`.
- **13a** (plan on main, not started): `proxy.ts` host resolution, per-origin Better Auth, `senderFor` + per-agency Postmark domains (overlaps 7a webhook/email env), new env, error pages, `turbo.json`; 7a deploy precedes 13a live.
- **phase-15b2 — merged** (10ce242d).
- **15c** (not started): error/404 pages overlap 13a + 7a error reporting.

## Decisions (owner-approved)
Owner 2026-10-19 (brief Q1–Q17):
1. Order 7a → 7b → 7c; 7b may start once the 7a spec is approved. 2. 7a ‖ 13a, split files (7a: CI, Docker, tracing, logging, DB roles; 13a: proxy, auth host, sender); 7a deploy before 13a's live domain.
3. Vercel iad1 + Railway worker + separate Neon prod; prod + local only; deploy job migrates then deploys. 4. Canonical domain rivalmonday.app.
5. Sentry (web + worker) + pino JSON logs + `/platform/health`. 6. DB roles cs_worker + cs_web, explicit grants incl. pgboss; no owner URL in prod.
7. `archived_at` + operator purge CLI after N days; evidence kept. 8. Unactioned verified leads: PII deleted at 180 d.
9. Postmark hard bounce/complaint → contact deactivated + agency notified; soft ignored. 10. Client at 100% of cap: warn only.
11. Shared collection cost split evenly across active trackers. 12. Queued notifications > 7 d old on reactivation are skipped.
13. Ask/MCP per-plan flag, all on in the pilot. 14. More concurrency in one worker; one replica. 15. Eval sets at spec §12 sizes, LLM pre-labelled, owner confirms.
16. Pilot runbook on existing screens; rename dev agency/client. 17. Owner sets up prod accounts before the deploy task.
18. 7a = 7a1 (deploy/observability/roles) + 7a2 (security/data lifecycle); purge 90 d after archive. 19. 7a1 + 7a2 plans approved incl. /bot copy and new env vars.

## New backlog (target -> item)
- **High, pre-Task-12 gate (15b merged, now unblocked):** shell DB stages — (app) shell ~12 sequential stages/page (max 22), (platform) 19-20 (`list_platform_costs` per-snapshot-row queries); target `--assert-db-stages 8`; also time the Better Auth pg pool and profile ask/[threadId], reports/[reportId], kb/[id].
- 7b: Ask turn deadline — a true AbortSignal through `chatWithTools` (today: 90 s soft deadline, 45 s final-call reserve, route `maxDuration` 300).
- 7a2: `Sentry.captureException(raw pg error)` skips `redactForLog` (beforeSend still redacts); `redactForLog` drops custom Error fields (e.g. `ToolError.code`, by design).
- 7c: embeddings 8 s×2 also bounds worker batch embedding; if `llm_call` shows embeddings ok=false at ≈ 8 s, add an `embeddings_batch` task (30000×3, not request_path).
- 7c: `withQueueStatsReporting`'s default report path (logger + Sentry) is untested.
- 7c: `EnvUrls.owner` → `queue`; `withMonitor` should check in only for the cron payload; job retries re-capture to Sentry.
- Later: `.pnpmfile.cjs` drops drizzle's optional `@opentelemetry/api` peer — revisit if drizzle needs OTel.
- 7a2: `scrubUrl` guard skips lowercase/prefixed transaction names, `ws:` URLs, leading whitespace; `tagRequest` only via `callTool`.
- 7c: `ensureQueueGrants` is a single attempt and its failure is not in health state (web enqueues refused until restart while `/healthz` stays green).
- 7c: structured logging — `JSON.stringify` interpolated in messages; `redactForLog` may strip keys `text/content/body/output`; `tracesSampleRate` hard-coded 0.1; `main.ts` order/shutdown untested.
- 7c: tests — predeploy missing/wrong-typed thresholds untested; `ci.yml` edits do not trigger the shape test under `test:affected`; e2e "destination stream closed early" noise.
- Later: `/bot` is dynamic (root layout reads cookies); migrate root `globalPassThroughEnv` to `global.passThroughEnv`.
- 7a2 later: orphaned Better Auth users after purge; evidence/object pruning via `evidenceReferenced`; guarded forward proxy / undici `connect.lookup` (DNS rebinding, `route.fetch` buffering), POST->GET on sub-resource 30x, script redirects after DOMContentLoaded, WebRTC/preconnect unrouted.
- 7a2/7c: `app_user` INSERT on `client` can set service-only columns (WITH CHECK hardening); `notification.provider_id` index; `contact_bounced:<id>` dedupe is permanent (key by MessageID); sign-out/`/support/exit` end a session with no audit row; inbox + notification-settings pages read via service fns in support (unmasked?); platform overview sums keep archived agencies' daily-stat rows.
- 7a2/7c: Ask: pinned-admin test for `update_recommendation_status`; multi-agency user with a plan lacking Ask gets 404 for the other agency's client (Decision 4).
- 7a2/7c minors: T1 vacuous agency RLS update test; T3 support viewer gets the default plan, MCP tokens unrevocable in UI after a plan downgrade (revive on upgrade), `ask-support.test` mock re-implements `hasChannel`; T6 no quarterly PDF overwrite test; T7 no `support_view_pdf` subject kind, files audit tested only for evidence, sign-out/`/support/exit` fallback unaudited, notification settings page in support (consider `notFound()` like `/inbox`); T8 bounced contact looks inactive (`INACTIVE_OK_KINDS`; add `bounced_at`); owner Qs: T10 purge anonymises `platform_support` rows, T8 500 on handler errors.
- 7a2/7c: purge dry-run counts are not one snapshot, no test for a purged-client + agency-level membership; no tests for a retried pending row with future `not_before` or old accepted/unverified leads surviving; plan-off tests for agency `settings/ai` and evidence `canAsk`.
