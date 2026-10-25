# phase-7c2 — scale & pilot: concurrency, vendor limiter, capture pacing, due scans, readiness, rehearsal, feedback, PILOT.md

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-7c2   **Base:** main f275eee7
**Plan/spec:** [plan](../superpowers/plans/2026-10-23-phase-7c2-scale-pilot.md) · [spec](../superpowers/specs/2026-10-22-phase-7c-quality-scale-pilot-design.md) — owner-approved 2026-10-23. Runbook: [PILOT.md](../PILOT.md).

## Status (overwrite)
Built and reviewed (SDD, tasks 0-11 + 14): queue concurrency + pooled app URL (T1); per-vendor limiter + `timeoutMs` (T2); host-lock capture deferral + robots slot (T3); set-based due scans (T4); migration 0093 `ops_alert` + hardening (T5); brief readiness job/email (T6); `/platform/health` readiness panel + 7a health follow-ups (T7); security test backfill (T8); rehearsal switches refused in prod + crawl allowlist (T9a); fixture vendors/hosts + DEPLOY § Staging (T9b); rehearsal AI (T10a) and `rehearsal` CLI (T10b); feedback links (T11); docs (T14: PILOT.md, OPS § Queue concurrency / Ops alerts / Rehearsal / Internal QA, DEPLOY, gotchas, package notes).
**Pending, owner-gated, not run:** Task 12 (staging rehearsal + fix wave) and Task 13 (`cs_dev` rename, `jev.live`, `/link-other-account`). No rehearsal numbers exist yet; after Task 12 record final concurrency/limits and costs here and make them code defaults.

## Next (overwrite)
Controller: final whole-branch review + `test:affected`/`e2e:affected` (`--base main`), one fix wave. Owner: copy sign-off, staging setup (DEPLOY § Staging), then Tasks 12-13 (below). `/rm-merge` only with the owner's go-ahead.

## Interfaces this branch adds or changes
- **Migration `0093_ops_alert`:** `ops_alert` table (service-role only; `kind` in `brief_readiness`, `severity` in `warning|critical`, unique `dedupe_key`), `notification_provider_id_idx`, `REVOKE INSERT ON client FROM app_user`; `TABLE_CLASS` entry.
- **Env:** `SERVICE_DATABASE_POOLED_URL`, `WORKER_QUEUE_CONCURRENCY` (both in `turbo.json` `globalPassThroughEnv`); rehearsal-only `AI_PROVIDER_MODE`, `REHEARSAL_LIVE_CLIENT_IDS`, `VENDOR_FAKE_MODE`, `CRAWL_HOST_ALLOWLIST`, `FIXTURE_HOSTS`, `FIXTURE_LOG_TOKEN`.
- **Worker:** `concurrency.ts`, `job-list.ts` (`createJobList`), job `brief-readiness` (`25 * * * *`), CLI `fixture-hosts`; `runJob` opts `{ resend?, retryCount?, retryLimit?, cron? }`; `/healthz` body `queueGrants`; heartbeat output `{ queueGrants, rssMb, dbConnections, dbMaxConnections }`; `createDb(url, { max, prepare })`.
- **Libs:** `@cs/core/server` `createVendorLimiter`/`timedFetch`/`DEFAULT_VENDOR_LIMITS`; `@cs/collectors` `HostRateLimiter` (learned Crawl-delay), `renderOrDefer`, `allowlistedAssert`, `createFixtureFetch`; `@cs/engine` `findReadinessIssues`/`summarizeBriefReadiness`/`checkBriefReadiness`, `createRehearsalAi`; set-based `listBriefDueClients`.
- **Tools/UI:** `get_platform_health` gains `briefReadiness`; new `get_feedback_contact` (`ISOLATION_FIXTURES` entry). `@cs/demo` CLI `rehearsal`; email `platform_ops_alert`, `feedback` props on brief/alert, `AgencyWelcomeProps.supportEmail`.

## Assumes from other branches
Nothing unmerged. 7b2 and phase-16 do not overlap. Staging (owner) before Task 12.

