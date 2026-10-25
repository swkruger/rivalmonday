# Rival Monday — Dev environment runbook

What is built: [ARCHITECTURE.md](ARCHITECTURE.md). All commands run from the repo root.

## Databases (Neon)

| DB | Use |
|---|---|
| `cs_dev` | Live dev data (real vendor pulls for Aire Serv; the Internal QA fixture below). Owner verification runs here. Run `pnpm db:migrate` if it is behind. |
| `cs_test` | Test suites. Snapshot restore never targets a `_test` database. |
| `cs_demo` | Fictional HVAC/plumbing demo data, rebuilt by `pnpm demo:reset`. |

After migration `0084` (15b-3a topic rename): run `pnpm --filter @cs/db migrate`, then `pnpm --filter @cs/db topic-leftovers` against `cs_dev`; it prints nothing when the rename has fully landed (exit 1 and the table list otherwise).
- Pre-check before migrating `cs_dev`: `SELECT v.id, t->>'id' FROM vertical v, jsonb_array_elements(CASE WHEN jsonb_typeof(v.config->'themes') = 'array' THEN v.config->'themes' ELSE '[]' END) t WHERE t->>'id' IN ('fix_theme','theme_weakness','theme_strength');` must return no rows (a topic with such a literal id would be rewritten).
- Order: stop the worker, migrate, deploy web + worker together, then run `topic-leftovers`. The backfill blocks are idempotent; re-run the migration's SQL if an old worker wrote old-shape rows.

After 15b-3b (migrations `generic_topic_id` and `review_checked_at`, next free numbers): same order (stop worker, `pnpm --filter @cs/db migrate`, deploy web + worker), then `pnpm --filter @cs/db topic-leftovers` (prints nothing) and `pnpm kb:seed` (drops the old `page:platform.themes` row).
- Expect a one-off re-ask wave: 0084 bumped `vertical.updated_at`, so about 1,375 reviews on `cs_dev` are re-asked once (`[engine-reask]` log lines, Jev first), capped at 2,000 reviews/day (`REASK_DAILY_MAX`), about 0.7 day.
- Watch it: `SELECT count(DISTINCT review_id) FROM review_analysis WHERE checked_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`; `llm_call` rows with `task = 'review_decisions'` have `vertical_id` and no `client_id`.

## Internal QA Agency / Client (`cs_dev`)

Renamed from `CS Dev Verification Agency` / `Client` (7c2 Task 13, owner-run once with the owner URL; the old names persist in the database until it ran):
```sql
UPDATE agency SET name = 'Internal QA Agency' WHERE id = 'aaf5e009-974b-4ce8-b7ec-b722c5c66b1c' AND name = 'CS Dev Verification Agency';
UPDATE client SET name = 'Internal QA Client' WHERE id = '25f99947-4559-4150-ab5d-dd432540aca0' AND name = 'CS Dev Verification Client';
```
The ids never change. Prod must never contain them (PILOT § Gate).

- Agency `Internal QA Agency` — id `aaf5e009-974b-4ce8-b7ec-b722c5c66b1c`.
- Client `Internal QA Client` — id `25f99947-4559-4150-ab5d-dd432540aca0`, `vertical_id: hvac_plumbing`. Has a place id and a linked self business (set 2026-10-06). Tracks `aireserv.com` (competitor id `e9f9cbd3-8834-43a4-a1af-a31224ca43d3`) plus the competitors accepted during 5b-1 verification.
- Aire Serv sources: place `ChIJ6VlKPHqPT4YR479jLd01gZY`; Meta page Aire Serv of Granbury `1825453601028298`; Google advertisers `AR11447192921745391617` and `AR09867956064303972353`. **Not** `AR16031097081657556993` (Iowa City franchisee, unpinned on 2026-10-11 and its 3 ads retired).
- Data: vendor collection only, no `web`-source captures, so `price_point` is empty and Pricing shows "website monitoring isn't switched on". 98 gold labels for review decisions. No live stored standard brief yet. Still no real alerts. Real competitor changes are expected from the weekly pull of 2026-10-13. The brief `0612e32a-…` had its `pdf_key` cleared on 2026-10-11, so it re-renders on next open.
- The owner signs in as `agency_admin` of the agency through a file-outbox magic link. There is no "view as client" switch. To see the client-owner view, invite an address at Agency → Team → Invite (role Client owner) and sign in as that address.
- This agency and client are verification fixtures with clear names; they exist only in `cs_dev`.

