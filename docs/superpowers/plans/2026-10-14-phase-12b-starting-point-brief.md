# Phase 12b — Starting-point brief & "Where you stand" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces are binding; full code only for SQL/RLS, security-sensitive logic, non-obvious algorithms and decided copy.

**Goal:** A new client gets a "Starting point" brief within about two days (tiles, scorecard and 3–5 evidence-backed findings with recommendations), and every later quiet week shows "Where you stand" instead of one sentence.

**Architecture:** A `Scorecard` builder in `@cs/engine` reuses the review benchmark, rating/reply-rate logic (extracted from the tool), rank metrics and 12a's `competitor_signal`; deterministic pack **self-rules** produce `subject: 'self'` brief items; a `starting-point` schedule job runs the existing writer → verifier → approval path; one `scorecardModel` view-model feeds web and email renderers.

**Tech Stack:** TypeScript, Drizzle + Postgres, pg-boss, `@cs/engine`, `@cs/tools`, React Email, Next.js, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-phase-12-discovery-and-starting-point-design.md` — decisions D10–D13 and § 12b. Read it in full before Task 1.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package touched before coding.
- **No evidence, no claim; never pad.** Every finding's fact sentence is a fixed template filled from computed values and carries `evidence_ids`; model text only for `why_it_matters`/`recommended_action`, through the existing two-layer verifier. Model input via `redactForModel`.
- `upsell_tag` never client-facing. Brief schedulers: `client.status = 'active'` (+ phase-9 `agencyServiceable` if on main, as 12a P6). Event readers filter `retracted_at IS NULL`.
- `null` = not measured; show "—", never 0. ▲/▼ colour always paired with text.
- Migrations: next free number at execution time; never edit applied ones.
- Copy (decided, verbatim): web title "Your starting point"; chip "Starting point · {date}"; intro "Where {client} stands against the {n} rivals we now watch. Weekly briefs from here show what changes."; quiet sections "Where you stand", "First moves still open"; fallback item headline "Your baseline is set" with body "We now track your profile, reviews and map rankings. Weekly briefs will show what changes."; AM notice "Your starting point brief for {client} is ready to review."; email subject "Your starting point with {agencyProduct}"; client home "Preparing your starting point" with checks "Your Google profile", "Your reviews", "Map rankings", "Competitors"; tile labels "Rating", "New reviews · 90 d", "Reply rate", "Top-3 in map pack"; tile sub-line "rivals {median} median".
- Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only.

## Decisions (plan-local)
- **Q1** Rank scans start recording a vendor capture per snapshot (`rank_snapshot.capture_id`), so map figures have evidence. Clients whose latest scan predates this get the map tile (dashboard figure, like the Rankings page) but the `map_visibility_gap` rule is skipped.
- **Q2** On approval a `starting_point` brief is sent immediately via `sendBriefNow`; `deliverDueBriefs` ignores `starting_point` briefs.
- **Q3** `generateBrief`'s previous-period query, `finalBriefSummary` and `listBriefDueClients` exclude `kind = 'starting_point'`; a weekly brief on the same `delivery_date` as a starting point is skipped (existing unique key).
- **Q4** `loadBriefView` left-joins `competitor`; `BriefItemView.competitorId` becomes `uuid | null` with `subject`.
- **Q5** The rating/reply-rate logic moves out of the `get_rating_trend` handler into `packages/engine/src/reviews/rating-trend.ts` (`ratingTrend`), used by both the tool and the scorecard (pure refactor, same output).

## File structure
- `packages/db/src/schema/briefs.ts`, `tenancy.ts` (`client.activatedAt`), `client-intel.ts` (rank snapshot capture already exists as column) + migration.
- `packages/collectors/src/rankings/scan.ts` (capture per snapshot).
- `packages/engine/src/reviews/rating-trend.ts` (new); `packages/tools/src/tools/reputation.ts` (use it).
- `packages/engine/src/briefs/{scorecard.ts,self-rules.ts,starting-point.ts,readiness.ts}` (new); `generate.ts`, `summary.ts`, `deliver.ts`, `review.ts`, `notify.ts` (modify).
- `packages/verticals/src/schema.ts` + both packs (`self_rules`, new playbooks; `version: 3`); `packages/core/src/domain.ts` (`SELF_RULE_IDS`).
- `apps/worker/src/jobs/briefs.ts` (+ `starting-point-schedule`, `starting-point-client`).
- `packages/tools/src/tools/{briefs.ts,overview.ts,schemas.ts}` (`get_starting_point_status`, view types).
- `apps/web/src/components/views/{brief-view.tsx,scorecard.tsx}`, `components/client-home-basic.tsx`, `app/(app)/c/[clientId]/page.tsx`.
- `packages/email/src/templates/{brief.tsx,scorecard.tsx}`, `types.ts`.
- `packages/demo/src/*`, `coverage.ts`; `apps/web/e2e/starting-point.spec.ts`.

## Dependencies on in-flight work
- **phase-12a must be merged or stacked first**: `competitor_signal`, `Signals`, `Tier`, pack `version: 2`. Re-check names at Task 0.
- **phase-9**: `agencyServiceable`, migrations 0052–0053. **phase-10**: `create_client` edits.

## Review focus
1. A client with zero tracked competitors: starting point still generates with a self-only scorecard (rival medians "—") and only rules that need no rivals; nothing throws.
2. A client with no reviews at all (new business): reply rate / velocity are `null`, rules that need them are skipped, fallback item appears if nothing else qualifies.
3. The verifier drops every model sentence for an item: the item keeps its fixed fact and playbook action (fallback to playbook text), never an empty card.
4. The same client hit by both the hourly starting-point job and a weekly brief on the same date: exactly one brief exists for that date; no duplicate send.
5. A client user must never see `upsell_tag` or agency-only notes in the starting-point brief (web, email, PDF, MCP `get_brief`).

---

### Task 0: Pre-flight
- [ ] `git rebase main` (12a merged or this branch stacked on 12a); re-check dependencies; set migration numbers; record drift in `docs/work/phase-12.md`.
- **Done when:** `pnpm test:affected` green.

### Task 1: Schema + migration
**Goal:** brief kind, scorecard, self items, `activated_at`.
**Files:** `schema/briefs.ts`, `schema/tenancy.ts`, generated + custom migration.
**Migration (full, custom part):**
```sql
ALTER TABLE brief DROP CONSTRAINT brief_kind_check;
--> statement-breakpoint
ALTER TABLE brief ADD CONSTRAINT brief_kind_check CHECK (kind IN ('standard','quiet','starting_point'));
--> statement-breakpoint
CREATE UNIQUE INDEX brief_one_starting_point ON brief (client_id) WHERE kind = 'starting_point';
--> statement-breakpoint
ALTER TABLE brief_item ADD CONSTRAINT brief_item_subject_check CHECK (subject = 'self' OR competitor_id IS NOT NULL);
--> statement-breakpoint
UPDATE client SET activated_at = created_at WHERE activated_at IS NULL AND status = 'active';
```
Generated part: `brief.scorecard jsonb`, `brief_item.competitor_id` nullable, `brief_item.subject text NOT NULL DEFAULT 'competitor' CHECK (subject IN ('self','competitor'))`, `client.activated_at timestamptz`. No new grants (columns inherit table grants; RLS unchanged).
**Interfaces:** `BriefKind = 'standard'|'quiet'|'starting_point'`; `BriefItemSubject = 'self'|'competitor'`.
**Behaviour:** `convert_prospect` sets `activated_at = now()`; `create_client` with status active sets it too.
**Tests:** `second starting_point for a client fails`, `self item without competitor ok`, `competitor item without competitor fails`, `convert sets activated_at`.
**Done when:** `pnpm --filter @cs/db test` and tools `prospects onboarding` green.

### Task 2: Rank-scan evidence
**Goal:** each rank snapshot stores its raw Maps response as vendor evidence.
**Files:** `collectors/src/rankings/scan.ts` + test.
**Behaviour:** after each successful point, `recordVendorCapture(...)` (existing, `evidence/vendor-capture.ts`) with the raw task JSON; set `rank_snapshot.capture_id`. A capture failure logs and leaves `capture_id` null (scan continues).
**Tests:** `snapshot gets capture_id and evidence row`, `capture failure keeps scan going`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run scan` green.

### Task 3: `ratingTrend` extraction + scorecard builder
**Goal:** Q5 refactor and the `Scorecard` from spec § 12b Data.
**Files:** `engine/src/reviews/rating-trend.ts`, `tools/src/tools/reputation.ts`, `engine/src/briefs/scorecard.ts` + tests.
**Interfaces:**
```ts
export function ratingTrend(deps: { db: Db }, clientId: string, opts: { now?: Date }): Promise<{ businesses: { competitorId: string; name: string; self: boolean; rating: number|null; reviews90d: number; replyRate: number|null; evidenceIds: string[] }[] }>;
export const Scorecard = /* exactly as spec */;
export function buildScorecard(deps: { db: Db; packs: PackLoader }, clientId: string, opts: { now?: Date; baseline?: Scorecard | null; openFirstMoves?: { recommendationId: string; title: string }[] }): Promise<Scorecard>;
export function median(xs: (number|null)[]): number|null; // ignores null; empty → null
```
**Behaviour:** rows = self first, then tracked competitors ordered by tier (top, watch, minor, unrated) then name. Values: rating/replyRate/reviews90d from `ratingTrend`; `mapTop3Share` from the latest finished scan via `rankMetrics` (self and each competitor via `competitorMatcher`); `adsActive`/`metaAdsActive` from `competitor_signal.signals` (self: count active `ad` rows if any, else null). Tiles fixed order rating, reviews90d, replyRate, mapTop3Share; `rivalMedian` over competitors; `deltaSinceStart = you − baseline.you` when a baseline is given. `evidenceIds` = union of contributing review/observation/rank-snapshot capture evidence ids (dedupe, cap 50).
**Tests:** `get_rating_trend output unchanged (golden)`, `median ignores null`, `no competitors → rivalMedian null`, `deltaSinceStart computed against baseline`, `tier ordering of rows`.
**Done when:** engine `scorecard rating-trend` and tools `reputation` tests green.

### Task 4: Self-rules + playbooks in packs
**Goal:** spec § Self-rules as a closed predicate set, plus playbooks for each rule.
**Files:** `engine/src/briefs/self-rules.ts`, `verticals/src/schema.ts`, both packs (`version: 3`), `core/src/domain.ts` + tests.
**Interfaces:**
```ts
export const SELF_RULE_IDS = ['review_velocity_gap','reply_rate_gap','rating_gap','rival_only_advertiser','theme_weakness','theme_strength','map_visibility_gap','profile_gap'] as const;
export type SelfFinding = { ruleId: SelfRuleId; strength: boolean; score: number; fact: string; values: Record<string, number|string>; evidenceIds: string[]; playbookId: string };
export function evaluateSelfRules(input: { scorecard: Scorecard; themes: BenchmarkBusiness[]; profile: { claimed: boolean|null; hasHours: boolean|null; categoryCount: number|null }; rules: PackSelfRule[]; rankHasEvidence: boolean }): SelfFinding[]; // ranked, ≤5, ≤1 strength
```
Pack schema: `self_rules: z.array(z.strictObject({ id: z.enum(SELF_RULE_IDS), weight: z.number().min(0).max(1), playbook: z.string(), strength: z.boolean().default(false), params: z.record(z.string(), z.number()).default({}) }))`; playbook `trigger` enum gains `SELF_RULE_IDS`. Thresholds from the spec go into `params` (e.g. `review_velocity_gap: { ratio: 0.5 }`).
**Behaviour:** predicates exactly as the spec conditions; rules needing rivals skipped when `rivalMedian` null; `map_visibility_gap` skipped when `!rankHasEvidence`; `theme_*` use `shareDelta` of the self row vs rival median share, positive/negative from theme sentiment; score = `weight × min(1, |gap| / normaliser)` (normalisers: velocity ratio, reply 0.5, rating 1.0, theme 0.3, map 0.5, profile 1). Fact templates (decided copy): velocity "You got {you} new reviews in 90 days; {topRival} got {theirs}."; reply "You replied to {you}% of reviews; rivals average {median}%."; rating "Your rating is {you}; the rival median is {median}."; ads "{rivalNames} run ads; you run none."; theme weakness "{theme} comes up in {you}% of your reviews vs {median}% for rivals."; theme strength "Patients/customers mention {theme} in {you}% of your reviews vs {median}% for rivals." (noun from pack `audience_noun`, default "customers"); map "You appear in the map top 3 in {you}% of searches; rivals {median}%."; profile "Your Google profile is missing: {missing}.". Playbooks: one per rule in each pack (title, action, effort, impact), wording reviewed by the owner in the plan review.
**Tests:** one positive + one negative test per rule; `no rivals → only profile_gap/theme rules`, `max one strength`, `ranked by score`, `map rule skipped without evidence`.
**Done when:** engine `self-rules` and verticals tests green.

### Task 5: Starting-point generation + approval/send
**Goal:** readiness, generation, notice and immediate send.
**Files:** `engine/src/briefs/{readiness,starting-point}.ts`, `generate.ts`, `summary.ts`, `deliver.ts`, `review.ts`, `notify.ts`, `apps/worker/src/jobs/briefs.ts` + tests.
**Interfaces:**
```ts
export function startingPointReadiness(db: Db, clientId: string, now: Date): Promise<{ ready: boolean; checks: { profile: boolean; reviews: boolean; rankings: boolean | null; competitors: boolean | null }; timedOut: boolean }>;
export function listStartingPointDue(db: Db, now: Date): Promise<string[]>; // active clients, no starting_point brief, ready or activated_at + 48h passed
export function generateStartingPoint(deps: { db: Db; ai: AiClient; packs: PackLoader; now?: () => Date }, clientId: string): Promise<BriefRunResult>;
```
**Behaviour:** readiness per spec (`rankings`/`competitors` null when not applicable). Generation: `claimBrief` with `kind 'starting_point'`, `delivery_date` = client-local today, `period_start = activated_at`, `period_end = now`; `buildScorecard`; `evaluateSelfRules`; items `subject 'self'`, `competitor_id` null, `headline` = rule title, `what_changed` = fact; optional writer pass (`brief_writer`, `redactForModel`) for `why_it_matters`/`recommended_action` only; verifier as today; dropped model text falls back to playbook text. Zero findings → the decided fallback item (no recommendation). `status = 'ready'` → `notifyBriefOutcome` with the decided copy. Jobs `starting-point-schedule` (cron `'15 * * * *'`) → `starting-point-client` (`{ clientId }`, retry 2). Q2/Q3 exclusions applied. Approval of a starting point calls `sendBriefNow`; email subject from the decided copy. Recommendations via existing `recommendationFromItem`.
**Tests:** `not ready and < 48 h → not due`, `48 h passed → due with partial data`, `generates items + scorecard`, `fallback item when no rule fires`, `second run is a no-op`, `weekly brief on same date skipped`, `approval sends immediately`, `previous-period query ignores starting point`.
**Done when:** engine `briefs` and worker `briefs` tests green.

### Task 6: Quiet-week "Where you stand"
**Goal:** quiet briefs carry a scorecard with deltas and open first moves.
**Files:** `engine/src/briefs/generate.ts` + test.
**Behaviour:** when `kind = 'quiet'`, set `scorecard = buildScorecard(..., { baseline: startingPoint?.scorecard ?? null, openFirstMoves })`; `openFirstMoves` = recommendations from the starting-point brief with status not in (`done`,`dismissed`), max 3, `title` from the recommendation. `baselineBriefId` = starting-point id. Standard briefs: `scorecard` null.
**Tests:** `quiet brief gets scorecard with deltas`, `no starting point → baseline null, deltas null`, `done recommendations excluded`.
**Done when:** engine `generate` tests green.

### Task 7: Rendering (web, email, PDF)
**Goal:** spec § Rendering with one view-model.
**Files:** `engine/src/briefs/scorecard-model.ts`, `web components/views/{scorecard.tsx,brief-view.tsx}`, `email templates/{scorecard.tsx,brief.tsx}`, `email/src/types.ts`, `tools/src/tools/schemas.ts` (`BriefDetail.scorecard`, `BriefItemView.subject`, `competitorId: uuid|null`), `deliver.ts` (`loadBriefView` left join, Q4) + tests.
**Interfaces:** `scorecardModel(s: Scorecard, opts: { clientName: string }): { tiles: { label: string; value: string; sub: string; trend: 'up'|'down'|null; trendText: string|null }[]; table: { headers: string[]; rows: { cells: string[]; self: boolean; tier: Tier|null }[] }; openFirstMoves: string[] }` — formats `null` as "—", percentages without decimals, rating to 1–2 decimals.
**Behaviour:** starting point: title, chip, intro, tiles → scorecard → item cards (self items show no competitor name); quiet: summary → "Where you stand" → "First moves still open" (when any) → trend table; web view now renders `trend` for quiet briefs. Email/PDF mirror the web order. Evidence chips per item as today.
**Tests:** `scorecardModel formats nulls as —`, `trend text present with arrows`, `brief-view renders starting point sections`, `email snapshot for starting point and quiet`, `self item renders without competitor`.
**Done when:** web, email and engine tests for these files green.

### Task 8: Client-home progress card
**Goal:** replace "No briefs yet" with the progress card until the starting point is sent.
**Files:** `tools/src/tools/briefs.ts` (`get_starting_point_status`), `web components/client-home-basic.tsx`, `app/(app)/c/[clientId]/page.tsx` + tests.
**Interfaces:** `get_starting_point_status({ clientId })` → `{ state: 'preparing', checks } | { state: 'ready_for_review' } | { state: 'sent', briefId }`, `permission: 'read'`, channels web only.
**Behaviour:** client users see "Preparing your starting point" with the four checks (✓ / in progress, "Not needed" when null) also while `ready_for_review`; agency users additionally see "Review it" linking to approvals when ready. Sent → today's latest-brief card.
**Tests:** state mapping per readiness; client user never sees the approvals link.
**Done when:** tools `briefs` and web tests green.

### Task 9: Demo seed, coverage, E2E, owner steps
**Files:** `packages/demo/src/*` (a sent starting point with items + scorecard, a quiet brief with deltas, a fresh client in `preparing`), `coverage.ts` + README table, `apps/web/e2e/starting-point.spec.ts` (tag `@starting-point`), `e2e-affected-rules.ts`.
**Tests:** `new client shows progress card`; `agency approves starting point → client sees tiles, scorecard, cards`; `quiet week shows Where you stand with ▲▼ text`; `client user sees no upsell tag in starting point`.
**Owner verification (into the work file):** on `cs_dev`: `pnpm db:migrate`; run `starting-point-client` for both clients via the worker → approve in `/agency/approvals` → email arrives (Postmark test) → client view shows tiles/scorecard/cards; next quiet week shows "Where you stand".
**Done when:** `pnpm --filter @cs/demo test` and `pnpm --filter @cs/web e2e:affected` green.
