# brief-signal — get real items into weekly briefs; staging runs live like pilot

**Kind:** fix   **Worktree:** ../CompetitorSpy-wt/brief-signal   **Base:** main @ 16d20199
**Spec:** `docs/superpowers/specs/2026-11-07-brief-signal-design.md` · **Plan:** `docs/superpowers/plans/2026-11-07-brief-signal.md` (Tasks 0–12)

## Status (overwrite)
Plan owner-approved 2026-11-07; execution started.

## Next (overwrite)
`superpowers:subagent-driven-development` from Task 0.

## Interfaces this branch adds or changes
- Migration **0099** `vertical_whole_business` (data only: `scoring.relevance.whole_business = 1`, `scoring.version 4` on generic/hvac_plumbing/dental).
- Pack schema `scoring.relevance.whole_business` (default 1). Engine `WHOLE_BUSINESS_TYPES`; `serviceOverlap(…, changeType)` returns `{ value, wholeBusiness }`; `scoreInputFor`; `ScoreFactors.wholeBusiness?/rescored?/rescoreCap?`.
- Engine `rescoreRecent`; worker CLI `pnpm --filter @cs/worker rescore [--since-days N] [--client <uuid>] [--dry-run]`.
- Engine `EVIDENCE_WORDING` (brief + alert writer prompts), `EVIDENCE_CHANNEL_LABEL`, evidence head `[<label> · detected on <date> · <path>]`, structured Before/After lines.
- Vendor diff: `SourceDiffer(db, cap, prev, older)`, `DifferResult`, `previousVendorCaptures`, `VENDOR_DIFF_LOOKBACK`, `StructuredChange.beforeCaptureId`; GBP `guardedGbpDiff`, `implausibleVotesDrop`. Stage output adds `implausible`, `held`.
- Collectors `APIFY_COST_PER_AD_USD`, `apifyCostUsd` (moved from `meta-search.ts`).
- `stagingWorkerEnv` requires the five vendor keys; refuses `VENDOR_FAKE_MODE`, `VENDOR_LIVE_RANK_SCANS`, `WEB_MONITORING_ENABLED` in `.env.staging`.

## Assumes from other branches
None.

## Decisions (owner-approved 2026-11-07)
- **D1** One branch; order staging live → scoring → verifier wording/evidence → plausibility guard → Apify cost → re-score CLI → docs.
- **D2** Pack field `scoring.relevance.whole_business` = 1.0 (3 shipped packs) used for whole-business types without a service; brief bar 40 and §6.3 unchanged except relevance; `scoring.version` 3 → 4; migration 0099 + YAML + seed; `factors.wholeBusiness`.
- **D3** One-off `rescore` CLI: un-featured event × client pairs scored in the window, in place, current pack; never alerts; idempotent.
- **D4** τ 0.85 fail-closed unchanged; fix writer wording + evidence lines only; re-record the `briefs` eval (`record --fill`, ≤ $5); owner labels `verifier_decisions`.
- **D5** Staging worker runs live vendors like pilot/prod; fixtures only on the DEPLOY.md rehearsal stack; `WEB_MONITORING_ENABLED` still refused. **Supersedes STAGING.md:27 "Vendors cost nothing" (owner, 2026-11-07).** Reset staging via `staging-refresh` from cs_dev.
- **D6** GBP guard: no `rating_change` when votes drop > 20 % or by > 50; address/title/domain emitted only after 2 consecutive agreeing captures; state = earlier captures (no table); counters + log, no ops alert.
- **D7** Apify Meta-ads ledgered per item at `$0.00075`/ad.
- Plan calls P1–P6 (whole-business set, default 1.0, no pack/diff version bumps, rescore inputs, alert-writer wording, rating-glitch recovery): spec Decisions table.
- **D8** Whole-business events may route to `alert` (rating_change up to 70, new_location up to 90); thresholds unchanged (owner, 2026-11-07).
- **D9** GBP title/domain/hours/status `content` stays `unmapped` (weight 0.2 caps it at 20 regardless) (owner, 2026-11-07).

## New backlog (target → item)
- (later) → GBP title/domain/hours/status `content` events stay at `unmapped` relevance (never briefed); revisit if pilots want them.