## Re-pull Aire Serv (on or after 2026-10-08)

```
pnpm --filter @cs/worker collect-once --domain aireserv.com --place-id ChIJ6VlKPHqPT4YR479jLd01gZY --meta-page-id 1825453601028298 --google-advertiser-id AR11447192921745391617 --google-advertiser-id AR09867956064303972353 --vendors
```
Then run it again with `--poll`. Budget about 45 minutes; the 2026-10-02 run was ready in about 12. Compare `review_id`s for stability. It also gives the structured engine a second capture to diff. Then:
```
pnpm --filter @cs/worker engine-once --client 25f99947-4559-4150-ab5d-dd432540aca0 --moves
pnpm --filter @cs/worker brief-once --client 25f99947-4559-4150-ab5d-dd432540aca0 --force
```
`brief-once` should store the first live standard brief. Other `engine-once` flags: `--insights`, `--competitor`, `--rounds`. `brief-once` also accepts `--now <iso>`.

## Runbook backfill (Phase 14b)

After migrating `0079` on `cs_dev` and on prod, and before the next brief run, once per database:
```
pnpm --filter @cs/worker runbook:backfill --dry-run
pnpm --filter @cs/worker runbook:backfill
```
Creates the platform runbook, one per agency, and for every client (all statuses) a client runbook that reproduces what it sees today (pack plays with `playbook_override`s applied, self-rules; a custom thresholds setting becomes a customised `knob:thresholds` item and `client.score_thresholds` keeps its value; clients without one get no thresholds item and follow the agency), with `tailor_status = 'skipped'`. Idempotent; leaves `playbook_override` alone. New agencies get theirs at sign-up and via `admin create-agency`.

After the backfill nothing calls the model: backfilled clients stay `skipped`. A new client's runbook is created (and tailored by the `runbook-tailor` worker job, one OpenRouter call) when the setup wizard advances (`advance_client_setup`) or an agency admin uses "Create a runbook for this client"; `runbook.tailor_status` is `pending` / `done` / `failed` / `skipped` (a failed run leaves the agency runbook copy, editable). Check a client with `select tailor_status from runbook where client_id = '<id>'`. To roll back before dropping `playbook_override`, delete the client/agency runbook rows: clients fall back to the legacy view.

## Queue concurrency (7c2)
One worker replica runs several pollers per queue (shipped table: `apps/worker/src/concurrency.ts` `QUEUE_CONCURRENCY`: `rival-search`, `vendor-collect`, `brief-client`, `web-capture-page` 4; `starting-point-client`, `engine-tag`, `engine-review` 3; `prospect-snapshot`, `rank-scan`, `setup-suggestions`, `runbook-tailor`, `rival-monthly-client` 2; the rest 1). Override without a code change: env `WORKER_QUEUE_CONCURRENCY=brief-client=6,rival-search=2` (comma list, `<queue>=<1-8>`; entries win over the table). A malformed entry, an unknown queue name or a value outside 1-8 makes the worker print the entry and exit 1 before it starts. Unset = shipped values. Tune from `/platform/health` (heartbeat output carries `rssMb`, `dbConnections`, `dbMaxConnections`) and Railway memory:
- DB connections near the limit: lower concurrency, and check `SERVICE_DATABASE_POOLED_URL` is set (start-up warns when it is not). App pool size = sum of (c - 1) + 10.
- Memory high: lower `web-capture-page` (each poller is one Chromium context in the single shared browser).
- Vendor throttling or timeouts: lower `vendor-collect`/`rival-search`; per-vendor limits are `DEFAULT_VENDOR_LIMITS` in `packages/core/src/server/token-bucket.ts` (code change).
Lowering the busy queues to 1 is the pilot kill switch (PILOT § Kill switches).

## Ops alerts (`ops_alert`, 7c2)
Platform-staff alerts live in `ops_alert` (service role only; one kind today, `brief_readiness`). The hourly `brief-readiness` job (`25 * * * *`) checks each workable client in its own time zone and upserts one row per condition. A row **resolves automatically** when its condition clears and is never re-opened. Read them on `/platform/health` -> "Brief readiness" (counts for the coming Monday, open issues with severity, issue, delivery date, clients, first seen, emailed). Platform owner/staff get **one email per row** (client list included) when it first appears.
| Issue (panel label) | Condition | Usual cause / fix |
|---|---|---|
| Not ready after generation closed | Friday 12:00 client time: no `ready`/`approved`/`sent` brief for Monday | generation failed or never queued: check `brief-client` jobs and `brief.error`, fix, `pnpm --filter @cs/worker brief-once --client <id> --force` |
| Missing or failed before delivery | Sunday 19:00 to Monday 07:00: no brief, or `failed` | same; must be fixed before 07:00 |
| Ready but not approved | same window, `ready` and auto-send off | ask the agency to approve (warning) |
| Starting point late | 6 h after the 48 h starting-point clock | check `starting-point-client` and `brief.error` |

