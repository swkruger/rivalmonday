# brief-signal — get real items into weekly briefs; staging runs live like pilot

**Kind:** fix   **Worktree:** ../CompetitorSpy-wt/brief-signal   **Base:** main @ 16d20199
**Plan/spec:** none yet (brainstorm from Open questions below)

## Status (overwrite)
Kickoff brief written; no code.

## Next (overwrite)
Owner answers Open questions → `superpowers:brainstorming` → lean spec + plan.

## Interfaces this branch adds or changes
None yet. Next free migration: **0099**.

## Assumes from other branches
None.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)

## Owner verification steps
TBD.

## Brief

### Findings (main-session investigation)
1. **Scoring cap.** `score.ts:104` 100×weight×size×relevance×novelty; `serviceOverlap()` (`:59-64`) = `unmapped` 0.6 with no service id. Vendor events (ads, reviews, hiring, rating, GBP) are whole-business → `services[vertical]` null → relevance 0.6. Routing `{alert:70, brief:40}` (all 3 packs). Max: ad_started/review_spike 36, hiring/rank_change 30, new_location 32.4. cs_dev week 10-26: 14 scored, 12 archive (a 4.58σ review spike → 36; a GBP address change → 32.4).
2. **Verifier drops supported claims.** `briefs/verify.ts:57-91` → `supportCheck` (`support.ts:16`, Jev → LLM, τ 0.85); below τ = unsupported; a dropped headline sentence drops the item (`verify.ts:84`). cs_dev 11-02: items dropped at Jev true@0.82, Haiku true@0.70/0.84. Staging 11-09: all items dropped; e.g. "rating dropped from 4.9 to 4.3 as of November 5" vs evidence "Google rating 4.9 → 4.3 (3 reviews) [google_business_profile · 2026-11-05]" — Jev false@0.04, Haiku true@0.5. **τ is binding: owner's call.**
3. **Staging runs fake vendors.** `packages/demo/src/staging/worker-env.ts:42` refuses unless `VENDOR_FAKE_MODE=fixtures`, `:51` strips shell vendor keys; only `VENDOR_LIVE_RANK_SCANS` (`:53-55`) goes live. Worker: `apps/worker/src/env.ts:22-49`, `deps.ts:207-256`. Fixtures = 4.3/3 votes for all (`fixture-fetch.ts:98`) → 267 bogus events (week 11-02). Owner wants staging = pilot (live vendors); web monitoring stays off. Staging DB polluted: live captures would diff against fixtures. Docs to change: STAGING.md:27 ("Vendors cost nothing"), § 2 live-rank block (:326-333), § 5 cost table, :216/:224 env lists; DEPLOY.md:44 + § Rehearsal stack (:65-76) unaffected (own throwaway stack).
4. **Implausible captures → events.** `engine/src/structured/gbp.ts:77-84` emits `rating_change` on |Δ| ≥ `RATING_CHANGE_MIN` 0.1 with no votes check (548 → 3 votes passed). Hook: `diffGbpProfiles(before, after)` (`gbp.ts:53`) or `diffVendorCapture` (`vendor-diff.ts:58`, `DIFFERS` :31-37); baseline `previousVendorCapture` (:42).
5. **Apify cost not ledgered.** `collectors/src/vendors/apify.ts:66` writes `costUsd: null`; the keyword search path already prices it (`meta-search.ts:16,82` `apifyCostUsd`, `META_SEARCH_COST_USD.apifyPerAd`).
6. Ops: cs_dev has had no worker since 10-30 (owner's worker runs staging). Not a bug.

Live cost on cs_dev: normal week ~$1.5–2 vendors (incl. rank scans) + ~$1.5 AI for ~5 clients; first heavy week ~$9.

### Already built — reuse
- Scoring `engine/src/score/score.ts` (`scoreForClient`; `scoringVersion` in `event_score.factors`); stage `score/score-stage.ts:106` inserts once per event×client (`NOT EXISTS` + `onConflictDoNothing`) — **no re-score path**; a version bump affects new events only. Thresholds from the client runbook.
- Pack schema `verticals/src/schema.ts:90-112` (`scoring.version`, `routing` refine brief<alert, `relevance{matched,unmapped,unmatched,outside_territory}`). Packs live in the DB catalogue (`catalog.ts`, `catalog-seed.sql.ts`): YAML edits need a migration.
- Verifier: `briefs/verify.ts` + rules `checkSentence`; `support.ts` → `ai.decide` (`@cs/ai`); `decision_sample`, `decisions export`.
- Staging env: `worker-env(.test).ts`, worker `env(.test).ts` (`rehearsalEnvErrors`), `createFixtureFetch`.
- Ledger `safeRecordVendorCall`; cost guards; `brief-readiness` job (`findReadinessIssues`, `ops_alert`).

### Binding decisions (don't re-open; conflicts flagged)
- Spec §6.3 formula, 70/40 routing (per client), versioned pack weights, factors stored.
- **Verifier τ stays 0.85 until `verifier_decisions` are labelled**; review decisions stay on Jev; spec §11: never send unverified. → Finding 2 touches this.
- Staging (7a/7c2, STAGING.md:27): staging vendors are fixtures, only rank scans live. → **Conflicts with owner's new "live like pilot" request; owner must supersede it.**
- Crawler: `WEB_MONITORING_ENABLED` unset until `/bot` exists. Cost guards 7b (caps, `clientWorkAllowed`); vendor calls via the limiter; evidence never deleted.

### Backlog to fold in (verbatim)
- Verifier strictness: at τ 0.85 true facts often score low (0.36, 0.16; alert headline 0.84) — watch brief `dropped` counts on pilot data before changing τ/routing (labelling: see Owner) — *from 4a/4b*
- Label `verifier_decisions` samples (5 unlabelled in `cs_dev` as of 2026-10-04; `decisions export --task verifier_decisions`) before changing τ or routing — *from HANDOVER §5 item 3/§7*
- Review-spike thresholds (`REVIEW_SPIKE_Z`, `REVIEW_SPIKE_MIN`, `REVIEW_BASELINE_WEEKS`) not pack-tunable; `review_spike` reuses one z-score for velocity and complaint Poisson — *from 3b/3c*
- 14b: … platform thresholds knob shadows a pack's own routing; redundant runbook loads per brief; score stage needs a thresholds-only loader / per-run cache — *14b*
- Costs: … Apify with no cap gets no hint — *from 8c*

### In-flight workstreams
No unmerged local branches; two remote docs-only branches, no overlap. `staging-worker` worktree runs main (detached) — gets this work only after merge.

### Open questions for the owner
1. **One branch or sub-branches?** (a) one branch, tasks ordered scoring → verifier → plausibility/Apify → staging live; (b) two: `brief-signal` (engine: 1, 2, 4, 5) + `staging-live` (3, docs + env + data reset); (c) three, verifier separate as it waits on labels. **Rec: (b)** — ops/env work, can ship first.
2. **Whole-business relevance + re-scoring.** (a) relevance 1.0 when the change type cannot carry a service (ads, reviews, rating, hiring, rank, GBP address); (b) lower pack brief bar (e.g. 25); (c) new pack field `relevance.whole_business` (e.g. 1.0) used when the type is in a whole-business set, with `scoring.version` bump. Re-score past events: (i) no, forward only; (ii) one-off CLI re-scoring un-briefed events of the last 14 d. **Rec: (c) + (ii)** — keeps §6.3 and the 40 bar.
3. **Verifier (binding τ decision).** (a) keep τ 0.85 fail-closed; label `verifier_decisions` first; (b) accept a sentence when Jev and the LLM both say supported, each ≥ a lower floor (e.g. 0.6); (c) writer/evidence changes only (wording mirrors evidence: "detected", exact numbers/dates; cleaner evidence lines) and re-measure. **Rec: (c) now + owner labels the cs_dev/staging samples; (b) only after labels** — the 4.9 → 4.3 case looks like an evidence-format problem, not τ.
4. **Staging live mode.** Reset: (a) `staging-refresh` from cs_dev (erases staging sign-ups/test agencies; cs_dev has no fixture data); (b) targeted delete of fixture captures/events/scores on staging (evidence-never-deleted rule only binds real evidence). Fixtures: (x) rehearsal stack only; (y) keep as staging opt-in. Spend cap: per-client limits + OpenRouter key cap (~$2–4/week vendors). **Rec: (a) + (x), staging worker live by default with per-client spend limits set, `WEB_MONITORING_ENABLED` still refused.**
5. **Plausibility guard thresholds.** (a) suppress `rating_change` when votes drop > 20 % or by > 50 between captures (status `suppressed`, flag `implausible`); (b) also hold address/title/domain changes until seen in 2 consecutive captures; (c) both, plus an `ops_alert` when > N implausible diffs per run. **Rec: (a) + (b)**, no new alert yet.
6. **Apify cost.** (a) estimate per item with `apifyCostUsd`-style rate; (b) fetch the actor run's real `usageTotalUsd`. **Rec: (a)**, consistent with keyword search.
