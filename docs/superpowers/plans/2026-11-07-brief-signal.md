# brief-signal Implementation Plan

**Goal:** Real competitor moves reach the weekly brief: whole-business vendor events clear the brief bar, true sentences survive the verifier, implausible GBP captures stop producing events, Apify spend is ledgered, recent events can be re-scored once, and staging runs live vendors like pilot.

**Spec:** `docs/superpowers/specs/2026-11-07-brief-signal-design.md` (binding: D1–D7, P1–P6, Interfaces).

## Global constraints
- Spec §6.3 formula, routing 70/40, τ 0.85 fail-closed, `support.ts` question text: unchanged.
- Never edit applied migrations; next free is **0099** (re-check in Task 0). Never read or print `.env` / `.env.staging` values; never edit env files.
- `redactForModel` at every new model-input site; event readers filter `retracted_at IS NULL`; client loops filter `clientWorkAllowed` + `agencyServiceable`.
- Engine code logs with `console.*` (engine convention); worker CLIs live in `src/cli/**`.
- No new table, tool, help page or user-facing copy. LF only; scripted edits read/write UTF-8.
- Tests: implementers run focused tests only (`npx vitest run <pattern>` from the package dir for `@cs/engine`/`@cs/demo`); reviewers run none; the final review runs `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` once.
- Paid step (Task 6): cost stated up front, cheapest route (`record --fill`), stop on 402 or a repeated failure.

## Decisions
Spec table D1–D7 (owner-approved 2026-11-07) and plan calls P1–P6. Plan-local: Tasks 7–8 split the guard into plumbing (no behaviour change) and rules; Task 10/11 split the re-score into engine function and CLI.

## File structure
- **demo:** `packages/demo/src/staging/worker-env.ts` (+ `.test.ts`).
- **worker:** `apps/worker/src/env.test.ts`; new `apps/worker/src/cli/rescore.ts`, `rescore-args.ts` (+ `.test.ts`); `apps/worker/package.json`.
- **verticals:** `packages/verticals/src/schema.ts`, `packs/{generic,hvac_plumbing,dental}.yaml`, `src/packs.test.ts`.
- **db:** `packages/db/migrations/0099_vertical_whole_business.sql` (+ journal/snapshot from `generate --custom`), `src/catalog-seed.sql.ts` (regenerated), `src/schema/engine.ts` (`ScoreFactors`), new `src/vertical-whole-business.test.ts`.
- **engine:** `src/score/score.ts`, `score.test.ts`, `score-stage.ts`, new `score/rescore.ts` (+ `.test.ts`), `src/index.ts`; `src/briefs/writer.ts`, `writer.test.ts`, `evidence.ts`, `verify.test.ts`; `src/alerts/write.ts` (+ test); `src/structured/vendor-diff.ts`, `gbp.ts`, `gbp.test.ts`.
- **collectors:** `src/vendors/apify.ts`, `apify.test.ts`, `meta-search.ts`.
- **evals:** `cassettes/briefs.json`, maybe `baselines/briefs.json`, `src/suites/briefs/*.test.ts` if they pin evidence text.
- **docs:** `docs/STAGING.md`, `docs/OPS.md`, `apps/worker/CLAUDE.md`, `packages/engine/CLAUDE.md`, `docs/work/brief-signal.md`.

## Dependencies on in-flight work
None (re-checked 2026-11-07: no unmerged local branch; remote `claude/codebase-competitor-analysis-er337s` and `docs/close-the-gap-decisions` are docs-only; `staging-worker` worktree runs `main` detached and gets this only after merge). Re-check `git branch -a --no-merged main` and the latest migration number in Task 0.