Keys: `brief_readiness:<checkpoint>:<deliveryDate>:<time zone>` (weekly, one lifecycle per zone, so a later zone can send another email) and `brief_readiness:starting_point_late:<clientId>`. A client set that grows resets `emailed_at` (one more email). If any recipient fails, `emailed_at` stays null and the next hour retries all recipients (a partial failure can duplicate emails). Inspect: `select kind, dedupe_key, severity, first_seen_at, emailed_at, resolved_at, summary from ops_alert order by first_seen_at desc limit 50;`. Do not hand-resolve; fix the cause. The job returns `{ skipped: 'engine_unconfigured' }` when the worker lacks `APP_URL`/`LINK_SIGNING_SECRET`.

## Rehearsal (7c2, staging only)
Proves 120 weekly clients + 12 starting-point clients on a prod-sized staging stack; setup is [DEPLOY.md](DEPLOY.md) § Staging. Never run against prod or `cs_dev`. Commands: `pnpm --filter @cs/demo rehearsal <cmd>` (usage prints on a bad call). **Use the same DB URL form (pooled or direct host) for `seed`, `fault` and `approve`:** the guards compare `<host>/<database>` exactly, and a pooler-vs-direct mismatch is refused without a hint.
1. **Monday:** `latency --out packages/engine/src/rehearsal-latency.json` (owner; reads `cs_dev` `llm_call`; commit if changed).
2. `seed --agencies 40 --clients 3 --starting-points 12 --live-clients 10 --confirm-db <host>/<db>` (`SERVICE_DATABASE_URL` = staging `app_service`). Guards: `--confirm-db` must equal the URL's `<host>/<db>`, the database may hold only `Rehearsal …` agencies, name must not end `_test`. One transaction, Monday-Thursday before 22:00 Chicago only; a re-seed needs a fresh staging branch. Writes `rehearsal-manifest.json` (gitignored: ids, live slice, seed time, delivery Monday) and prints `REHEARSAL_LIVE_CLIENT_IDS=…`.
3. `fault --clients 3` before Thursday 22:00 local: agency `Rehearsal Agency Fault` with 3 clients whose Monday briefs are pre-failed; the readiness alarm must email Friday 12:00.
4. Set `REHEARSAL_LIVE_CLIENT_IDS` on the staging worker and redeploy it **only right after seeding**: fixture DataForSEO tasks posted before a restart are stranded (failed vendor tasks, not briefs).
5. Watch daily: `/platform/health` (staging), Railway memory, Neon connections, Sentry `staging`.
6. **Friday ~14:00 local:** `approve` (auto-send-off clients; goes through the registry `approve_brief`, audited; needs `APP_DATABASE_URL` + `SERVICE_DATABASE_URL`). Check the fault alarm email in Postmark test-server activity.
7. **Next Monday 08:00 local:** `report --fixture-log-url https://fx1.rehearsal.rivalmonday.app/__rehearsal/log --fixture-log-token-env FIXTURE_LOG_TOKEN [--memory-mb <n>]` (`DATABASE_URL` = staging owner URL). Prints PASS/FAIL/SKIP lines and `RESULT: PASS|FAIL|INCOMPLETE` (exit 0 only on PASS):
   - weekly briefs ready <= 4 h after window open; starting points ready <= 6 h after due; no failed briefs;
   - briefs sent by 07:15 local; brief emails sent by 07:45 local;
   - no expired jobs (`job failed by timeout in active state`, `pgboss.job` + `archive`);
   - worker RSS < 75 % of memory; DB connections < 80 % of limit (from heartbeat outputs);
   - fixture hosts: min gap per host >= 3 s; fx5 (Crawl-delay 30) >= 30 s; fx5 does not slow the others (p95 re-capture lag busy vs idle, a proxy);
   - spend guard never tripped (no `spike_paused`); live-slice spend x 6 below the spike threshold; total AI spend <= $5;
   - fault alarm raised (critical `generation_closed`, emailed, covering all 3).
   Fault clients are excluded from every other line; the 12 starting-point clients are judged by the starting-point line only. SKIP = a missing input (no live slice, no fixture log): fix and re-run.
