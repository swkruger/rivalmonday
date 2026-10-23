# phase-7-planning — brief for 7b (money) and 7c (scale & pilot)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-7-planning   **Base:** main @ d7d42e47
**Plan/spec:** none yet. Inputs: roadmap row 7, [phase-7-scope.md](phase-7-scope.md).

## Status (overwrite)
Brief written 2026-10-22; questions await the owner.

## Next (overwrite)
Owner answers 7b Q1 / 7c Q1 (split), then `superpowers:brainstorming` on 7b; 7c after or in parallel.

## Interfaces this branch adds or changes
None yet (next free migration on main: **0085**).

## Assumes from other branches
Brief § In-flight.

## Decisions (owner-approved)
None new; see Brief § Binding.

## New backlog (target → item) / Owner verification steps
None.

---

# Brief

## Binding decisions (never re-open)
- Old phase-7 owner decisions (`git show a12f4ab6:docs/work/phase-7.md`): O1 7a → 7b → 7c, 7b may start any time; **O10 client at 100 % of cap = warn only**; **O11 shared collection cost split evenly across active trackers**; O13 Ask/MCP plan flags (built); **O14 more concurrency in one worker, one replica**; **O15 eval sets at §12 sizes, LLM pre-labelled, owner confirms**; **O16 pilot runbook on existing screens, rename dev agency/client**.
- 7a spec §10: cap pausing → 7b. Parked 7a spec §6: 7b breakers + rate limits; 7c isolation suite, golden fixtures, evals, E2E incl. Ask, MCP contract, Jev live test, `/link-other-account`, pilot runbook; 7a D2 dropped `WORKER_ROLES` ("7c revisits").
- 9a e11: flat pricing, caps are internal cost guards (enforced in 7b). Root CLAUDE.md: one worker replica, review decisions on Jev, τ 0.85, rival search $3/run, Scan-now limits, paused clients get no recurring work.

## 7b — Money

**Scope.** Roadmap row 7 "budget caps & circuit breakers". §11 Budgets (per-client monthly cap, 80 % warn, per-vendor circuit breakers; 100 % pause overridden by O10); §7.5 every call ledgered with agency + client, feeding usage UI and caps; §10.6 metering/limits; §1.4 ≤ $15 technical cost per client/month.

**Already built — reuse.**
- Ledger `packages/db/src/schema/ledger.ts` (`llm_call`/`vendor_call`; `cost_usd` `doublePrecision`; `client_id` nullable; no competitor key); `packages/db/src/spend.ts` (`spendByClient`, `monthStart`).
- Caps: `client.monthly_cap_usd`/`competitor_limit`/`ask_monthly_quota`; `packages/tools/src/limits.ts` (cap $15, warn 0.8, search/scan limits); `packages/tools/src/usage.ts` (`spendLevel`, `agencyLevelSpend`); `tools/usage.ts`; page `agency/settings/usage/`. Enforced today: Ask quota `packages/ask/src/quota.ts`, $0.30 Ask turn budget, rank-scan cap `collectors/src/rankings/budget.ts`, MCP rate window `packages/mcp/src/rate-limit.ts`. No 80 % notice exists.
- 8c `/platform/costs` (`platform_cost_*`, `platform-costs-snapshot`); 7a1 `tools/platform-health.ts` (vendor error rates; home for a Breakers panel).
- `packages/billing` (gateway, 9a state machine, `runBillingDaily`, 9b Connect); `tools/client-billing.ts`, `tools/platform-billing.ts`, `access/signup-complete.ts` (`couponFor`); `parseWebEnv` refuses `BILLING_FAKE_GATEWAY` only on `VERCEL_ENV=production`.

**Backlog to fold in (open, verbatim).**
- [ ] Enforce caps (pause Ask/jobs at 100 %) and allocate shared collection cost to clients — *from 5b-2 (decision 18)* (pause part superseded by O10)
- [ ] Prospect snapshots: add a cooldown (≈ $0.10–0.15 per re-run) and attribute GBP/ads pulls to the prospect (usage page under-reports) — *from 5b-2 final review Minor 3*
- [ ] Switch `cost_usd` (`packages/db/src/schema/ledger.ts`, `doublePrecision`) to `numeric` before real spend data — *from Phase 1 review*
- [ ] 7b: Ask turn deadline: a true AbortSignal through `chatWithTools` (today 90 s soft deadline, 45 s final-call reserve, route `maxDuration` 300) — *from 7a*
- Phase 9 › Soon, all six open: `disable_client_billing` in-tx re-check (*9b R27*); reconcile doesn't lift `paused_by='auto'` (*9b M3*); billing page after "turn off" + currency (*9b M4*); second live subscription → agency notice (*9b M8*); auto-refresh after every Stripe round trip (*owner 2026-10-16*); `BILLING_FAKE_GATEWAY` on preview/worker (*9a re-review*).
- Scope-list items still open: `couponFor`/`redeem_discount_code` ignore `max_redemptions` (*phase-10, 9a*); PDF render re-enqueued hourly 7 d (*4b*); move recs retry nightly, no backoff (*4a*); Anthropic batch submit before `model_batch` insert, non-idempotent apply (*3d, 4a*). Owner: confirm Jev pricing placeholder before caps use it.