## Review focus
1. The staging guard fails closed: no path lets `VENDOR_FAKE_MODE`/`VENDOR_LIVE_RANK_SCANS`/`WEB_MONITORING_ENABLED` from `.env.staging` or vendor keys from the shell reach the staging worker; error messages name variables, never values.
2. Re-score never creates, merges or withdraws an alert; never touches a featured or alerted pair; a second run changes nothing.
3. Whole-business relevance applies only with no service for the client's vertical and only to `WHOLE_BUSINESS_TYPES`; `tier_change` untouched; old `event_score` rows (no `wholeBusiness`) still read fine.
4. The guard never emits a reverted one-capture glitch (rating or held field), and never suppresses a category/service/hours/status change.
5. Migration 0099 is idempotent, touches only the three shipped rows, and leaves `updated_at` alone.
6. Evidence/wording changes keep every existing rules check (numbers, dates, competitors) passing; `briefs` cassette re-recorded and `eval:replay` green.

---

### Task 0: Pre-flight
**Goal:** a clean, testable worktree.
**Do:** `git status` clean on `brief-signal`; `ls packages/db/migrations | tail -2` shows 0098 last (else renumber 0099 everywhere in this plan); `git branch -a --no-merged main`; `bash scripts/local-test-db.sh start`; confirm the worktree `.env` has the three `TEST_*` names ending `_test` (names only); `pnpm install`; read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of engine, verticals, db, collectors, demo, worker, evals.
**Done when:** `pnpm typecheck` (serially if memory is low: `npx turbo run typecheck --concurrency=1`) and `pnpm eval:replay` both pass on the untouched branch (baseline for Task 6).

### Task 1: Staging worker runs live vendors (D5)
**Goal:** `pnpm staging:up` starts a live-vendor worker and refuses fixture/crawl switches.
**Files:** modify `packages/demo/src/staging/worker-env.ts`, `worker-env.test.ts`, `apps/worker/src/env.test.ts`.
**Interfaces / Behaviour (full code — env guard):**
```ts
const VENDOR_KEYS = ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD', 'APIFY_TOKEN', 'SCRAPECREATORS_API_KEY', 'STADIA_API_KEY'] as const;

const REQUIRED = [
  'STAGING_DB_DIRECT_HOST', 'STAGING_DB_POOLED_HOST', 'WORKER_DATABASE_URL', 'SERVICE_DATABASE_URL', 'SERVICE_DATABASE_POOLED_URL',
  'APP_URL', 'LINK_SIGNING_SECRET', 'EMAIL_FROM', 'POSTMARK_SERVER_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
  'OPENROUTER_API_KEY', 'REVIEWER_HASH_SALT', 'SENTRY_DSN', 'SENTRY_ENVIRONMENT', ...VENDOR_KEYS,
] as const;

/** brief-signal D5 (supersedes STAGING.md "Vendors cost nothing"): staging pays real vendors and crawls nothing. These lines are mistakes, never ignored. */
const REFUSED_IN_FILE: Record<string, string> = {
  VENDOR_FAKE_MODE: 'staging runs live vendors; fixtures are for the rehearsal stack only. Remove the line',
  VENDOR_LIVE_RANK_SCANS: 'staging rank scans are always live now. Remove the line',
  WEB_MONITORING_ENABLED: 'staging crawls no competitor site until https://rivalmonday.app/bot exists. Remove the line',
};
// DROPPED_FROM_SHELL: unchanged list (vendor keys still never come from the shell). LIVE_RANK_PASSED: deleted.

export function stagingWorkerEnv(file: Record<string, string | undefined>, shell: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  for (const [k, why] of Object.entries(REFUSED_IN_FILE)) if (file[k]?.trim()) throw new Error(`Refusing ${k}: ${why}`);
  const missing = REQUIRED.filter((k) => !file[k]?.trim());
  if (missing.length) throw new Error(`Fill in ${missing.join(', ')} in .env.staging`);
  const dummies = VENDOR_KEYS.filter((k) => file[k]!.trim().toLowerCase() === 'fixture');
  if (dummies.length) throw new Error(`Refusing: ${dummies.join(', ')} must be real keys (staging runs live vendors)`);
  if (file.SENTRY_ENVIRONMENT !== 'staging') throw new Error('Refusing: SENTRY_ENVIRONMENT must be staging');
  if (!file.R2_BUCKET!.trim().endsWith('-staging')) throw new Error('Refusing: only a bucket whose name ends in -staging is a target');
  // … the three assertDbUrl calls, unchanged …
  const env: NodeJS.ProcessEnv = { ...shell };
  for (const k of DROPPED_FROM_SHELL) delete env[k];
  for (const k of PASSED) env[k] = file[k]; // PASSED = REQUIRED minus the three file-only names: now includes VENDOR_KEYS
  env.DATABASE_URL = file.WORKER_DATABASE_URL;
  env.NODE_ENV = 'production';
  env.PORT = '8081';
  return env;
}
```
- Update the file's doc comments (no "pays no vendor"). `apps/worker/src/env.ts` unchanged (rehearsal stack still needs the switches on staging).
**Tests (TDD):** `worker-env.test.ts` — fixture `FILE` drops `VENDOR_FAKE_MODE`, adds the five keys: `passes the five vendor keys from the file`; `takes vendor keys from the file, never the shell` (shell `APIFY_TOKEN: 'dev'` → file value); `refuses VENDOR_FAKE_MODE / VENDOR_LIVE_RANK_SCANS / WEB_MONITORING_ENABLED in the file` (`it.each`, message names the key and "Remove the line"); `a blank refused line is ignored`; `names a missing vendor key`; `refuses a fixture dummy key` (`STADIA_API_KEY: 'Fixture'`) without printing other values; existing tests keep passing (delete the live-rank tests). `env.test.ts`: `a live staging env has no rehearsal errors` (`SENTRY_ENVIRONMENT=staging`, `NODE_ENV=production`, real keys, no switches → `[]`); `the rehearsal stack's fixture mode is still allowed on staging`.
**Done when:** from `packages/demo`: `npx vitest run src/staging/worker-env`; `pnpm --filter @cs/worker exec vitest run src/env.test.ts`; `pnpm --filter @cs/demo typecheck`.