8. Fix wave per FAIL (queue concurrency, `DEFAULT_VENDOR_LIMITS`, pool sizes, or code); a Thursday-burst spike-guard trip goes to 7b as too tight.
9. `teardown --confirm-db <host>/<db>` writes `rehearsal-archive.sh` (one `archive agency <id>` per rehearsal agency; run it deliberately) and prints the manual cleanup (Railway project, Neon branch, bucket, CNAMEs). Evidence is never deleted.
Results are recorded in the work file / STATE, not here.

## Archive and purge (7a2)
Deleting a tenant is two steps (service role, `SERVICE_DATABASE_URL`; one `platform_audit_log` row per action):
```
pnpm --filter @cs/worker archive <agency|client> <id> [--undo]
pnpm --filter @cs/worker purge-archived --older-than 90d [--dry-run]
```
`archive` hides the row everywhere at once (archived = deleted; `--undo` restores it losslessly). It **refuses** while a live Stripe/Connect subscription exists: cancel it in Stripe first. `purge-archived` hard-deletes agencies/clients archived more than n days ago (**n >= 30**, planned 90) and cascades; ledger and audit rows stay, detached and anonymised; evidence and captures are not pruned; Better Auth users stay (sign-in lands on `/no-access`). Always `--dry-run` first. Verified leads nobody actioned are deleted after 180 days and pending notifications over 7 days overdue become `skipped` by the daily jobs (no command).

## Spend guard (7b1)
Two guards stop runaway AI spend (spec `2026-10-22-phase-7b-money-design.md` §3/§4). Tenants see credits (1 USD = 100), you see USD. Nothing here touches `client.paused_at`, seats or Stripe.
- **Client pause:** the hourly `spend-guard` job (cron `7 * * * *`) sets `client.spend_paused_at` when a client's month-to-date spend reaches 130 % of its limit (default $15, per-client override). It lifts on the 1st (UTC) or when the limit is raised. Schedulers use `clientWorkAllowed`; in-flight AI calls for that client throw `AiPausedError` and the worker completes the job as `{ skipped: 'spend_paused' }`.
- **Spike guard:** the same job compares the last 24 h of spend (all providers, OpenRouter, Anthropic; Jev excluded) with the baseline; +100 % = warn (staff email, Health/platform banner), +200 % = pause **all** AI calls. Queued `usesAi` jobs are re-sent with a 600 s delay (cron jobs just wait for the next tick); Ask answers "heavy load".
- **Read it:** `get_spend_guard` / `get_ai_guard_state` (Platform -> Health, "Spend guard" card, platform viewers and up); settings on Platform -> Costs -> "Limits & spike guard" (owner, `update_spend_guard_settings`).
- **Reset a spike warn/pause:** Health -> Reset (owner/staff, tool `reset_ai_pause`), note required (<= 200 chars). Snoozes the guard 24 h (`spikeSnoozeHours`): a pause-level reading then only warns. Refused when the state is already OK.
- **Raise or clear a client's limit:** Platform -> Agencies -> the agency -> "Client limits" (tool `set_client_limits`, owner/staff). Blank override = platform default. Raising the limit so that spend falls under the new pause threshold (limit x pause %) lifts the pause in the same transaction and writes `client_unpaused`. Agencies cannot change limits.
- **Manual unpause:** only via `set_client_limits` (raise the limit). Never `UPDATE client SET paused_at ...` and avoid hand-editing `spend_paused_at`; the next hourly run would re-apply the pause anyway while spend is over the threshold.
- **Inspect (service role, read-only):**
```sql
select created_at, kind, scope, client_id, observed_usd, baseline_usd, limit_usd, actor, note
  from spend_guard_event order by created_at desc limit 50;
select id, name, agency_id, spend_limit_usd, spend_paused_at from client where spend_paused_at is not null;
select key, value, updated_at from platform_setting where key in ('ai_guard_state', 'spend_guard_settings');
```
`ai_guard_state.value` is `{ state: 'ok' | 'warn' | 'paused', since, scope, observedUsd, baselineUsd, snoozeUntil, resetBy? }`. If the pause looks wrong (e.g. a one-off backfill), check `llm_call`/`vendor_call` for the 24 h window first, then Reset with a note. `collect-once` and the other `*-once` CLIs run unguarded by design.
- **Jev:** `provider = 'jev'` rows stay in the ledger and on Costs but count towards nothing here until Jev is priced (`SPEND_GUARD_EXCLUDED_PROVIDERS`).

