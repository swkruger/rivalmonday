# brief-signal — design (new decisions and interfaces only)

**Branch:** `brief-signal` · **Brief:** `docs/work/brief-signal.md` · **Core spec:** §6.1 (change detection), §6.3 (scoring & routing), §7.4/§9.1 (verifier), §7.5 (cost ledger), §11 (never send unverified). Nothing here restates them.

## Why (measured, cs_dev + staging, 2026-10-26 → 11-09)
1. Vendor events carry no service, so `serviceOverlap` = `unmapped` 0.6 caps them below the brief bar 40 (ad_started/review_spike ≤ 36, hiring/rank ≤ 30): 12 of 14 events archived in the week of 10-26.
2. The verifier drops true sentences whose wording differs from the evidence ("dropped from 4.9 to 4.3 as of November 5" vs "Google rating 4.9 → 4.3 (3 reviews) [google_business_profile · 2026-11-05]": Jev false@0.04). τ 0.85 is binding and stays.
3. Staging answers every vendor from fixtures (all GBP = 4.3 / 3 votes): 267 bogus events in one week; staging cannot show pilot behaviour.
4. `diffGbpProfiles` turns a 548 → 3 vote glitch into a `rating_change`; one-off address/title/domain glitches become events.
5. Apify Meta-ads calls are ledgered at `costUsd: null`, so spend caps under-count them.

## Decisions (owner-approved 2026-11-07 unless marked "plan call")
| # | Decision |
|---|---|
| D1 | One branch `brief-signal`. Order: staging live → scoring → verifier wording/evidence → plausibility guard → Apify cost → re-score CLI → docs. |
| D2 | New pack field `scoring.relevance.whole_business` = 1.0 in `generic`, `hvac_plumbing`, `dental`, used instead of `unmapped` when the event's type is in the engine's whole-business set and it has no service for the client's vertical. Brief bar stays 40; the §6.3 formula is unchanged except this relevance input. `scoring.version` 3 → 4. Migration **0099** updates `vertical.config` of the shipped packs; YAML + `catalog-seed.sql.ts` regenerated. `event_score.factors.wholeBusiness` records it. |
| D3 | One-off worker CLI `rescore` re-scores un-featured event × client pairs scored in the window, in place, with the current pack; never creates alerts (rule below); idempotent. |
| D4 | τ stays 0.85, fail-closed; `support.ts` question text unchanged. Only the writers' wording rules and the evidence lines change. `briefs` eval cassette re-recorded (`record --fill`, ≤ $5). Owner labels `verifier_decisions` samples. |
| D5 | Staging worker runs live vendors (DataForSEO, Apify, ScrapeCreators, Stadia) like pilot/prod. `stagingWorkerEnv` refuses `VENDOR_FAKE_MODE`, `VENDOR_LIVE_RANK_SCANS` and `WEB_MONITORING_ENABLED` in `.env.staging` and requires real vendor keys. Fixtures remain only for the DEPLOY.md rehearsal stack. **Supersedes STAGING.md:27 "Vendors cost nothing" (owner, 2026-11-07).** Owner resets staging with `staging-refresh` from cs_dev. |
| D6 | Plausibility guard in the GBP structured diff: (a) no `rating_change` when the vote count drops > 20 % or by > 50; (b) address / title / domain changes are emitted only once the new value is seen in 2 consecutive captures. State = earlier captures (no new table). Counters in the stage output + an info log; no ops alert. |
| D7 | Apify Meta-ads runs are ledgered per item at the keyword-search rate (`$0.00075`/ad). |
| P1 | *Plan call:* whole-business set = `ad_started`, `ad_stopped`, `hiring`, `rank_change`, `review_spike`, `rating_change`, `new_location` (table below); `content`, `tier_change` and the web/service types are excluded. |
| P2 | *Plan call:* schema default for `whole_business` = **1.0**. Every DB-created vertical has no `scoring` key and inherits generic's (deep merge in `assemblePack`), and the set is an engine constant that routes the same types for every pack, so a pack without the field behaves like the shipped ones. |
| P3 | *Plan call:* `vertical.version` (pack version) is not bumped and 0099 leaves `vertical.updated_at` alone (the review re-ask reads it as "seed topics edited"). `VENDOR_DIFF_VERSION` is not bumped (a bump re-diffs every past capture and supersedes live changes): the guard applies to new diffs only. |
| P4 | *Plan call:* the re-score keeps the stored `factors.maxSimilarity` (no embedding queries) and the age at first scoring; thresholds and pack are current. |
| P5 | *Plan call:* the same wording rules go into the alert writer prompt (it reads the same evidence and the verifier drops its headlines the same way). |
| P6 | *Plan call:* a rating glitch that recovers in the next capture is compared with the capture before the glitch (no "4.3 → 4.9" event on recovery). |

## Interfaces