### Task 2: Pack field `whole_business` + migration 0099 (D2, P2, P3)
**Goal:** every assembled pack has `scoring.relevance.whole_business = 1` and `scoring.version = 4`, in the DB and in the seed.
**Files:** modify `packages/verticals/src/schema.ts`, `packs/generic.yaml`, `packs/hvac_plumbing.yaml`, `packs/dental.yaml`, `src/packs.test.ts`; regenerate `packages/db/src/catalog-seed.sql.ts` (`pnpm --filter @cs/verticals seed-sql`); create via `pnpm --filter @cs/db generate --custom --name=vertical_whole_business` → `packages/db/migrations/0099_vertical_whole_business.sql`; create `packages/db/src/vertical-whole-business.test.ts`.
**Interfaces:** schema per spec (`whole_business: weight.default(1)`); YAML `relevance: { matched: 1.0, unmapped: 0.6, unmatched: 0.2, outside_territory: 0.3, whole_business: 1.0 }`, `scoring.version: 4`. Pack `version` (top level) stays 3.
**Migration (full SQL):**
```sql
-- brief-signal D2: scoring.relevance.whole_business = 1 and scoring.version 4 for the shipped packs (generic,
-- hvac_plumbing, dental). DB-created verticals have no `scoring` key and inherit generic's via assemblePack's deep merge.
-- vertical.updated_at is left alone on purpose: the review re-ask reads it as "seed topics edited". Idempotent.
-- backfill:start
UPDATE vertical
SET config = jsonb_set(jsonb_set(config, '{scoring,relevance,whole_business}', '1'::jsonb, true), '{scoring,version}', '4'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental')
  AND jsonb_typeof(config #> '{scoring,relevance}') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 4;
```
**Tests (TDD):** `packs.test.ts`: `every shipped pack has whole_business 1 and scoring version 4`; `a pack without the field defaults to 1`. `vertical-whole-business.test.ts` (pattern: `topic-rename.test.ts`, split on `--> statement-breakpoint`, re-run from `-- backfill:start`): set the three rows to the old shape (remove `whole_business`, version 3) plus one DB-created vertical without `scoring`, capture `updated_at`; run the backfill → three rows updated, the created vertical's config byte-equal, `updated_at` unchanged; run again → no change; `createCatalog` over the rows assembles `whole_business: 1`, `version: 4` for all four (generic inheritance).
**Done when:** `pnpm --filter @cs/verticals test`; `pnpm --filter @cs/db exec vitest run src/vertical-whole-business`; `pnpm --filter @cs/db generate` says "No schema changes"; seed regeneration leaves no diff on a second run.