## Crawler ban

Don't point the web crawler at real competitors until `https://rivalmonday.app/bot` exists. That covers `collect-once` without `--vendors` and `collect-once` with `--web`. `--vendors` on its own calls only vendor APIs. `WEB_MONITORING_ENABLED` stays off.

## Gold labels and decision labelling

CLI: `pnpm --filter @cs/worker decisions <report|export|import|reviews|resolve>`.

1. Export: `decisions export --out <csv outside the repo> --task review_decisions --limit <n>`, or `--task verifier_decisions`.
2. Label: open the CSV in `tools/decision-labeler.html` (a local page), label one decision at a time, then save. For `verifier_decisions`, mark a statement true only if the evidence shows every fact in it.
3. Import: `decisions import --in <csv> --by <name>`.
4. Report: `decisions report --task <task>`. It gives accuracy and ECE per task, question family and role.

The first batch (2026-10-03) labelled 10 Aire Serv reviews with 98 labels:

| Question | Jev | LLM | Engine |
|---|---|---|---|
| Themes | 88.5 % | 93.6 % | 93.6 % |
| Sentiment | 80 % | 80 % | — |
| Other-topic | 90 % | | |

Sentiment misses are off by one only. Both providers are overconfident on sentiment (ECE ≈ 0.19).

- **Owner decision:** keep review decisions on Jev. Ignore the report's "consider routing to the LLM" note until pilot agencies supply labels at volume. The spec's eval target is about 200.
- **Verifier τ 0.85:** live runs twice dropped plausible true statements, once with a true alert headline scoring 0.84. Label `verifier_decisions` samples before changing τ or routing. Samples come from both briefs and alerts; there were 5 unlabelled in `cs_dev` as of 2026-10-04. Re-export every few weeks, or ask for a deliberate `AI_SHADOW_RATE=1` measurement run (a few cents).
- When labels arrive at volume, first restrict the report's routing-note pairing to `reason = 'shadow'` samples.

## Evals (7c1)

Four suites in `packages/evals` (changes, reviews, briefs, ask): labelled cases `data/<suite>.jsonl`, recorded model replies `cassettes/<suite>.json`, baselines `baselines/<suite>.json`. Rules B1-B3 (leaks, unsupported claims, injection) block; accuracy metrics are report-only. All commands: `pnpm --filter @cs/evals eval <cmd> --suite <changes|reviews|briefs|ask|all> ...`. The CLI loads the root `.env` first (`src/cli/load-env.ts`).