### Pack schema (`@cs/verticals` `schema.ts`)
```ts
relevance: z.object({
  matched: weight.default(1), unmapped: weight.default(0.6), unmatched: weight.default(0.2), outside_territory: weight.default(0.3),
  /** brief-signal D2: relevance of a whole-business event (type in WHOLE_BUSINESS_TYPES, no service for the vertical). */
  whole_business: weight.default(1),
}).prefault({}),
```
YAML: `relevance: { matched: 1.0, unmapped: 0.6, unmatched: 0.2, outside_territory: 0.3, whole_business: 1.0 }`, `scoring.version: 4` in all three packs.

### Scoring (`@cs/engine` `score/score.ts`)
```ts
export const WHOLE_BUSINESS_TYPES: ReadonlySet<ChangeType>;
export function serviceOverlap(serviceId: string | null, clientServices: string[], pack: VerticalPack, changeType: ChangeType): { value: number; wholeBusiness: boolean };
```
Rule: client has no services → `{1, false}`; service set → matched/unmatched, `false`; no service and type ∈ set → `{whole_business, true}`; else `{unmapped, false}`. `tier_change` keeps its deterministic score.

| Type | Why whole-business when it has no service |
|---|---|
| `review_spike`, `rating_change` | Reviews/rating are about the business; the tag stage never maps a service. |
| `new_location` | A new address (GBP) or location page is the whole business; territory still applies (`TERRITORIAL_TYPES`). |
| `ad_started`, `ad_stopped` | Service-mapped by the tag stage; "none" = branding / general ad = the whole business. `ad_stopped` (weight 0.3) still never reaches 40. |
| `hiring` | Service-mapped; "none" = general hiring (capacity of the whole business). |
| `rank_change` | Keyword → service by phrase; no match = generic keyword ("hvac company near me"). |
| excluded: `content` | Shared with web page edits (no service = generic copy). GBP title/domain/hours/status changes stay `unmapped`. |
| excluded: `tier_change` | Deterministic score (P10). |
| excluded: `price_change`, `promo`, `new_service`, `service_removed`, `service_area_change`, `cosmetic` | Service-specific by nature: no service = the tagger could not map it; `unmapped` stays right. |

New maxima (weight × 1 × 1 × novelty 1): rating_change 70, new_location 54 (no `sizeFactor` case, size 0.6), ad_started/review_spike 60, hiring/rank_change 50. **Only rating_change can reach the alert bar** (guarded by D6); new_location tops out at 54 (brief).

`ScoreFactors` (`@cs/db` `schema/engine.ts`, JSON only, no migration) adds:
```ts
/** brief-signal D2: relevance came from scoring.relevance.whole_business. */
wholeBusiness?: boolean;
/** brief-signal D3: set by the rescore CLI; the previous score/route/version and when. */
rescored?: { at: string; score: number; route: 'alert' | 'brief' | 'archive'; scoringVersion: number };
/** brief-signal D3: an alert route produced by a re-score, stored as brief. */
rescoreCap?: boolean;
```

### Migration 0099 (`vertical_whole_business`)
Custom SQL: sets `config #> '{scoring,relevance,whole_business}' = 1` and `config #> '{scoring,version}' = 4` for `generic`, `hvac_plumbing`, `dental` where `scoring.relevance` exists and version < 4. Idempotent, `-- backfill:start` re-run test, no `updated_at` change (P3). Full SQL in the plan.

### Re-score (`@cs/engine` `score/rescore.ts`, CLI `apps/worker/src/cli/rescore.ts`)
```
pnpm --filter @cs/worker rescore [--since-days <1-30, default 14>] [--client <uuid>] [--dry-run]
```
```ts
export interface RescoreOptions { sinceDays: number; clientId?: string; dryRun: boolean; now?: Date }
export interface RescoreResult {
  considered: number; rescored: number; capped: number;
  skipped: { featured: number; alerted: number; current: number };
  transitions: Record<string, number>; // "archive->brief": n, …
}
export async function rescoreRecent(deps: { db: Db; packs: PackLoader; generic: () => Promise<VerticalPack> }, opts: RescoreOptions): Promise<RescoreResult>;
```
Selection: `event_score` rows with `scored_at > now − sinceDays`, event not retracted, not `tier_change`, client `clientWorkAllowed` + `agencyServiceable`, optional client filter. Skips (counted): **featured** (event in an item of the client's non-failed brief — same predicate as `featuredBefore`), **alerted** (old route `alert` or an `alert_event` row for the pair), **current** (`factors.scoringVersion` ≥ the pack's). Update in place: score, route, factors (+`rescored`), `pack_version`; guarded by the old `scoringVersion` (concurrent-safe, idempotent).
**Alert rule:** a re-score never produces `route = 'alert'` (stored `brief`, `rescoreCap: true`); alerted pairs are never touched, so no alert is created or withdrawn for an old event.
**Brief window:** `scored_at = now()` only when the route moves `archive → brief` (the event enters the next brief period, still bounded by `BRIEF_EVENT_MAX_AGE_DAYS`); every other row keeps its `scored_at`.
Prints `considered / rescored / capped / skipped` and one `old->new: n` line per transition; `--dry-run` computes the same and writes nothing.