### Task 3: Whole-business relevance in scoring (D2, P1)
**Goal:** whole-business events score with `whole_business` relevance and record it.
**Files:** modify `packages/engine/src/score/score.ts`, `score.test.ts`, `score-stage.ts`; `packages/db/src/schema/engine.ts` (`ScoreFactors` gains `wholeBusiness?`, `rescored?`, `rescoreCap?` exactly as in the spec).
**Interfaces:**
```ts
export const WHOLE_BUSINESS_TYPES: ReadonlySet<ChangeType> = new Set<ChangeType>(['ad_started', 'ad_stopped', 'hiring', 'rank_change', 'review_spike', 'rating_change', 'new_location']);
export function serviceOverlap(serviceId: string | null, clientServices: string[], pack: VerticalPack, changeType: ChangeType): { value: number; wholeBusiness: boolean };
/** score-stage.ts: the ScoreInput for one event and vertical (shared with rescore). */
export function scoreInputFor(ev: typeof changeEvent.$inferSelect, verticalId: string, maxSimilarity: number | null, ageDays: number): ScoreInput;
```
**Behaviour:** rule order per spec; `scoreForClient` uses `.value` for `serviceOverlap` in factors, adds `wholeBusiness`; `tier_change` path unchanged. Doc comment on the set carries the spec table's one-line reasons. `scoreEvent` builds its input with `scoreInputFor` (no behaviour change).
**Tests (TDD):** `score.test.ts`: `rating_change with no service scores 100·0.7·size·1·novelty and wholeBusiness true`; `ad_started with a mapped matching service uses matched, wholeBusiness false`; `ad_started with an unmatched service uses unmatched`; `price_change with no service stays unmapped`; `content with no service stays unmapped`; `client without services → 1, wholeBusiness false`; `new_location outside territory = whole_business × outside_territory`; `review_spike z ≥ 4 reaches the brief bar (60)`; `ad_stopped never reaches 40`; `rating_change Δ0.3, novelty 1 routes alert (70)`; `tier_change unchanged`; `factors.scoringVersion is 4 with the shipped pack`. Existing score-stage tests pass unchanged.
**Done when:** from `packages/engine`: `npx vitest run src/score`; `pnpm --filter @cs/engine typecheck`.

### Task 4: Writers mirror the evidence wording (D4, P5)
**Goal:** brief and alert writers phrase facts the way the evidence does.
**Files:** modify `packages/engine/src/briefs/writer.ts`, `writer.test.ts`, `src/alerts/write.ts` (+ its test).
**Interfaces (decided prompt text — exact):**
```ts
/** brief-signal D4: model text mirrors the evidence's wording so the verifier can match it (brief and alert writers). */
export const EVIDENCE_WORDING = [
  'Describe each change as detected: say it was "detected" or "seen" on the date after "detected on", and never write that a competitor "started", "launched", "began", "opened" or "introduced" something unless the evidence itself uses that word.',
  'Give numbers exactly as the evidence does, with both values of a change (for example "from 4.9 to 4.3"), and keep the evidence\'s dates; never say when the competitor made a change, only when it was detected.',
  'Factual fields (headline, what_changed, body) state only what the evidence shows: no reasons, effects or predictions there; those belong in why_it_matters, hedged with "may" or "possibly".',
].join(' ');
```
**Behaviour:** append `EVIDENCE_WORDING` to the brief `SYSTEM` (after the "Every factual statement…" sentence) and to the alert writer's `SYSTEM` (after its "Every statement…" sentence). Nothing else in either prompt changes.
**Tests (TDD):** `writer.test.ts`: `system prompt contains EVIDENCE_WORDING once`; alert write test: `alert system prompt contains EVIDENCE_WORDING`.
**Done when:** from `packages/engine`: `npx vitest run src/briefs/writer src/alerts/write`.

