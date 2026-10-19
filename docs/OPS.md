# Rival Monday — Dev environment runbook

What is built: [ARCHITECTURE.md](ARCHITECTURE.md). All commands run from the repo root.

## Databases (Neon)

| DB | Use |
|---|---|
| `cs_dev` | Live dev data (real vendor pulls for Aire Serv). Owner verification runs here. Latest migration `0037`; run `pnpm db:migrate` if it is behind. |
| `cs_test` | Test suites. Snapshot restore never targets a `_test` database. |
| `cs_demo` | Fictional HVAC/plumbing demo data, rebuilt by `pnpm demo:reset`. |

## CS Dev Verification Agency / Client (`cs_dev`)

- Agency `CS Dev Verification Agency` — id `aaf5e009-974b-4ce8-b7ec-b722c5c66b1c`.
- Client `CS Dev Verification Client` — id `25f99947-4559-4150-ab5d-dd432540aca0`, `vertical_id: hvac_plumbing`. Has a place id and a linked self business (set 2026-10-06). Tracks `aireserv.com` (competitor id `e9f9cbd3-8834-43a4-a1af-a31224ca43d3`) plus the competitors accepted during 5b-1 verification.
- Aire Serv sources: place `ChIJ6VlKPHqPT4YR479jLd01gZY`; Meta page Aire Serv of Granbury `1825453601028298`; Google advertisers `AR11447192921745391617` and `AR09867956064303972353`. **Not** `AR16031097081657556993` (Iowa City franchisee, unpinned on 2026-10-11 and its 3 ads retired).
- Data: vendor collection only, no `web`-source captures, so `price_point` is empty and Pricing shows "website monitoring isn't switched on". 98 gold labels for review decisions. No live stored standard brief yet. Still no real alerts. Real competitor changes are expected from the weekly pull of 2026-10-13. The brief `0612e32a-…` had its `pdf_key` cleared on 2026-10-11, so it re-renders on next open.
- The owner signs in as `agency_admin` of the agency through a file-outbox magic link. There is no "view as client" switch. To see the client-owner view, invite an address at Agency → Team → Invite (role Client owner) and sign in as that address.
- This agency and client are verification fixtures with clear names. Review, rename or remove them before real onboarding.

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
Creates the platform runbook, one per agency, and for every client (all statuses) a client runbook that reproduces what it sees today (pack plays with `playbook_override`s applied, self-rules, thresholds), with `tailor_status = 'skipped'`. Idempotent; leaves `playbook_override` alone. New agencies get theirs at sign-up and via `admin create-agency`.

After the backfill nothing calls the model: backfilled clients stay `skipped`. A new client's runbook is created (and tailored by the `runbook-tailor` worker job, one OpenRouter call) when the setup wizard advances (`advance_client_setup`) or an agency admin uses "Create a runbook for this client"; `runbook.tailor_status` is `pending` / `done` / `failed` / `skipped` (a failed run leaves the agency runbook copy, editable). Check a client with `select tailor_status from runbook where client_id = '<id>'`. To roll back before dropping `playbook_override`, delete the client/agency runbook rows: clients fall back to the legacy view.

## Crawler ban

Don't point the web crawler at real competitors until `https://rivalmonday.com/bot` exists. That covers `collect-once` without `--vendors` and `collect-once` with `--web`. `--vendors` on its own calls only vendor APIs. `WEB_MONITORING_ENABLED` stays off.

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