## BACKLOG at merge (fold into `docs/BACKLOG.md`; this branch does not edit it)
**Close (delete) now:**
- Scale: "Worker concurrency: let `rival-search` …" · "`listBriefDueClients` scans every client …".
- Scale: shrink "Multiple worker replicas / autoscaling …" to the cross-replica parts (per-host politeness and vendor limits in Postgres, cron tolerance of a second runner); shrink "Cross-replica rate limiter before scaling the worker; one host's large Crawl-delay …" to "Cross-replica rate limiter before scaling the worker" (capture queue deferral and robots pacing are done).
- 7a follow-ups: "7c: `withQueueStatsReporting` … `EnvUrls.owner` -> `queue` …" · "7c: `ensureQueueGrants` is a single attempt …" · "7a2/7c: `app_user` INSERT on `client` … WITH CHECK; `notification.provider_id` index" (keep the `contact_bounced:<id>` dedupe, sign-out audit and inbox parts) · "7a2/7c: Ask: pinned-admin test …; plan-off …" · from "7a2/7c minors" the T1 and T3 items · from "7a2/7c: purge dry-run …" the three purge/lead test gaps and the `settings/ai` / evidence `canAsk` plan-off tests.
- After Task 13 runs: Model ops "Run `jev.live.test.ts` …" · Pilot "Exercise `/link-other-account` live" · Pilot "Review/rename/remove the `CS Dev Verification …`".
- After Task 12: "Staging setup before 7c2 Task 12 …" and the 7c2 part of "Sign off copy marked in the … plans".

**Add (new items):**
- Rehearsal AI fidelity: tested against one synthetic schema; real `ai.yaml` caller schemas (recJson, draftJson, tailor, starters `minItems 4`, numeric_facts, starting_point_why, theme discovery) may take fallback paths, so the rehearsal could load-test fallbacks. `minimalValue` ignores `pattern`/`format`; `collectBatch` in rehearsal throws a misleading `ANTHROPIC_API_KEY` error; latency floor at p50. — *7c2 T10a*
- `guardManifestRun` compares the strict hostname: pooler vs direct host is refused with no hint (documented in OPS); improve the message or compare the endpoint id. Fault-test alarm assertion loosened; rehearsal CLI wiring untested; "fx5 does not slow the others" is a lag proxy (retune after Task 12). — *7c2 T10b*
- Readiness: partial send failure re-emails all recipients next hour; `windowOpenedAt` is off 30/45 min in half-hour zones (US-only pilot); no Saturday/DST-weekend checkpoint test; `findReadinessIssues` reruns per page load; no `HelpTip` on the readiness section (needs owner copy); the section keeps the `card` wrapper until phase-16 migrates the page. — *7c2 T6/T7*
- Limiter/worker: "queued 5 s keeps full timeoutMs" test uses real timers; deps wiring test asserts `typeof` only; boss "throws on one poller" test does not attribute the poller; concurrency log lists only raised queues; idle pollers raise pg-boss direct connections (~57 to ~80: watch in Task 12). — *7c2 T1/T2*
- Captures: limiter cursor/last maps never pruned; captures queued before deploy lack the `capture:` singleton key (one-time duplicate); fixture `task_get` ledger rows carry `fx_` ids ($0); fixture-fetch abort listener not removed. — *7c2 T3/T9b*
- Tests: `tenant.test` "cannot write rows into another agency" now re-proves only the grant; `table-classes.ts` `ops_alert` out of alpha order and `OpsAlertSeverity` duplicates the CHECK list; `settings/ai` test name says "lacks mcp" (gate is `mcp`). — *7c2 T4/T5/T8*
- Feedback: mailto addresses not `encodeURI`d; brief page feedback test is one big `it`. — *7c2 T11*
- Worker heartbeat re-runs the `cs_web` queue GRANTs every beat; retry only while not ok. — *7c2 final review*
- Readiness: a resolved `starting_point_late` / weekly key never reopens, so a client unpaused late (same key) gets no new alert. — *7c2 final review*

