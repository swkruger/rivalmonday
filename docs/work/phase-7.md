# phase-7 — Launch readiness (7a production & security, 7b money, 7c scale & pilot)

**Kind:** implementation (7a1)   **Worktree:** ../CompetitorSpy-wt/phase-7   **Base:** main @ b38e36ba
**Plan/spec:** [7a spec](../superpowers/specs/2026-10-19-phase-7a-launch-production-security-design.md) (supersedes the parked 2026-10-12 spec); plans [7a1](../superpowers/plans/2026-10-19-phase-7a1-deploy-observability.md), [7a2](../superpowers/plans/2026-10-19-phase-7a2-security-data-lifecycle.md). Item lists: [phase-7-scope.md](phase-7-scope.md).

## Status (overwrite)
2026-10-20: 7a1 Tasks 0-11 built (SDD, each reviewed). **Task 12 (live deploy) waits on the owner's prod accounts (O17)** and on the shell-DB-stages gate (backlog, after 15b merges). 7a2 next (needs `@cs/core/server`). Own test DB `cs_phase_7_test`. Pre-flight findings and the original brief: `git show 67082736:docs/work/phase-7.md` and the plan files.

## Next (overwrite)
1. Owner: prod accounts (O17); create `cs_worker`/`cs_web` on Neon dev (below) before `0080` reaches `cs_dev`.
2. After 15b merges: rebase, renumber `0080` if needed, fix shell DB stages, then Task 12.
3. 7a2 via SDD; 7b brainstorming may start any time (O1).

## Interfaces this branch adds or changes
- **Migrations:** `0080_runtime_roles` (phase-15b also has `0080_kb_help_key`; whichever merges second renumbers, `packages/db/CLAUDE.md`). 7a2 `0081_lifecycle`.
- **Code:** `@cs/core/server` (Node-only logging/redaction; Edge-safe root stays), tool `get_platform_health` (`queueError`), pages `/platform/health`, `/bot`, `/robots.txt`, worker `/healthz` (`PORT`), `REQUIRED_PROD_ENV` (`apps/worker/src/env.ts`), `pnpm --filter @cs/web profile:pages`, `CallTiming` + AI `request_path` tasks (new `runbook_retailor`), `predeploy-check`, `ensureQueueGrants`, `docs/DEPLOY.md`, worker Dockerfile + `railway.json`.

## Owner verification steps
Before migrating `cs_dev` to 0080: in the Neon SQL editor **as the owner role** run `CREATE ROLE cs_worker LOGIN PASSWORD '...'; CREATE ROLE cs_web LOGIN PASSWORD '...';` (not the console "add role").
At first deploy (`docs/DEPLOY.md`):
1. `https://rivalmonday.app` serves with TLS; magic-link sign-in arrives from `briefs@mail.rivalmonday.app`; mail-tester >= 9/10.
2. A Sentry test event arrives from web and worker (worker release = commit SHA, not `dev`).
3. Railway marks the deployment Active; `/healthz` 200; `/platform/health` all green after one hour.
4. `/bot` and `/robots.txt` load signed-out; then set `WEB_MONITORING_ENABLED=true` (last step).
5. Latency: `profile:pages --base https://rivalmonday.app --cookie FILE`: agency/workspace pages p75 <= 1.5 s, every page <= 3 s; misses become backlog.
6. Run `pnpm kb:seed` against prod.

## Assumes from other branches
- **phase-14b — merged** (b38e36ba): `llm_call.vertical_id` (0078) — 7b `cost_usd → numeric` must follow it; new tools are in the isolation suite's scope; `E2E_PORT`.
- **phase-15b** (in progress): `0080_kb_help_key`, `packages/core/src/help/*` + one `index.ts` export (must stay Edge-safe for 7a1 Task 1).
- **13a** (plan approved on main, not started): `apps/web/src/proxy.ts` (host resolution, `/health` on any host), per-origin Better Auth (`auth.ts`, `authFor`), `senderFor`/`platformFrom` + per-agency Postmark domains (overlaps 7a Postmark webhooks + email env), `NEUTRAL_DOMAIN`/`VERCEL_*`/`POSTMARK_ACCOUNT_TOKEN` env, error pages, P22 titles, P23 Stripe name, `turbo.json`. Needs a Vercel project + wildcard → 7a deploy precedes 13a live.
- **15c** (not started): error/404 pages overlap 13a + 7a error reporting.