### Task 5: Clearer evidence lines (D4)
**Goal:** the verifier and writers see "detected on" dates, human channel names and explicit before/after values.
**Files:** modify `packages/engine/src/briefs/evidence.ts`, `writer.ts` (`candidateEvidenceText`), `verify.test.ts`, `writer.test.ts`; add an evidence test to an existing DB test file that covers `loadEventEvidence` (or `src/briefs/gather.test.ts`).
**Interfaces:** `export const EVIDENCE_CHANNEL_LABEL: Record<string, string>` (values in the spec); head line `[${label} · detected on ${YYYY-MM-DD} · ${path}]`, null date → `[${label} · undated · …]`, null path omitted (as today).
**Behaviour:** in `describe()`, for a non-web change with `kind === 'modified'` and both texts, push `Before: "${red(beforeText)}"` and `After: "${red(afterText)}"` after the summary line (before `Items:`/`Numbers:`). Web lines unchanged. `escapeEvidence` still wraps the result. The period header and rules are unchanged; ISO dates stay in the text so `dateTokens` still finds them.
**Tests (TDD):** `writer.test.ts`: `evidence head names the channel and "detected on" date`; `unknown channel falls back to its id`. `verify.test.ts`: `the 4.9 → 4.3 rating sentence passes the rules check against the new evidence` ("…dropped from 4.9 to 4.3, detected on 2026-11-05"); `a date not in the evidence is still rejected`. Evidence test: `a GBP rating change lists Before/After with vote counts`; `a GBP address change lists Before/After`; `web changes keep their Added/Removed/Before/After lines`.
**Done when:** from `packages/engine`: `npx vitest run src/briefs`.

### Task 6: Re-record the briefs eval cassette (D4) — paid
**Goal:** CI `eval:replay` green after Tasks 4–5.
**Files:** `packages/evals/cassettes/briefs.json`, maybe `baselines/briefs.json`; fix `src/suites/briefs/*.test.ts` only where they pin the old evidence text.
**Behaviour:** `pnpm eval:replay` → expect only `briefs` to miss (any other suite missing = stop and report). State the cost up front (full briefs record was $0.55; `--fill` less). Run `pnpm --filter @cs/evals eval record --suite briefs --fill --max-usd 2`; on 402 or two failed runs stop and report. If metrics moved: `eval run --suite briefs --mode replay --update-baseline`. Record the briefs B2 (unsupported claims) result and the verifier drop counts from the run log in the work file (before/after).
**Done when:** `pnpm eval:replay` passes; `git diff --stat packages/evals` shows only the briefs cassette/baseline (+ any pinned-text test).

### Task 7: Vendor-diff history plumbing (D6, no behaviour change)
**Goal:** differs can see up to two older captures, set a change's before capture and report counters.
**Files:** modify `packages/engine/src/structured/vendor-diff.ts`, `gbp.ts` (signature only), `gbp.test.ts`.
**Interfaces:** per spec (`DifferResult`, `SourceDiffer` with `older`, `VENDOR_DIFF_LOOKBACK = 3`, `previousVendorCaptures`, `StructuredChange.beforeCaptureId?`, stage output `{ baseline, changeIds, implausible, held }`). Keep `previousVendorCapture` as `(await previousVendorCaptures(db, cap, 1))[0] ?? null`.
**Behaviour:** `diffVendorCapture` loads `[prev, ...older] = previousVendorCaptures(db, cap, VENDOR_DIFF_LOOKBACK)` (same predicate as today, newest first); normalises an array result to `{ changes, implausible: 0, held: 0 }`; inserts `beforeCaptureId: c.beforeCaptureId ?? prev.id`; `VENDOR_DIFF_VERSION` stays 1 (P3). Ads/jobs/reviews differs unchanged.
**Tests (TDD):** `gbp.test.ts` (DB): `stage output carries implausible 0 and held 0 for an ordinary diff`; `previousVendorCaptures returns ok captures of the same competitor/source/url, newest first, at most limit`; `a change with beforeCaptureId stores it as before_capture_id` (via a stub differ or the Task 8 path). Existing ads/jobs/reviews/gbp tests pass unchanged.
**Done when:** from `packages/engine`: `npx vitest run src/structured`.