- **Replay (free, offline, what CI runs):** `pnpm eval:replay` (= `run --mode replay`). Needs the test DB (`bash scripts/local-test-db.sh start|env`); refuses any non-`_test` URL. **The Ask suite truncates the test DB: never run it alongside another test run on that DB.**
- **Cassette miss:** a recorded request key no longer matches. Triggers: the task's `ai.yaml` entry (model, fallbacks, max_tokens, ...); any prompt; an ask-channel tool's description, input schema or output shape (`packages/tools/src/`); the isolation world (`packages/db/test/`: a new table adds world rows tools can return); Ask turn/grounding code (`packages/ask/src/`); the engine `supportCheck`/verifier prompt (briefs and Ask). A branch merging after 7c1 that touches any of these (e.g. phase-15c2b) must run `pnpm eval:replay` after rebasing. Re-record that suite in the same PR: `eval record --suite <s> --max-usd <n>` (live run, rewrites `cassettes/<suite>.json`), then `eval run --suite <s> --mode replay --update-baseline` if the metrics moved, and commit both. The Ask suite pins its clock to `ASK_TODAY` (`suites/ask/run.ts`) for record and replay, so it replays on any real day. In replay, any errored case blocks (`E`). Single-case re-record does not exist yet. A budget stop mid-record loses the whole recording (flush happens at suite end).
- **Live run:** `eval run --suite <s> --mode live --max-usd <n>`. Cap = `--max-usd`, else `EVAL_MAX_USD`, else $5; in CI (`CI=true`) one of them is required. One cap per invocation, shared across `--suite all`. Actuals so far: briefs $0.55, ask $7.65 (incl. $4.10 for the clock-pin re-record), changes $0.07, reviews $0.17, prelabel $1.17. Ask records hit a flaky case or two each time (OpenRouter invalid JSON on `ask-inject-12`; `ask-inject-09` quoting the injected phrase while refusing, B3): budget ~$0.06 per single-case retry.
- **Rebuild cases:** `eval build --suite changes|reviews` (read-only against `cs_dev` via `DATABASE_URL`, plus golden and synthetic cases). The build refuses to write if contact details survive redaction. `cs_dev` has no web-source changes until `WEB_MONITORING_ENABLED`, so rebuild `changes` once real ones exist.
- **Labelling round trip (changes, reviews):** `eval label --suite <s> --prelabel [--max-usd n]` (LLM/template pre-labels, ~$1.2 for both) then `eval label --suite <s> --export label-work/<s>-labels.csv`; open the CSV in `tools/decision-labeler.html`, fix wrong rows, save; `eval label --suite <s> --import label-work/<s>-labels.csv --by <name>` marks them confirmed; then `eval run --suite <s> --mode replay --update-baseline` and commit data + baseline. `label-work/` is gitignored. Until labels are confirmed, metrics appear as `prelabel_agreement.*` (agreement, not accuracy).
- **CI:** `ci.yml` runs `pnpm eval:replay` after the unit tests. `.github/workflows/evals-live.yml` runs live B1-B3 on PRs touching `ai.yaml`, `packages/ai/src`, `engine/src/briefs`, `ask/src`, `evals`, `tools/src` or `db/test` (and on any PR whose diff check fails), nightly at 07:00 UTC, and by `workflow_dispatch`; cap $5, report uploaded as artifact `eval-report-<run>`. A failed nightly emails `EVALS_ALERT_TO` through Postmark. One-time setup (GitHub environment `evals` with five secrets, required check) is in `docs/work/phase-7c1.md` until merge, then here: environment `evals` secrets `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `POSTMARK_SERVER_TOKEN` (live server), `EVALS_ALERT_TO`, `EVALS_ALERT_FROM` (verified sender); require `evals-live` on `main`.

## Demo and dev panel

- `pnpm demo:reset` creates `cs_demo` if it is missing, then wipes, migrates and seeds it. It writes evidence to `apps/worker/.evidence-demo` and prints sign-in links.
- `pnpm demo:links` prints fresh sign-in links.
- `pnpm dev`, `pnpm dev:web` and `pnpm demo:dev` run the web app with the dev panel (`DEV_PANEL=1`). The panel works only on `localhost` or `127.0.0.1` and never in production. Its banner shows DEV / DEMO / TEST and offers switch, demo sign-in, reset and snapshot. Jobs are refused in DEMO and TEST, and sign-in emails go to the console.
- Tests: `pnpm --filter @cs/demo test` (coverage), `pnpm e2e` and `pnpm --filter @cs/web e2e:panel`.

## Snapshots

- `pnpm db:snapshot` dumps `cs_dev` and zips its evidence into `backups/<timestamp>-cs_dev/` with a manifest. The first real one is `backups/20261011-200754-cs_dev/`, and it restored successfully.
- `pnpm db:restore <folder> [--into <db>]` restores into a new `cs_dev_restore_<timestamp>` by default. Restoring over an existing DB requires typing its name, and a fresh snapshot is taken first. It never restores into a `_test` DB.
- The tools need PostgreSQL 18 client tools through `PG_BIN` (verified with 18.6 from `D:\Program Files\PostgreSQL\18\bin`). The round-trip test is skipped without it.

## Catalogue review and merge

- Queue: `/platform/verticals` (nav "Business types", badge = pending). Agencies create types and services on the fly; they are usable at once and wait here for review.
- Per card: **Approve** (a type also approves its unreviewed services), **Rename**, **Edit** (name, audience noun, services, categories), or **Merge into...** an existing entry. Check the quotes under "Evidence" first.
- A vertical merge runs in one transaction: moves or maps the source's services (a mapped service becomes `merged`), sets clients' `vertical_id` and `services`, rewrites `event.services`, `price_point`, `price_block_map`, `playbook_override` and `agency_profile.verticals`, appends the source's Google categories to the target's related categories, and marks the source `merged`. It deletes the source's derived analyses (`review_analysis`, `price_block_map`, proposed `theme_proposal`); the next run re-derives them under the target. Colliding open `price_point` rows are deduped.
- Merges are irreversible. Merged ids keep resolving to the target (`merged_into`), so old links and saved ids still work. `generic` cannot be merged.
- Drafting is capped at 10 attempts per agency per UTC day (failed drafts count, cache hits do not). Draft cost shows on `/platform/costs` under the type, or "Drafts not yet created".