## Owner verification steps
After merge (each step is the owner's; nothing here edits env files):
1. `pnpm db:migrate` on cs_dev (applies 0099). Check: `SELECT id, config #> '{scoring,version}', config #> '{scoring,relevance,whole_business}' FROM vertical WHERE id IN ('generic','hvac_plumbing','dental');` → 4 / 1.
2. cs_dev re-score: `pnpm --filter @cs/worker rescore --dry-run`, read the `archive->brief` count, then run without `--dry-run`. Run it again: everything `current`, nothing re-scored.
3. Label verifier samples: `pnpm --filter @cs/worker decisions export --out <csv outside repo> --task verifier_decisions`, label in `tools/decision-labeler.html`, `decisions import --in <csv> --by <name>`, `decisions report --task verifier_decisions`.
4. Staging live: in `.env.staging` delete `VENDOR_FAKE_MODE` and `VENDOR_LIVE_RANK_SCANS` lines; add real `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`, `STADIA_API_KEY`.
5. Stop the staging worker; **staging-refresh** from cs_dev (destructive: erases staging sign-ups/test agencies; confirm at the time); copy evidence (STAGING.md § 3).
6. On staging, set per-client spend limits (platform staff) for every active client, then `pnpm staging:up`. With an old `.env.staging` it must refuse with "Refusing VENDOR_FAKE_MODE … Remove the line".
7. After one live week on staging, measure:
   - `SELECT route, count(*) FROM event_score WHERE scored_at > now() - interval '7 days' GROUP BY 1;` (brief-routed vendor events appear; `factors->>'wholeBusiness' = 'true'` on them).
   - `SELECT delivery_date, kind, dropped, (SELECT count(*) FROM brief_item bi WHERE bi.brief_id = b.id) AS items FROM brief b ORDER BY delivery_date DESC LIMIT 10;` (items > 0, `dropped.items` low).
   - `SELECT vendor, sum(cost_usd), count(*) FROM vendor_call WHERE created_at > now() - interval '7 days' GROUP BY 1;` (≈ $2–4 vendors; Apify rows no longer null).
   - Worker log: `[engine] vendor_diff … suppressed/held` lines are rare; no `rating_change` from a vote-count collapse.
8. Compare with the cs_dev re-score counts (step 2) and the `briefs` eval B2/drop numbers recorded in Task 6.

## Brief

### Findings (main-session investigation)
1. **Scoring cap.** `score.ts:104` 100×weight×size×relevance×novelty; `serviceOverlap()` (`:59-64`) = `unmapped` 0.6 with no service id. Vendor events are whole-business → relevance 0.6. Routing `{alert:70, brief:40}`. Max: ad_started/review_spike 36, hiring/rank_change 30, new_location 32.4. cs_dev week 10-26: 14 scored, 12 archive.
2. **Verifier drops supported claims.** `briefs/verify.ts:57-91` → `supportCheck` (`support.ts:16`, Jev → LLM, τ 0.85); a dropped headline drops the item (`verify.ts:84`). cs_dev 11-02: Jev true@0.82, Haiku true@0.70/0.84 dropped. Staging 11-09: all dropped; "rating dropped from 4.9 to 4.3 as of November 5" vs evidence "Google rating 4.9 → 4.3 (3 reviews) [google_business_profile · 2026-11-05]" — Jev false@0.04.
3. **Staging runs fake vendors.** `demo/src/staging/worker-env.ts:42` requires `VENDOR_FAKE_MODE=fixtures`, `:51` strips shell vendor keys; only `VENDOR_LIVE_RANK_SCANS` goes live. Fixtures = 4.3/3 votes for all (`fixture-fetch.ts:98`) → 267 bogus events (week 11-02).
4. **Implausible captures → events.** `engine/src/structured/gbp.ts:77-84` emits `rating_change` on |Δ| ≥ 0.1 with no votes check (548 → 3 passed). Hook `diffGbpProfiles` (`gbp.ts:53`) / `diffVendorCapture` (`vendor-diff.ts:58`).
5. **Apify cost not ledgered.** `collectors/src/vendors/apify.ts:66` `costUsd: null`; keyword search prices it (`meta-search.ts:16,82`).
6. Ops: cs_dev has had no worker since 10-30 (owner's worker runs staging). Not a bug.

Live cost on cs_dev: normal week ~$1.5–2 vendors (incl. rank scans) + ~$1.5 AI for ~5 clients; first heavy week ~$9.

### Already built — reuse
Scoring `score.ts`/`score-stage.ts` (insert-only, `NOT EXISTS`); pack schema `schema.ts:90-112`, catalogue `catalog.ts` (`assemblePack` deep-merges generic); verifier `verify.ts`/`support.ts`/`rules.ts`; `featuredBefore` (`gather.ts:59`); staging env `worker-env(.test).ts`, worker `env.ts` `rehearsalEnvErrors`; ledger `safeRecordVendorCall`; `decisions export`; CLI pattern `runbook-backfill.ts`.

### Backlog folded in
Verifier strictness / label `verifier_decisions` (D4 + owner step 3); Apify cost not ledgered (D7). Not folded: review-spike thresholds not pack-tunable (3b/3c); 14b thresholds-loader cache; Apify cap hint (8c).