## Decisions (owner-approved)
Owner 2026-10-19 (brief Q1–Q17):
1. Order 7a → 7b → 7c; 7b may start once the 7a spec is approved.
2. 7a ‖ 13a with split files (7a: CI, Docker, tracing, logging, DB roles; 13a: proxy, auth host, email sender). White-label sign-in/tab titles leave 7a. 7a deploy before 13a's live-domain step.
3. Hosting: Vercel iad1 + Railway worker + separate Neon prod; prod + local only; deploy job migrates then deploys.
4. Canonical domain rivalmonday.app (crawler UA, /bot, sender, CLAUDE.md).
5. Observability: Sentry (web + worker) + pino JSON logs + operator /platform/health.
6. DB roles cs_worker + cs_web, explicit grants incl. pgboss; no owner URL in prod.
7. archived_at on agency/client + operator purge CLI after N days; evidence kept while referenced.
8. Unactioned verified leads: PII deleted after 180 days.
9. Postmark hard bounce/complaint → contact deactivated + agency notified; soft bounces ignored.
10. Client at 100% of cap: **warn only** (no pausing) — owner override of the recommendation.
11. Shared collection cost split evenly across active clients tracking the competitor.
12. Queued notifications older than 7 days on reactivation are skipped.
13. Ask/MCP per-plan flag, all on during the pilot.
14. Worker: more concurrency in one worker; one-replica rule stays; Postgres rate limits designed for later.
15. Eval sets at spec §12 sizes, LLM pre-labelled, owner confirms.
16. Pilot: runbook/checklist on existing screens; rename the dev agency/client to a demo name.
17. Owner sets up prod accounts (Vercel, Railway, Neon prod, R2, Postmark + DNS, Sentry, live Stripe/Turnstile, /bot) before 7a's final deploy task; code built against fakes.
18. 7a split into 7a1 (deploy/observability/roles) and 7a2 (security/data lifecycle); purge 90 d after archive.
19. 7a1 + 7a2 plans approved incl. /bot copy (parked §3.5) and new env vars (Sentry, POSTMARK_WEBHOOK_SECRET, LOG_LEVEL, deploy secrets).

## New backlog (target -> item)
- **High, pre-Task-12 gate (after 15b merges):** shell DB stages — (app) shell ~12 sequential stages/page (max 22), (platform) 19-20 (`list_platform_costs` per-snapshot-row queries); target `--assert-db-stages 8`; also time the Better Auth pg pool and profile ask/[threadId], reports/[reportId], kb/[id].
- 7b: Ask turn total (multi-call loop) is not bounded by the per-call timing budget.
- 7a2: `log.ts` `wrap()` does not redact the message string (emails in text reach logs); `Sentry.captureException(raw pg error)` skips `redactForLog` (beforeSend still redacts); `redactForLog` drops custom Error fields (e.g. `ToolError.code`, by design).
- 7a2: `scrubUrl` guard skips lowercase/prefixed transaction names, `ws:` URLs, leading whitespace; `tagRequest` only via `callTool`.
- 7c: `ensureQueueGrants` is a single attempt and its failure is not in health state (web enqueues refused until restart while `/healthz` stays green).
- 7c: structured logging — many sites interpolate `JSON.stringify` in messages; `redactForLog` over whole Sentry events may strip keys `text/content/body/output`; `tracesSampleRate` hard-coded 0.1; `initWorkerSentry` not via `--import`; `main.ts` order/shutdown untested.
- 7c: tests — predeploy missing/wrong-typed thresholds untested; `ci.yml` edits do not trigger the shape test under `test:affected` and the order test skips `vercel pull -> build -> deploy`; `prettyAvailable()` called twice and e2e "destination stream closed early" noise.
- Later: `/bot` is dynamic, not static (root layout reads cookies); anthropic batch variant carries unused timing fields and `CallTiming` lives in `config.ts`; migrate root `globalPassThroughEnv` to `global.passThroughEnv`; fold parked 7a spec 3.4 note (tool name, `ageS`/`errorRate24h`, spend stale vs Decision 7) at wrap-up.
- Closed: the 0025 pre-check and magic-link cutover notes are covered by `docs/DEPLOY.md` Notes.

