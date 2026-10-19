# phase-7 — Launch readiness (7a production & security, 7b money, 7c scale & pilot)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-7   **Base:** main @ f1ec9683
**Plan/spec:** [7a spec](../superpowers/specs/2026-10-19-phase-7a-launch-production-security-design.md) (supersedes the parked 2026-10-12 spec); plans [7a1](../superpowers/plans/2026-10-19-phase-7a1-deploy-observability.md), [7a2](../superpowers/plans/2026-10-19-phase-7a2-security-data-lifecycle.md). Item lists: [phase-7-scope.md](phase-7-scope.md).

## Status (overwrite)
2026-10-19: 7a spec + 7a1/7a2 plans owner-approved. 7a2 execution started (implementation worktree); 7a1 waits for phase-14b merge (pre-flight rebase), its live deploy for owner accounts.

## Next (overwrite)
Owner approves the 7a1 + 7a2 plans (incl. `/bot` copy, new env vars `SENTRY_*`/`NEXT_PUBLIC_SENTRY_DSN`/`LOG_LEVEL`/`POSTMARK_WEBHOOK_SECRET`, and creating `cs_worker`/`cs_web` on Neon dev before migration 0080) → `superpowers:subagent-driven-development` for 7a1, then 7a2. 7a1 Task 12 (live deploy) waits for O17 accounts. 7b brainstorming may start (O1).

## Interfaces this branch adds or changes
None yet. Migrations: main ends `0076`; `phase-14b` holds `0077`–`0079`; 13a claims 4 at execution. **Phase 7 starts at `0080`** if it lands after 14b and before 13a; claim at pre-flight (7a1 `runtime_roles`, 7a2 `lifecycle`). **phase-15b** (planning) may also claim one after 14b.

## Assumes from other branches
- **phase-14b** (not rebased on 15a): `packages/db/src/schema/ledger.ts` (`llm_call.vertical_id`, 0078) — 7b `cost_usd → numeric` must follow it; `platform-costs.ts` (`aiByVertical`); new worker jobs (`runbook-tailor`, catalogue) + `QueueJob`, `apps/worker/src/main.ts`, `deps.ts`; `ai.yaml` (`runbook_tailor`); `packages/verticals` packs become seed + fixtures (7a file tracing); new tools (isolation suite must cover); `E2E_PORT`.
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
19. 7a1 + 7a2 plans approved incl. /bot copy (parked §3.5) and new env vars (Sentry, POSTMARK_WEBHOOK_SECRET, LOG_LEVEL, deploy secrets).
18. 7a split into 7a1 (deploy/observability/roles) and 7a2 (security/data lifecycle); purge 90 d after archive.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope (lists: [phase-7-scope.md](phase-7-scope.md))
- **7a** (core §10.2, §11, §4.5, §9.4, §8.3–8.4): deploy blockers + first prod deploy, observability, least-privilege DB roles, renderer SSRF guard, Ask/MCP scope + hardening, Postmark bounces, soft-delete + evidence retention, lead PII cap, stale-outbox cap, support-audit gaps.
- **7b** (core §11 budgets, §7.5, §10.6): six Phase 9 "Soon" items, cap enforcement + shared-cost allocation, prospect cooldown, `numeric` cost, retry backoff, `max_redemptions`.
- **7c** (core §12, §1.4, roadmap row 7): worker concurrency + multi-replica safety, flaky tests, AI evals in CI, tenant-isolation suite, MCP contract, pilot runbook, dev agency rename.

### 2. Already built — reuse; parked-plan drift
- MCP lives in `apps/web` (`app/mcp`) → one Vercel project. `/api/ask/turn` has `maxDuration=120` (parked plan assumed a 50 s budget).
- Health: placeholder `app/(platform)/platform/health/page.tsx` (8a; parked path `(app)/…` stale); web `app/health/route.ts`; operators = `platform_admin` + `requirePlatformOperator(deps, ctx, min?)`.
- Spend: 8c `/platform/costs` snapshots; ledgers `vendor_call`/`llm_call`; `tools/src/limits.ts`, `usage.ts` (Ask quota); rank scans already cap-checked (`collectors/src/rankings/budget.ts`); $3 discovery cap.
- Deploy: `ci.yml`/`docker-compose.yml` still `pg16` (test cluster PG18); no Dockerfile/Sentry/pino/`instrumentation.ts`; 32 worker files use `console.*`; ~28 crons (redo parked job→role table); `proxy.ts` runs on Node → Edge item = a "no `runtime='edge'`" guard.
- Security: `tools/src/kb/public-url.ts`; 4b webhook allowlist; `infra/db/init/01-roles.sql`; `apps/web/src/server/queue.ts`.
- Leads: `apps/worker/src/jobs/leads.ts` deletes declined/expired after 90 d; only undecided verified leads are uncapped.
- Billing: fake gateway refused only for `VERCEL_ENV=production` (`web/src/server/env.ts:59`).
- 15a: `{page} · {displayName}` titles, `authBranding()`, `mcpServerName()`, `white-label-leak.test.tsx`.
- Email: `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM` exist; parked `EMAIL_ALERTS_FROM`/`EMAIL_REPLY_TO` must fit 13a `senderFor`.
- `collectors/src/web/user-agent.ts` + root CLAUDE.md still say `rivalmonday.com/bot` (parked D3: `.app`).

### 3. Binding decisions (never reopen)
Root CLAUDE.md Decisions + Essentials (stack, one worker, Better Auth, Phase 9 billing, $3 discovery, τ 0.85/Jev, crawler conduct, no Rival Monday client-facing, 404s, `runTool`, `redactForModel`, never edit migrations/`REVIEWER_HASH_SALT`); 13a D1–D7; 7a parked: pg-boss crons only.

### 4. Backlog to fold in
Verbatim per sub-phase in [phase-7-scope.md](phase-7-scope.md).

### 5. In-flight workstreams
`git branch --no-merged main`: **phase-14b** (only one besides phase-7/-planning) — 187 files, migrations 0077–0079, overlaps above. **13a** not started (plan on main). Overlap with 7a white-label items: tab titles done by 15a, sign-in branding = 13a Task 5 → drop both from 7a.

### 6. Open questions for the owner
All answered 2026-10-19 → Decisions 1–18 above (question text: `git show 67082736:docs/work/phase-7.md`).