## 7c — Scale & pilot

**Scope.** Roadmap row 7: eval sets in CI, isolation suite across all tools, E2E, pilot onboarding. §12: every tool × wrong agency/client refuses + RLS in Postgres; golden diff fixtures; evals ~300 changes / ~200 reviews / ~50 briefs / ~50 Ask (injection, cross-tenant); E2E incl. Ask; MCP contract (OAuth, `search`/`fetch`). §1.4 8-week pilot, 10–15 clients, seven metrics. §11 resilience.

**Already built — reuse.** Local test cluster, `test:affected`/`e2e:affected` (`apps/web/scripts/e2e-affected-rules.ts`); 26 specs in `apps/web/e2e/` (`ask`, `security`); `packages/db/src/*-rls.test.ts`, `tenant.test.ts`; per-tool cross-tenant tests in `packages/tools` (no registry-wide suite); `packages/mcp/src/integration.test.ts`; `packages/engine/test/fixtures/web`, `fake-ai.ts`. Model ops: `decision_sample`, `decisions` CLI, `engine/src/model-ops/report.ts` (accuracy/ECE), `jev.live.test.ts`; no eval harness/datasets. Worker `apps/worker/src/boss.ts` (`boss.work`, no `localConcurrency`), `health.ts`, `sentry.ts` (`withQueueStatsReporting`, `withMonitor`), `queue-grants.ts`; in-memory `HostRateLimiter` (`collectors/src/web/rate-limit.ts`). Ops: `OPS.md`, `DEPLOY.md`.

**Backlog to fold in (open, verbatim).**
- [ ] Worker concurrency: let `rival-search` (vendor-bound) run 3–5 jobs at once inside the single worker (pg-boss local concurrency), then shorten `RIVAL_MONTHLY_SPACING_SECONDS` — *from owner Q 2026-10-15*
- [ ] Cross-replica rate limiter before scaling the worker; one host's large Crawl-delay blocks the single sequential capture queue; robots.txt fetch isn't paced by the limiter — *from 2a review* (in-process parts only, O14)
- [ ] `listBriefDueClients` scans every client with one lookup each — set-based query — *from 4a cross-phase*
- [ ] Flaky Neon connections in tests; one un-bisected `@cs/collectors` full-suite failure — *from 5c-2 / demo runs*
- [ ] MCP tests: cross-agency, P18 scoped member, review cross-client leak, page-level `/sign-in` OAuth, exact client-role `tools/list` — *from 6a*
- [ ] ANN vector index (events, pages, `kb_chunk`) — *from 6a/6c*
- [ ] `jev.live.test.ts` with a real key — *Phase 1*; `/link-other-account` live — *5a*; rename/remove `CS Dev Verification Agency`/`Client` — *HANDOVER §5*
- BACKLOG § 7a follow-ups tagged 7c (cited, not copied): embeddings batch; queue stats/`withMonitor`; `ensureQueueGrants`; logging; predeploy tests; `scrubUrl`; WITH CHECK, `provider_id` index; Ask/T1–T8/purge tests. Replicas stay out (O14).

**Already closed (7a):** tier gating `ask`/`mcp`, MCP `manage` for `client_owner`, object-store no-overwrite, `cs_worker`/`cs_web`, Postmark bounces, archival/purge, leads 180 d, stale outbox, AI `request_path` timeouts, Ask allowlist + turn budget, SSRF guard, PG18 + `drizzle-kit check`, Vercel tracing, edge-safe `@cs/core`, `agentGuidance: false`; page latency now = Launch-gate item.

## In-flight and overlaps
- **`phase-15c`** (15c-1 folded, awaiting verification/merge, no migrations): `lib/format/money.ts` replaces billing money helpers; touches usage page, `/platform/costs`, `/platform/health` tables, billing pages; adds `reportError`, `StatusChip`/`ConfirmDialog`/`SaveBar`. 7b UI builds on these.
- **15c-2** (planned): `/platform/billing` tabs, cap notice on Alert review, maybe `ask_thread.deleted_at`.
- **15c-3** (planned): migration `agency.suspended_*`; `billingAccess.onHold`, `agencyServiceable`, `syncSeats`/`daily.ts` skip held, `BillingGateway.pauseCollection`, archive tool — overlaps 7b billing (M3 in `daily.ts`, gateway).
- **15b-3b** (planned): tool renames (`get_theme_benchmark`, `search_reviews.themeId`), `/platform/topics` — affects isolation/MCP `tools/list`/Ask evals.
- **13a** (unbuilt): 2 migrations, worker `main.ts`/`deps.ts`, `turbo.json`, tools `all`/`schemas`, E2E seed, `mcp.<neutral>` host, Stripe product name P23.
- No numbers claimed; 15c-3 (1), 13a (2), 15c-2 (0–1), 7b (≥ 1) all take next free at execution.