### Writers and evidence (`@cs/engine` `briefs/`, `alerts/write.ts`)
- `writer.ts` exports `EVIDENCE_WORDING: string` (exact text in the plan), appended to the brief writer's and the alert writer's system prompts.
- Evidence head line: `[<channel label> · detected on <YYYY-MM-DD> · <path>]` (was `[<channel> · <date> · <path>]`); `EVIDENCE_CHANNEL_LABEL: Record<string, string>` in `evidence.ts` (`web` Website, `google_ads` Google Ads, `meta_ads` Meta ads, `google_business_profile` Google Business Profile, `google_reviews` Google reviews, `google_jobs` Google Jobs, `rank` Local map rankings); unknown channel = raw id; null date = `undated`.
- `describe()` for a structured `modified` change with both texts adds `Before: "<text>"` / `After: "<text>"` lines (redacted, truncated like web lines) under the summary, e.g. `Before: "rating 4.9 (548 reviews)"`, `After: "rating 4.3 (3 reviews)"`. `buildStructuredSummary` is unchanged (it also writes stored event summaries and embeddings).
- `verify.ts`, `support.ts`, `rules.ts`: unchanged.

### Plausibility guard (`@cs/engine` `structured/`)
```ts
// vendor-diff.ts
export interface DifferResult { changes: StructuredChange[]; implausible: number; held: number }
export type SourceDiffer = (db: Db, cap: CaptureRow, prev: CaptureRow, older: CaptureRow[]) => Promise<StructuredChange[] | DifferResult>;
export const VENDOR_DIFF_LOOKBACK = 3; // prev + up to 2 older ok captures, newest first
export async function previousVendorCaptures(db: Db, cap: CaptureRow, limit: number): Promise<CaptureRow[]>;
// StructuredChange gains: beforeCaptureId?: string  (overrides prev.id as detected_change.before_capture_id)
// stage output: { baseline: boolean; changeIds: string[]; implausible: number; held: number }
// gbp.ts
export const VOTES_DROP_MAX_RATIO = 0.2;
export const VOTES_DROP_MAX_ABS = 50;
export const HELD_GBP_FIELDS = ['address', 'title', 'domain'] as const;
export function implausibleVotesDrop(before: GbpProfile, after: GbpProfile): boolean;
export interface GbpSnapshot { captureId: string; profile: GbpProfile }
export function guardedGbpDiff(snaps: GbpSnapshot[] /* newest first: [after, prev, prev2?, prev3?] */): DifferResult;
```
- (a) Rating: baseline = `prev`, except `prev2` when `prev` was an implausible drop from `prev2` and `after` is not (P6). An implausible drop baseline → after suppresses the rating change (`implausible++` if the rating moved ≥ 0.1). Unknown vote counts → no guard (today's behaviour).
- (b) Held fields: a value differing from `prev` is not emitted (`held++`). When `after` equals `prev` and differs from `prev2`, the change is emitted from the last confirmed value: `prev2`, or `prev3` when `prev3` differs from `prev2` (so a one-capture glitch that reverts never emits, and A→B blip→C emits A→C). Missing values → nothing emitted. `beforeCaptureId` = the "from" capture.
- Category/service/hours/status changes are untouched. A real vote purge stays suppressed only for the capture that shows it; later captures diff against it normally.

### Apify cost (`@cs/collectors`)
`apify.ts` exports `APIFY_COST_PER_AD_USD = 0.00075` and `apifyCostUsd(count: number): number`; `fetchMetaAdsApify` ledgers `costUsd: apifyCostUsd(items.length)`; `meta-search.ts` reuses both (`META_SEARCH_COST_USD.apifyPerAd = APIFY_COST_PER_AD_USD`).

### Staging env (`@cs/demo` `staging/worker-env.ts`)
- `REQUIRED` drops `VENDOR_FAKE_MODE`, adds `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `APIFY_TOKEN`, `SCRAPECREATORS_API_KEY`, `STADIA_API_KEY` (all passed from the file; the shell's copies are still dropped).
- Refused in the file (any non-blank value), checked before the missing list: `VENDOR_FAKE_MODE`, `VENDOR_LIVE_RANK_SCANS`, `WEB_MONITORING_ENABLED`, each with a "remove the line" message. A vendor key equal to `fixture` is refused.
- `apps/worker/src/env.ts` is unchanged: `rehearsalEnvErrors` still allows the switches on staging for the rehearsal stack, and a live staging env (no switches, real keys) yields no errors (new test).

## Quality gates
No new table (no `TABLE_CLASS`/world rows), no new tool (no `ISOLATION_FIXTURES`), no user-facing copy, no help page. CI `eval:replay`: `briefs` misses (writer prompt + evidence text) → re-record in the branch.

## Non-goals
No τ change and no verifier routing change; no web monitoring; no brief-bar or alert-threshold change; no alert routing change beyond what the relevance input implies; no change to `buildStructuredSummary` or stored event summaries; no review-spike threshold knobs (backlog stays); no fixture mode on the permanent staging.