## Owner verification steps
**Copy sign-off (all of it is unsigned; needed before the first invite):**
1. Ops alert email (`platform_ops_alert`): subjects `Rival Monday ops: {n} brief(s) not ready for {date}` / `… awaiting approval for {date}` / `Rival Monday ops: starting point late for {client}`; the four lead lines; "Open Health: {url}"; footer "Platform ops alert".
2. `/platform/health` readiness panel: section "Brief readiness"; "Briefs for Monday {date}"; counts Due / Ready / Approved / Sent / Missing / Failed / Awaiting approval / Starting points late; headers Severity / Issue / Delivery date / Clients / First seen / Email; chips Critical / Warning; weekly issues show " · {time zone}" after the name; failure line "Brief readiness unavailable — the readiness query failed; check the web logs."; checkpoint names "Not ready after generation closed", "Missing or failed before delivery", "Ready but not approved", "Starting point late"; "emailed {when}", "not emailed yet", "No readiness issues."
3. Feedback: client email "Something look off? Reply to this email or write to {name|your agency} at {email}."; in-app "Something look off? Email {name|your agency}." with mailto subject `Feedback: {client} — {page title}` (not in the plan; the implementer chose it); agency menu "Send feedback" (subject `Pilot feedback`); welcome line "Questions or feedback during the pilot? Email {supportEmail}. We read every message."
4. No help copy or guide exists for the readiness panel; a `HelpTip` and guide wait on this sign-off.

**Before Task 12:** staging per `docs/DEPLOY.md` § Staging (Neon `staging` branch, R2, Postmark test token, Vercel Preview, Railway worker + fixture-hosts, 5 CNAMEs). Approve costs (<= $5 live AI, ~$20 infra).
**Task 12 (controller with owner):** `docs/OPS.md` § Rehearsal steps 1-9; paste the report's PASS/FAIL lines here; fix wave per FAIL; final numbers become code defaults; `teardown`. Done when one run shows every PASS line including the fault alarm.
**Task 13 (owner):** (a) run the two rename `UPDATE`s on `cs_dev` (`docs/OPS.md` § Internal QA); (b) `pnpm --filter @cs/ai exec vitest run jev.live` with the real `TYPESAFE_API_KEY`, record whether Jev scores are 0- or 1-based; (c) `/link-other-account` once live (PILOT § 8). Results here; failures to BACKLOG.
**Before the first invite:** PILOT § 1 gate, including the prod tenant-check SQL.

## Notes for the merger
- `docs/STATE.md`: 7c2 done, rehearsal numbers once known, "Then, in order" (staging -> Tasks 12/13 -> live deploy -> pilot).
- `docs/ARCHITECTURE.md`: concurrency/limiter/deferral, readiness + `ops_alert`, rehearsal tooling, feedback tool.
- Correction to the Task 0 finding: ratings are `feedback.kind = 'rating'` with `after = { useful: boolean }` (not `{ rating }`); PILOT § 7 uses `useful`.

## Pre-flight findings (T0, still useful)
- 7b1 and 7c1 are merged; schedulers use `clientWorkAllowed` (not `clientServiceable`); `TABLE_CLASS` in `packages/db/test/table-classes.ts`, `ISOLATION_FIXTURES` in `packages/tools/src/isolation/fixtures.ts`.
- Cron payload `{ _cron: true }` is read from the raw job data (`kb-embed`/`kb-sync` schemas strip it).
- `SUPPORT_REPLY_TO` is env-only; worker constant `DEFAULT_SUPPORT_REPLY_TO` (`apps/worker/src/deps.ts`); web `webEnv().supportReplyTo`.
- Schedule constants: `engine/src/briefs/schedule.ts` (`BRIEF_LOCAL_WEEKDAY=4`, `BRIEF_LOCAL_HOUR=22`, `BRIEF_CATCHUP_UNTIL_HOUR=12`), `DELIVERY_LOCAL_HOUR=7`, `STARTING_POINT_WAIT_HOURS=48`.
- Rulings that changed the plan (full list in the SDD ledger): per-zone readiness keys `brief_readiness:<checkpoint>:<date>:<tz>`; a starting point whose Monday is held by a weekly brief is judged from Tuesday 00:00 local; the panel counts a client as due from Thu 22:00; learned per-host Crawl-delay; allowlist fails closed; `rehearsalEnvErrors` enforced in `createWorkerDeps`; stateless fixture DataForSEO ids; rehearsal weekly report lines cover weekly clients only.