### Task 8: GBP plausibility guard rules (D6, P6)
**Goal:** no rating event from a vote-count glitch; address/title/domain only after two agreeing captures.
**Files:** modify `packages/engine/src/structured/gbp.ts`, `gbp.test.ts`.
**Behaviour (full code — non-obvious algorithm):**
```ts
export const VOTES_DROP_MAX_RATIO = 0.2;
export const VOTES_DROP_MAX_ABS = 50;
export const HELD_GBP_FIELDS = ['address', 'title', 'domain'] as const;
export interface GbpSnapshot { captureId: string; profile: GbpProfile }

export function implausibleVotesDrop(before: GbpProfile, after: GbpProfile): boolean {
  const b = before.votes;
  const a = after.votes;
  if (typeof b !== 'number' || typeof a !== 'number' || a >= b) return false;
  return b - a > VOTES_DROP_MAX_ABS || (b - a) / b > VOTES_DROP_MAX_RATIO;
}

const heldValue = (s: GbpSnapshot | undefined, f: (typeof HELD_GBP_FIELDS)[number]) => (present(s?.profile[f]) ? norm(s!.profile[f] as string) : null);
const pick = (from: GbpProfile, to: GbpProfile, key: string) => diffGbpProfiles(from, to).find((c) => c.blockKey === key);

/** snaps newest first: [after, prev, prev2?, prev3?]. */
export function guardedGbpDiff(snaps: GbpSnapshot[]): DifferResult {
  const [after, prev, prev2, prev3] = snaps;
  if (!after || !prev) return { changes: [], implausible: 0, held: 0 };
  const guarded = new Set(['gbp:rating', ...HELD_GBP_FIELDS.map((f) => `gbp:${f}`)]);
  const changes = diffGbpProfiles(prev.profile, after.profile).filter((c) => !guarded.has(c.blockKey));
  let implausible = 0;
  let held = 0;
  // (a) A glitch capture that `after` recovered from is not a baseline (P6).
  const base = prev2 && implausibleVotesDrop(prev2.profile, prev.profile) && !implausibleVotesDrop(prev2.profile, after.profile) ? prev2 : prev;
  const rating = pick(base.profile, after.profile, 'gbp:rating');
  if (rating) {
    if (implausibleVotesDrop(base.profile, after.profile)) implausible++;
    else changes.push(base === prev ? rating : { ...rating, beforeCaptureId: base.captureId });
  }
  // (b) Emit once the new value is seen twice, from the last confirmed value.
  for (const f of HELD_GBP_FIELDS) {
    const now = heldValue(after, f);
    const last = heldValue(prev, f);
    if (now === null || last === null) continue;
    if (now !== last) { held++; continue; }
    const v2 = heldValue(prev2, f);
    if (v2 === null || v2 === now) continue;
    const v3 = heldValue(prev3, f);
    const from = prev3 && v3 !== null && v3 !== v2 ? prev3 : prev2!;
    if (heldValue(from, f) === now) continue;
    const c = pick(from.profile, after.profile, `gbp:${f}`);
    if (c) changes.push({ ...c, beforeCaptureId: from.captureId });
  }
  return { changes, implausible, held };
}
```
- `diffGbp` loads the `gbp_profile` observations of `[cap, prev, ...older]` in one query, keeps the leading run that has a profile, returns `guardedGbpDiff(snaps)` (needs ≥ 2), and logs `console.info('[engine] vendor_diff <capture id>: <n> implausible rating change(s) suppressed, <m> GBP field change(s) held')` when either is > 0. `diffGbpProfiles` itself is unchanged (pure field diff).
**Tests (TDD):** pure `guardedGbpDiff`: `548 to 3 votes, 4.9 to 4.3: no change, implausible 1`; `51 of 1000 votes lost suppresses`; `10 to 9 votes keeps it`; `unknown votes keep it`; `recovery A G A: no change`; `real purge suppressed once, then diffs normally`; `address A,B: held 1`; `A,B,B: A to B, beforeCaptureId of A`; `A,G,A,A: nothing`; `A,A,B,B then B: one change`; `A,A,B,C,C: A to C`; `title and domain alike`; `missing value in prev2: nothing`; `category/service/hours/status unguarded`. DB: `four GBP captures store the confirmed address change with before_capture_id of the from capture`.
**Done when:** from `packages/engine`: `npx vitest run src/structured/gbp`.