## Open questions for the owner

### 7b
1. **Split?** (a) one plan; (b) **7b1 cost guards** (numeric cost, allocation, cap notices, breakers, prospect cooldown, backoff leaks, Ask AbortSignal) + **7b2 billing correctness** (Phase 9 Soon + `max_redemptions`); (c) cost guards only, billing to a later fixes batch. *Rec: (b); 7b2 after 15c-3 (shares `daily.ts`, gateway).*
2. **"Enforcement" under O10 (warn only).** (a) notices only: 80 %/100 % email + banner to agency admins; (b) (a) + refuse on-demand paid actions over cap (Scan now already does; add manual rival search, prospect re-snapshot); (c) (b) + skip non-essential recurring jobs. *Rec: (b); (c) contradicts O10.*
3. **Cap levels.** (a) client only; (b) client + platform per-vendor breakers and a daily platform spend ceiling (hard, operator reset); (c) + agency monthly ceiling. *Rec: (b); (c) clashes with flat pricing (e11).*
4. **O11 allocation mechanics.** (a) competitor/source key on ledger rows, split at read time over that month's active trackers; (b) per-client rows at call time; (c) nightly allocation table. *Rec: (a).*
5. **Breaker trigger.** (a) error rate; (b) spend rate per vendor/hour; (c) both, state in a DB table on `/platform/health`. *Rec: (c).*
6. **`numeric` timing.** (a) first 7b task, before 7a1 Task 12 if possible (fresh prod DB); (b) whenever 7b lands. *Rec: (a).*
7. **Phase 9 Soon here?** (a) all six + `max_redemptions` in 7b2; (b) correctness (R27, M3, M8, fake gateway, `max_redemptions`) in 7b2, UI (M4, auto-refresh) to 15c-2; (c) leave in Phase 9. *Rec: (b).*
8. **Retry/backoff leaks** (PDF, move recs, Anthropic batch). (a) 7b1; (b) 7c2. *Rec: (a).*

### 7c
1. **Split?** (a) one plan; (b) **7c1 quality gates** (isolation suite, RLS sweep, MCP contract, E2E Ask, eval harness + sets) + **7c2 scale & pilot** (concurrency, limiter, `listBriefDueClients`, 7a follow-ups, pilot runbook, dev rename); (c) 7c1 isolation + scale, 7c2 evals + pilot. *Rec: (b); 7c1 can run parallel to 7b.*
2. **Eval CI cadence.** (a) every push, live models; (b) live only on `ai.yaml`/prompt/model changes (path filter, §12) + manual/nightly, recorded replies every push; (c) manual CLI only. *Rec: (b).*
3. **Eval data.** (a) real `cs_dev` only (thin); (b) real + golden HTML pairs + synthetic dental top-up, redacted JSONL in repo; (c) synthetic only. *Rec: (b).*
4. **Eval gating.** (a) all metrics block; (b) block on zero unsupported claims, zero cross-tenant leaks, injection; accuracy report-only until pilot labels; (c) report-only. *Rec: (b).*
5. **Isolation suite.** (a) one generated test over every registered tool (fixture map; new tool without one fails) × wrong agency/client/scoped member + FORCE-RLS table sweep; (b) extend per-domain tests; (c) MCP probes only. *Rec: (a).*
6. **Concurrency in one worker.** (a) `rival-search` 3–5 only; (b) per-queue `localConcurrency` for vendor-bound queues + in-process per-vendor token bucket; captures parallel across hosts, serial per host, robots paced; (c) + DB-backed limiter now. *Rec: (b).*
7. **Pilot runbook + §1.4 metrics.** (a) `docs/PILOT.md` on existing screens, metrics via documented SQL; (b) + operator pilot-metrics view; (c) runbook only. *Rec: (a).*
8. **Ordering.** (a) Launch gate stays a standalone fix before 7a1 Task 12; 7c1 before the first real pilot agency; runbook after live deploy; (b) Launch gate into 7c2; (c) all 7c after live deploy. *Rec: (a).*
9. **7a follow-ups tagged 7c.** (a) all; (b) health-affecting (`ensureQueueGrants`, `withMonitor`, queue stats, WITH CHECK, `provider_id` index) + missing security tests, rest fold-in-when-touching; (c) none. *Rec: (b).*
10. **ANN index.** (a) 7c2; (b) when pilot volume shows slow search. *Rec: (b).*