### Task 9: Ledger Apify Meta-ads cost (D7)
**Goal:** every Apify page run ledgers an estimate.
**Files:** modify `packages/collectors/src/vendors/apify.ts`, `apify.test.ts`, `meta-search.ts`.
**Interfaces:** `export const APIFY_COST_PER_AD_USD = 0.00075; export const apifyCostUsd = (count: number): number => count * APIFY_COST_PER_AD_USD;` in `apify.ts`; `meta-search.ts` drops its local `apifyCostUsd` and sets `META_SEARCH_COST_USD = { scrapecreators: 0.01, apifyPerAd: APIFY_COST_PER_AD_USD }`.
**Behaviour:** `fetchMetaAdsApify` ledgers `costUsd: apifyCostUsd(items.length)` (error items are not ads and not counted; a failed run ledgers 0). Fixture mode still zeroes via `zeroFixtureVendorCosts`.
**Tests (TDD):** `apify.test.ts`: `ledgers 0.00075 per returned ad` (3 ads → 0.00225); `ADS_NOT_FOUND ledgers 0`; `HTTP error ledgers 0 with ok false`. Existing meta-search tests pass.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/vendors/apify src/vendors/meta-search`.

### Task 10: `rescoreRecent` engine function (D3, P4)
**Goal:** re-score recent un-featured pairs in place, safely.
**Files:** create `packages/engine/src/score/rescore.ts`, `rescore.test.ts`; export from `packages/engine/src/index.ts`.
**Interfaces:** `RescoreOptions`, `RescoreResult`, `rescoreRecent` exactly as in the spec.
**Behaviour:**
- Select per spec (Drizzle; featured = `EXISTS (brief_item bi JOIN brief b … b.client_id = s.client_id AND b.status <> 'failed' AND bi.event_ids ? e.id::text)`, alerted = old route `alert` or `EXISTS alert_event` for the pair). Count skips by reason (featured first, then alerted, then current).
- Per pair: `pack = packs(c.verticalId)`; skip as current when `factors.scoringVersion >= pack.scoring.version`; thresholds from `loadClientRunbook(deps, c.id)` (cache per client in the run); input `scoreInputFor(ev, c.verticalId, oldFactors.maxSimilarity, ageDays)` with `ageDays = (oldScoredAt − occurredAt) / day`; `scoreForClient`.
- `alert` result → route `brief`, `rescoreCap: true`, `capped++`. Factors get `rescored: { at, score, route, scoringVersion }` (old values).
- Unless `dryRun`: `UPDATE event_score SET score, route, factors, pack_version[, scored_at = now when old 'archive' and new 'brief'] WHERE client_id AND event_id AND (factors->>'scoringVersion')::int = <old>`; count only rows actually updated. Transition key `${old}->${new}`.
- Follow pattern: `score-stage.ts` (`scoreEvent`) for the client filters and pack loading.
**Tests (TDD, DB):** `archive vendor event re-scored to brief and scored_at moves to now`; `brief stays brief and keeps scored_at`; `featured pair is skipped and unchanged`; `failed-brief item does not count as featured`; `old alert route or alert_event pair skipped`; `a re-score that reaches 70 is stored brief with rescoreCap`; `no alert row exists after a sweepAlerts run following rescore`; `second run: all current, nothing updated`; `dryRun writes nothing but reports the same transitions`; `retracted event, paused client, tier_change and out-of-window rows are not considered`; `--client limits to one client`.
**Done when:** from `packages/engine`: `npx vitest run src/score`.

### Task 11: `rescore` worker CLI (D3)
**Goal:** `pnpm --filter @cs/worker rescore [--since-days N] [--client <uuid>] [--dry-run]`.
**Files:** create `apps/worker/src/cli/rescore.ts`, `rescore-args.ts`, `rescore-args.test.ts`; modify `apps/worker/package.json` (`"rescore": "tsx src/cli/rescore.ts"`).
**Interfaces:** `export const RESCORE_USAGE: string; export function parseRescoreArgs(argv: string[]): { sinceDays: number; clientId?: string; dryRun: boolean } | { error: string }`.
**Behaviour:** `parseArgs` (strict, no positionals); `--since-days` integer 1–30 (default 14); `--client` lower-cased UUID; errors end with the usage. CLI mirrors `runbook-backfill.ts`: loads the root `.env` (4 levels up), needs `SERVICE_DATABASE_URL`, `createCatalog(() => catalogRows(db))`, calls `rescoreRecent`, prints `Rescore (dry run|applied): last <n> days, <client|all clients>`, then `considered … rescored … capped … skipped featured/alerted/current`, then one `old->new: n` line per transition (sorted); exit 1 with the message on error; always closes the DB.
**Tests (TDD):** `rescore-args.test.ts`: `defaults to 14 days, all clients, applied`; `--dry-run`; `--since-days 0 / 31 / abc refused`; `--client not a uuid refused`; `unknown flag refused`; `positional refused`.
**Done when:** `pnpm --filter @cs/worker exec vitest run src/cli/rescore-args`; `pnpm --filter @cs/worker typecheck`.

### Task 12: Docs and owner steps
**Goal:** runbooks match the new behaviour; the owner can verify.
**Files:** modify `docs/STAGING.md`, `docs/OPS.md`, `apps/worker/CLAUDE.md`, `packages/engine/CLAUDE.md`, `docs/work/brief-signal.md`.
**Behaviour:**
- `STAGING.md`: line 27 → "Vendors are live, like pilot" (real DataForSEO/Apify/ScrapeCreators/Stadia calls, per-client spend limits apply, web monitoring stays off); § 2: replace the "Real rank scans (optional)" block with the required worker vendor-key lines (no `VENDOR_FAKE_MODE`, `VENDOR_LIVE_RANK_SCANS` or `WEB_MONITORING_ENABLED`; the worker refuses them); line 224: vendor keys go in `.env.staging` for the worker only; § 5 cost row: "about $2–4 a week for ~5 clients (vendors) + ~$1.5 AI"; § 7 troubleshooting rows for `Refusing VENDOR_FAKE_MODE…` and `must be real keys`; a one-time "Switch to live vendors" box (owner steps below).
- `OPS.md` § Databases: `cs_dev` has no worker since 2026-10-30 (the owner's worker runs staging), so its data is idle; after 0099, `pnpm --filter @cs/worker rescore --dry-run` then without it. Short `rescore` entry (flags, alert rule).
- `apps/worker/CLAUDE.md`: `VENDOR_LIVE_RANK_SCANS` = rehearsal stack only; permanent staging is live (`stagingWorkerEnv` refuses fixture/crawl switches). `rescore` CLI one-liner.
- `packages/engine/CLAUDE.md`: GBP guard (votes drop rule, held fields, no version bump), whole-business relevance, re-score alert rule.
- Work file: Status, Owner verification steps (already drafted), measured before/after from Task 6.
**Done when:** `git diff --stat` shows docs only; `wc -c docs/work/brief-signal.md` ≤ 12 KB; no `crlf` in `git ls-files --eol` for touched files.

### Final review (controller)
Most capable model reviews the whole diff against the Review focus; then `pnpm test:affected` and `pnpm --filter @cs/web e2e:affected` once (background; `@cs/engine` makes it ~70 min), `pnpm eval:replay`, `pnpm typecheck`. One fix wave. Full unit + E2E only in `/rm-merge` after asking the owner.
