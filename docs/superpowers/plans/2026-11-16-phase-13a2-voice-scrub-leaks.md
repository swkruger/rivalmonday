# Phase 13a2 — Voice, remaining scrub, leak check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Status:** owner-approved 2026-11-16 (with V11 = 404). **Supersedes** Part 2 (Tasks 15–23) of `docs/superpowers/plans/2026-10-17-phase-13a-white-label.md`. Its binding interfaces stand unless this plan changes them. **Lean plan format** (root `CLAUDE.md` § Process): interfaces are binding; full code only in the **Appendices** (migration, the banned-term matcher, the voice prompt block, the neutral icon) and the **Proposed copy** appendix.

**Goal:** An agency's own voice (tone + preferred/banned words) shapes every model-written client text, a banned word that survives one retry waits for an account manager, and no client-facing surface (pages, icons, headers, redirects, emails, PDFs, MCP, Stripe) names Rival Monday — pinned by unit and E2E leak checks.

**Architecture:** Voice is a runbook knob `knob:voice` (14b): agency default on the agency Runbook page, whole-object client override on the client Runbook page. `loadVoice` (engine) resolves it for the writers; `withVoice` appends a `<voice>` block to their system prompts (empty for the default voice, so prompts and eval cassettes stay byte-identical); `findBannedTerms` (core) checks the output, one retry, then flags `brief`/`alert` for review. The scrub swaps the RM favicon for a neutral one on every non-platform host and removes the last name fallbacks. `PLATFORM_BRAND_RE` + `brandLeaks` (core) drive one unit sweep and one E2E crawl over every agency-host route derived from `app/**/page.tsx`.

**Tech stack:** TypeScript, Next.js 16 App Router (`proxy.ts`), Drizzle + Postgres, pg-boss, `@cs/tools` registry, `@cs/ai` (OpenRouter), react-email, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-phase-13a-white-label-design.md` (§ Decisions D6–D7, § Interfaces → Voice, § Scrubbing (13a2), § Testing), amended by owner decisions R1–R13 and **Q1–Q9 (2026-11-16)** in `docs/work/phase-13a.md`. Refresh brief: `docs/work/phase-13a2-refresh.md`.

## Global constraints
- Own worktree `../CompetitorSpy-wt/phase-13a2`, branch `phase-13a2`, cut from `main` **after 13a1 merges** (Q7). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`, `apps/web/next-env.d.ts`. LF only. Commits end with the Co-Authored-By line from root `CLAUDE.md` (subagents: their own model).
- Before coding, read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every touched package: core, db, engine, ai, email, tools, mcp, ask, worker, web, demo, copy-review.
- **Root rule:** nothing client-facing names Rival Monday. Agency-audience text and the Friday mascot may (Q9). `/bot`, `/brand/*` and the RM favicon exist on the platform host only (Q4).
- **No evidence, no claim:** the verifier and its rules are unchanged; voice changes wording only. Model input goes through `redactForModel` and `escapeEvidence`; voice terms too.
- Web reads = registered tools via `callTool`; writes via `runTool`; refusals 404 / `not_found`, never 403; a named out-of-scope client → `not_found`.
- New tool `preview_voice`: `access` mark + `access-marks.test.ts` snapshot + `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; `ISOLATION_FIXTURES` entry; web-only (default channels); not in `PAUSED_WRITE_ALLOW_LIST`. No new tables (no `TABLE_CLASS` change).
- **Migration:** one, generated, next free number at execution (**0114** at the time of writing; Task 0 confirms). Never edit applied migrations.
- **Cost (R5, 7b):** writer retries and previews are ordinary `llm_call` rows under the 7b guards; the preview is agency spend (`clientId: null`), capped at 10/agency/UTC day. An `AiPausedError` is rethrown, never swallowed.
- **Launch gate:** every page ≤ 8 app DB stages, also client pages on an agency host. This plan adds no page read (voice rides on `get_runbook`, flags on existing review tools).
- UI: design system v1 (`docs/design-system/README.md`): sections before cards, 36 px controls, fixed chip tints, `WriteGuard` on controls, results in always-mounted regions. Help per 15b: tips in `apps/web/src/help/copy/*`, guides in `docs/help/pages/` (`help_key` `page:<context>.<page>`), `pnpm kb:seed`.
- New user-facing copy = **Appendix E (Proposed copy)**; it becomes decided with plan approval and is signed in `pnpm copy:review`. No new email template.
- E2E: agency host `http://<host_slug>.localhost:${E2E_PORT}` (`NEUTRAL_DOMAIN=localhost`); Node-side requests to `*.localhost` via `hostRequest` (`e2e/helpers.ts`). New tag `@whitelabel`.
- Tests: implementers run focused tests only, in the foreground; `test:affected` + `e2e:affected` once at the final review (Task 14); full suites only in `/rm-merge` after asking. One test DB for this worktree.

## Decisions
**Spec D1–D7** and **R1–R13** by reference. **P17–P23 of the 10-17 plan stand except as amended here.** Q1–Q9 bind:
- **Spec amendment (Q1, Q2).** Voice = structured fields only (`VoiceSettings` verbatim from the spec), stored as runbook knob `knob:voice` at agency and client level, edited on the Runbook pages. This **replaces** the spec's "Branding → Voice", `branding.voice`, `client.voice_override`, the per-field `effectiveVoice` and the tools `update_agency_voice` / `update_client_voice` (the runbook tools write it) and P18 `get_voice_settings` (`get_runbook` reads it). D7's Client customisation page is replaced by R3's Voice section. `preview_voice` stays (spec, P21).
- **Q3 banned term.** One retry with an avoid instruction, then: weekly brief stays `ready` with `review_reason = 'banned_term'` and `review_terms`, auto-send skips it; alert goes `pending_review` in every mode. A tailored play whose text contains a banned term is rejected (base kept).
- **Q4** neutral icon on every non-platform host; root `CLAUDE.md` "never white-label" → "platform host only" at merge. **Q5** leak crawl as Task 13. **Q6** Ask voice → backlog. **Q8** site claim → after 13a1 is live (not here). **Q9** `productNameFor` → agency display name, else agency name; `support.ts` → "platform support"; agency-facing KB keeps Rival Monday (no `kbNamesFor` change).
- **P20 amended:** writers with voice = weekly `brief_writer`, starting-point `writeWhy`, `alert_writer`, `playbook_writer` (move recommendations), `runbook_tailor` + `runbook_retailor` (R5). No quarterly writer exists. **P22/P24** done/dropped (15a, R6). **P23** stands (Task 10).

**Plan-local (owner to confirm with the plan):**
- **V1 Resolution.** Effective voice = the client's `knob:voice` when **enabled and customised**, else the agency's enabled `knob:voice`, else `DEFAULT_VOICE`. A client copy that is not customised follows the agency (like thresholds R3). Legacy-runbook clients read the agency knob. The platform runbook has no voice knob (writes refused).
- **V2 Client without its own runbook:** the Voice section is read-only (agency voice shown) until "Create a runbook for this client", like the rest of the editor.
- **V3 Byte-identical default.** `voiceBlock(DEFAULT_VOICE) === ''` and `withVoice` returns the system prompt unchanged, so default-voice prompts, `eval:replay` cassettes and today's tests are untouched.
- **V4 Names exempt.** A banned term that occurs in the business name or a cited competitor name is not enforced for that text (`enforcedTerms`): the writer must be able to name a rival.
- **V5 Starting point:** a `why_it_matters` with a banned term falls back to its deterministic text (no retry, no flag); starting points are approved by hand anyway.
- **V6 Move recommendations:** retry once; still banned → skipped with the existing backoff (no review queue exists for them).
- **V7 Preview** of the **unsaved** form voice; fixed demo evidence, no client data; scope `{ agencyId, clientId: null }`; fixture text in demo/test/E2E (no paid call).
- **V8 Flag lifetime:** set or cleared at every brief commit / alert write; approval does not clear it; the UI shows it while the row is `ready` / `pending_review`.
- **V9 Term rules:** a term both preferred (`say`) and banned, or listed twice (case-insensitive), is refused.
- **V10 Samples host slug:** `agency_host_slug_for('Samples', id)` → `samples` (or `samples-2`…), at insert and for the existing row in 0114.
- **V11 `/agency*` on an agency host (owner, 2026-11-16):** 404 unless the request carries a session on this host whose viewer has an agency-staff membership for this host's agency; that viewer still gets the 13a1 307 to `APP_URL` + same path. No session, client roles, guests → 404 (`notFound()`, never a redirect naming the platform origin). `/platform*` on an agency host → 404 for everyone. The crawl therefore has **no** exempt `Location`: any redirect to the platform origin from an agency host fails.

## File structure
New: core `src/voice.ts`, `src/white-label.ts`; engine `src/voice/{load,block,preview}.ts`; tools isolation entry only; web `src/components/runbook/{voice-section,voice-fields}.tsx`, `src/components/highlight-terms.tsx`, `src/server/voice-preview.ts`, `public/neutral-icon.svg`, `public/brand/rm-mark.svg` (moved), `public/favicon.ico` (moved), `e2e/white-label.spec.ts`, `e2e/agency-routes.ts`; email `src/leak.test.ts`; mcp `src/leak.test.ts`; ask `src/leak.test.ts`; migration 0114. Plus `docs/work/phase-13a2.md`.

## Dependencies on in-flight work
- **13a1 (`phase-13a`)** must be merged first (Q7); this plan uses `HostEnv`, `clientOriginFor`, `requestHost()`, `routeForHost`, the `x-rm-host-*` headers, `hostRequest`, `HOSTS_FIXTURE_FILE`, migrations 0111–0113.
- **13a3** may run in parallel (own worktree): it edits `branding-form.tsx`, `settings.ts` (`updateAgencyBranding`), `AgencyBranding`, theme tokens. This plan touches none of them (voice lives in the runbook). Shared files: `e2e/seed.ts`, `e2e-affected-rules.ts`, `help/copy/*` — additive; rebase before merge.

## Review focus
1. **A banned term that can't be avoided** (a rival called "Cheap Plumbing", a quoted competitor ad): briefs still name the rival, never loop or drop the item — Task 5 (`term inside a competitor name is not enforced`), Task 1 (`enforcedTerms drops terms found in names`).
2. **Voice used as an instruction channel or to bend facts:** terms are charset-limited, escaped and redacted; the block says wording only — Task 1 (`term rules` rejects `<b>`, `{x}`, a newline), Task 4 (`voice block is escaped and carries the wording-only rule`), Task 5 (`verifier input has no voice block`).
3. **A flagged brief sent anyway:** auto-send never sends a flagged brief; the overdue and ready notices say why — Task 5 (`auto-send skips a flagged untouched brief`, `overdue notice names the terms`).
4. **Client override drift:** a client copy that is not customised follows later agency changes; "Use the agency voice" really reverts; legacy clients get the agency voice — Task 1 (`non-customised client copy follows the agency`, `disabled client knob → agency`, `legacy client → agency knob`), Task 3.
5. **A new page or icon leaking the platform:** an unclassified page, an RM icon link or the radar mark on an agency/MCP host fails CI — Task 13 (`every app route is classified`, `no page names the platform`), Task 10 (`agency host icons are neutral`, `/brand/* is 404 off-platform`).

---

### Task 0: Pre-flight
- [ ] 13a1 merged to `main`. Create the worktree per CLAUDE.md Process: `git worktree add ../CompetitorSpy-wt/phase-13a2 -b phase-13a2 main`; `pnpm install`; new test DB (`bash scripts/local-test-db.sh setup`, then `env`); `docs/work/phase-13a2.md` from the refresh brief (≤ 8 KB). If `main` moves during the phase, `git rebase main`.
- [ ] Claim the migration number (next free after `main`'s latest; expected **0114**) and write it into Task 2.
- [ ] Re-verify every assumption (Grep, record drift in the work file): `knobContentSchemas`/`effectiveFrom`/`loadClientRunbook`/`copyItems` (engine `runbook/`); `update_runbook_item`, `remove_runbook_item`, `get_runbook` (`tools/runbooks.ts`); `writeBrief`, `buildWriterPrompt`, `verifyDraft`, `generateBrief` commit; `writeWhy` (`starting-point.ts`); `recommendForMoves`; `writeAlertText`, `processAlert`, `notifyAm`; `deliverDueBriefs`, `isUntouched`, `notifyOverdue`, `notifyBriefOutcome`; `applyTailoring`, `tailorClientRunbook`, `proposeTailoring`; `productNameFor`; Ask `brandingFor`; `support.ts:133`, `supportSessionStartedSubject`; `app/icon.svg`, `app/favicon.ico`, root `layout.tsx` metadata, proxy `matcher`/`PUBLIC`, `MCP_ALLOWED`, `AGENCY_HOST_DENY`; `ensureConnectedProduct` (`client-billing.ts`); `ensureSampleAgency`; leak regexes (`grep -rln "rival.\{0,6\}monday" --include=*.test.*`); `e2e/seed.ts` (E2E Agency has no `displayName`; Ask clients of `asker@e2e.test`); `profile-args.ts` `routeOfPageDir`.
- [ ] Confirm already done (no task): `(app)` title template `{page} · {displayName}`, neutral `not-found`/`error`/`global-error`, `poweredByHeader: false`, PDF creator = agency, no `resource_name`, `/start` per R6, profile help line ("Lets us benchmark…"), `kbNamesFor` client-facing neutral.
- **Done when:** work file has drift, migration number, test DB; `pnpm typecheck` green.

### Task 1: Voice model (core) + knob + `loadVoice`
**Goal:** `VoiceSettings`, term rules, matcher (core); `knob:voice` schema; V1 resolution.
**Files:** new `packages/core/src/voice.ts` (+`voice.test.ts`), core `index.ts`; `packages/engine/src/runbook/items.ts`; new `packages/engine/src/voice/load.ts` (+`load.test.ts`), engine `index.ts`.
**Interfaces:** Appendix B in full (`TONES`, `VoiceSettings`, `VoiceTerm`, `VoiceSettingsSchema`, `DEFAULT_VOICE`, `isDefaultVoice`, `effectiveVoice`, `findBannedTerms`, `enforcedTerms`). Engine:
```ts
// items.ts
knobContentSchemas.voice = VoiceSettingsSchema;
// voice/load.ts
export const VOICE_KEY = 'knob:voice';
export function voiceOfItems(client: RunbookItem[] | null, agency: RunbookItem[] | null): VoiceSettings; // V1, pure
export async function loadVoice(db: Db, clientId: string): Promise<VoiceSettings>; // one query (client + its agency's runbook rows, item_key = 'knob:voice')
```
**Behaviour:** invalid stored content → skipped with a `console.warn` (like `validItems`), never fatal; unknown client → throws. `loadVoice` does not depend on the runbook source (legacy clients included).
**Tests (TDD):** core `term rules: 41 chars, "a*b", "<b>", "{x}", "a\nb", "" rejected; "can't", "Ünïcode", "co-op", "AC tune-up" accepted`; `21 banned terms rejected`; `"cheap" both said and banned → refused`; `"Cheap" and "cheap" banned → refused`; `findBannedTerms is case-insensitive and whole-word ("cheap" not in "cheaply"/"cheaper")`; `multi-word and apostrophe terms; whitespace runs match`; `Unicode letters are word characters ("café" not in "cafés")`; `returns terms in list order`; `enforcedTerms drops terms found in names`; `isDefaultVoice`; `effectiveVoice: override wins whole; null → agency; both null → DEFAULT_VOICE`. Engine `voiceOfItems`: `customised enabled client knob wins`, `non-customised client copy follows the agency`, `disabled client knob → agency`, `no knobs → DEFAULT_VOICE`, `invalid content skipped`; db-backed `legacy client (no client runbook) → agency knob`.
**Done when:** `pnpm --filter @cs/core exec vitest run voice`, `pnpm --filter @cs/engine exec vitest run load runbook` green; `pnpm typecheck`.

### Task 2: Migration 0114 — review flags + samples host slug
**Goal:** P19 columns; V10.
**Files:** `packages/db/src/schema/briefs.ts` (`brief`), `schema/delivery.ts` (`alert`, `ReviewReason`); migration `0114_voice_review.sql` (+snapshot/journal); new `packages/db/src/review-flags.test.ts`; `packages/tools/src/waitlist/sample.ts` (+test).
**Interfaces:**
```ts
export type ReviewReason = 'banned_term';
// brief and alert:
reviewReason: text('review_reason').$type<ReviewReason | null>(),   // + check('<table>_review_reason_check', sql`review_reason IN ('banned_term')`)
reviewTerms: jsonb('review_terms').$type<string[] | null>(),
export const SAMPLE_HOST_NAME = 'Samples'; // tools waitlist/sample.ts
```
**Behaviour:** `pnpm --filter @cs/db generate --name=voice_review`, then append Appendix A's samples block (hand-edit, like 0111). `ensureSampleAgency` inserts with `hostSlug: sql\`agency_host_slug_for(${SAMPLE_HOST_NAME}, ${id}::uuid)\`` after `pg_advisory_xact_lock(hashtext('agency_host_slug'))` in the same tx. Agency name `Rival Monday Samples` unchanged (platform-owned prospects).
**Tests (TDD):** db `review_reason 'other' rejected; null and 'banned_term' accepted`; `review_terms round-trips a string array`; migration block `renames rival-monday-samples to samples; leaves another agency's slug alone; samples taken → samples-2`; tools `ensureSampleAgency gives host_slug samples`.
**Done when:** `pnpm --filter @cs/db generate` → "No schema changes"; `pnpm --filter @cs/db exec vitest run review-flags`, `pnpm --filter @cs/tools exec vitest run sample` green; `pnpm typecheck`.

### Task 3: Runbook tools carry the voice
**Goal:** agency/client voice through the existing runbook tools (Q2, V1, V2).
**Files:** `packages/tools/src/tools/runbooks.ts` (+`runbooks.test.ts`), `tools/schemas.ts` (`RunbookVoice`).
**Interfaces:** `get_runbook` output gains
```ts
voice: { agency: VoiceSettings | null; own: VoiceSettings | null; effective: VoiceSettings } | null // null at platform level; computed in memory from items + parent (no new query)
```
**Behaviour:**
- `update_runbook_item`/`add_runbook_item`/`pull_runbook_update` with `knob:voice` at **platform** → `not_found`.
- Client-level `update_runbook_item` on `knob:voice` writes a client-owned override: `enabled: true, customised: true, upstreamSnapshot: null, upstreamVersion: <parent version or null>`. Agency level: `enabled: true` (admin only, as today).
- "Use the agency voice" = existing `remove_runbook_item` (`knob:voice`): with a parent it leaves a disabled row → V1 falls back to the agency.
- `get_runbook` client level: a non-customised voice copy shows the parent's content (as thresholds do). `own` = enabled ∧ customised client knob, else null.
- Validation refusals come from `parseItemContent` (zod issues); Task 8 shows Appendix E messages for the known cases.
- **Follow pattern:** thresholds handling in `get_runbook` / `withColumnThresholds`.
**Tests (TDD):** `agency admin saves a voice; get_runbook voice.agency = it`; `account_manager cannot save the agency voice (not_found)`; `AM saves a client override in scope; out-of-scope client → not_found`; `client role → not_found`; `platform knob:voice write → not_found`; `client override survives an agency change; non-customised copy shows the new agency voice`; `remove → own null, effective = agency`; `client without own runbook: save refused "Create the client runbook first."`; `invalid term → invalid_input`.
**Done when:** `pnpm --filter @cs/tools exec vitest run runbooks isolation` green; `pnpm typecheck`.

### Task 4: Voice block + `preview_voice`
**Goal:** the prompt block (V3) and the spec preview (P21, R5, V7).
**Files:** new `packages/engine/src/voice/{block,preview}.ts` (+tests); `packages/ai/config/ai.yaml` (+`config.test.ts`); new `packages/tools/src/tools/voice.ts` (+test), `deps.ts`, `all.ts`, `access-marks.test.ts` snapshot, `isolation/fixtures.ts`, 8b tool-access doc; new `apps/web/src/server/voice-preview.ts` (+test), `server/tools.ts`.
**Interfaces:**
```ts
export function voiceBlock(v: VoiceSettings): string;                 // Appendix C; '' when isDefaultVoice(v)
export function withVoice(system: string, v: VoiceSettings, avoid?: readonly string[]): string; // unchanged when block '' and no avoid
export const VOICE_PREVIEW_TASK = 'voice_preview';
export async function writeVoicePreview(ai: Ai, scope: CallScope, v: VoiceSettings): Promise<string>; // fixed PREVIEW_EVIDENCE constant, 2 sentences
// tools
preview_voice { voice: VoiceSettingsSchema } → { text: string; bannedTerms: string[] } // access 'write', agency roles (admin + AM)
export const VOICE_PREVIEWS_PER_DAY = 10;
ToolDeps.voicePreview?: (voice: VoiceSettings, scope: CallScope) => Promise<string>;
// ai.yaml
voice_preview: { provider: openrouter, model: anthropic/claude-sonnet-4.6, fallbacks: [anthropic/claude-haiku-4.5], temperature: 0.3, max_tokens: 300, request_path: true, timeout_ms: 20000, max_attempts: 2 }
```
**Behaviour:** limit = count of `llm_call` rows `task = 'voice_preview'` for `ctx.agencyId` since UTC midnight ≥ 10 → refuse (Appendix E copy, `userFacing`); scope `{ agencyId: ctx.agencyId, clientId: null }`; `bannedTerms` = `findBannedTerms(text, voice.bannedTerms)`; absent `voicePreview` → `internal`. Web `voicePreviewFor(name, service, env)` mirrors `runbookTailorerFor`: fixture (`"Sample alert in a <tone> voice…"`, deterministic, uses one preferred term) under `setupFakeLookup`/demo/test; else real; `AiPausedError` rethrown. Isolation: `kind: 'agency'`.
**Tests (TDD):** block `'' for DEFAULT_VOICE`; `tone line per tone; Say "X" instead of "Y"; Never use: …`; `voice block is escaped and carries the wording-only rule`; `withVoice adds the avoid line naming the terms`; preview `prompt carries the block and PREVIEW_EVIDENCE, no client data`; tool `11th preview today refused`; `yesterday's previews don't count`; `client role → not_found`; `held agency refused`; `bannedTerms reported`; ai `config has voice_preview`.
**Done when:** `pnpm --filter @cs/engine exec vitest run block preview`, `pnpm --filter @cs/tools exec vitest run runbooks access-marks isolation`, `pnpm --filter @cs/ai exec vitest run config`, `pnpm --filter @cs/web exec vitest run voice-preview` green; `pnpm typecheck`.

### Task 5: Brief writers + auto-send gate
**Goal:** weekly brief and starting point use the voice; Q3 for briefs; V4, V5, V8.
**Files:** `packages/engine/src/briefs/{writer,generate,starting-point,deliver,notify}.ts` (+tests).
**Interfaces:**
```ts
writeBrief(ai, scope, c, candidates, playbooks, period, voice: VoiceSettings, avoid?: readonly string[]): Promise<BriefDraft>; // buildWriterPrompt gets the same two params
export function draftText(d: { summary: string; items: Pick<DraftItem, 'headline' | 'what_changed' | 'why_it_matters' | 'recommended_action'>[] }): string;
```
**Behaviour:**
- `generateBrief`: `voice = await loadVoice(db, clientId)`; terms = `enforcedTerms(voice.bannedTerms, [c.name, ...selected competitor names])`. After `verifyDraft`, `found = findBannedTerms(draftText(verified), terms)`; non-empty → one more `writeBrief(…, avoid: found)` + `verifyDraft`, take the retry; `found2` non-empty → commit `ready` with `reviewReason: 'banned_term', reviewTerms: found2`; else both null. The commit `update` always sets both columns.
- The verifier never receives the voice block.
- Starting point: `writeWhy` system via `withVoice`; a finding whose why contains an enforced term keeps its `SELF_WHY_IT_MATTERS` text (V5).
- `deliverDueBriefs`: select `brief.reviewReason`, `reviewTerms`; auto-approve only when `autoSend ∧ reviewReason IS NULL ∧ isUntouched`; `notifyOverdue` uses the banned-term line when flagged.
- `notifyBriefOutcome` (weekly ready): the auto-send line becomes the banned-term line when flagged.
- **Follow pattern:** `generateBrief` commit fence (`owned`).
**Tests (TDD):** `default voice: prompt equals today's (snapshot of buildWriterPrompt)`; `clean first draft → one writer call`; `term then clean retry → two calls, unflagged`; `term twice → ready + banned_term + terms`; `term inside a competitor name is not enforced`; `verifier input has no voice block`; `starting point why with a term → deterministic text`; `auto-send skips a flagged untouched brief`; `overdue notice names the terms`; `ready notice says auto-send will leave it`; `AiPausedError on the retry propagates`.
**Done when:** `pnpm --filter @cs/engine exec vitest run writer generate starting-point deliver notify` green; `pnpm typecheck`.

### Task 6: Alert writer + review routing
**Goal:** Q3 for alerts (P19), V4.
**Files:** `packages/engine/src/alerts/{write,route}.ts` (+tests).
**Interfaces:** `AlertText` gains `bannedTerms: string[]`; `NOTE` gains key `banned_term`.
**Behaviour:**
- `writeAlertText` loads the voice; system via `withVoice`; terms = `enforcedTerms(bannedTerms, [c.name, row.name])`. Verified model text with terms → one retry (`avoid`) + verify; a retry that fails verification → template. `bannedTerms` is computed on the **returned** text (model or template).
- `processAlert`: `text.bannedTerms.length > 0` → set `reviewReason`/`reviewTerms`, status `pending_review` regardless of `mode`, `notifyAm(…, 'banned_term')`; else clear both and route as today.
- **Follow pattern:** `processAlert` transaction.
**Tests (TDD):** `default voice: prompt unchanged`; `term then clean retry → model text, unflagged`; `direct mode + persistent term → pending_review with flags, no client notification`; `digest_only + term → pending_review`; `template fallback containing a term is flagged`; `term inside the competitor name is not enforced`; `AM note names the terms`.
**Done when:** `pnpm --filter @cs/engine exec vitest run write route` green; `pnpm typecheck`.

### Task 7: Move recommendations + runbook tailoring
**Goal:** R5 rest: `playbook_writer`, `runbook_tailor`, `runbook_retailor`; V6, Q3 for plays.
**Files:** `packages/engine/src/briefs/recommendations.ts`, `runbook/tailor.ts` (+tests).
**Interfaces:** `applyTailoring(base, raw, ctx: { areaIds: string[]; bannedTerms?: readonly string[] })`.
**Behaviour:**
- `recommendForMoves`: voice loaded once per run; system via `withVoice`; after both verifications, terms in title or rationale (enforced against `[c.name, name]`) → one retry of write + verify; still found → `out.skipped++` + `backoff(m)` (V6).
- Tailor/retailor: `INSTRUCTION` via `withVoice` (voice from `loadVoice`); `applyTailoring` rejects an item whose new title or template contains a banned term (base kept, key in `rejected`); `proposeTailoring` → null on rejection.
**Tests (TDD):** recs `term twice → skipped with backoff, no row`; `term then clean → row`; tailor `banned term in a tailored play → rejected, base kept`; `prompt carries the voice block`; `default voice: prompt unchanged`; retailor `banned term → null`.
**Done when:** `pnpm --filter @cs/engine exec vitest run recommendations tailor` green; `pnpm typecheck`.

### Task 8: Voice section on both Runbook pages
**Goal:** R3 UI for agency default and client override; preview.
**Files:** new `apps/web/src/components/runbook/{voice-section,voice-fields}.tsx` (+tests); `components/runbook/{runbook-editor.tsx,types.ts}`; `server/runbook-ops.ts` (`preview` op → `runTool('preview_voice')`); both runbook `actions.ts`; `help/copy/{agency,client}.ts` (tip `voice`); `docs/help/pages/{agency.settings.runbook.agency,client.settings.runbook.agency}.md`; both pages' `TipRow`; `components/read-only-guard.test.ts`; `scripts/e2e-affected-rules.ts`.
**Interfaces:** `RunbookData.voice` = Task 3 shape; `RunbookOp` += `{ op: 'preview'; voice: VoiceSettings }` → `{ ok: true; preview: { text: string; bannedTerms: string[] } }`.
**Behaviour:**
- `RunbookEditor` renders `Section title="Voice"` after Settings when `level !== 'platform'`, inside a `Frame flush` (sections before cards).
- `VoiceFields` (controlled): tone radio group (3, with hints), preferred rows (Say / Instead of, add/remove, ≤ 20), banned words (input + Add → removable chips, ≤ 20); client-side checks mirror Appendix B with Appendix E messages; inflection hint shown.
- Agency: fields + **Save voice** + **Preview**. Client: "Uses the agency voice." + **Set a voice for this client** (opens fields prefilled with `voice.effective`); with `own`: chip `Own voice` + fields + Save + **Use the agency voice** (`remove`). Read-only when `!canEdit` (V2, support, tailoring).
- Preview result (text + flagged terms line) and errors in an always-mounted region; `WriteGuard` on Save/Preview/Use the agency voice; 36 px controls.
- **Follow pattern:** `knob-card.tsx` (save via `run`), `runbook-editor.tsx` notices.
**Tests (TDD):** `agency level shows the Voice section; platform doesn't`; `caps terms at 20 and refuses bad characters`; `refuses a word both preferred and banned`; `save sends the whole VoiceSettings`; `client: agency voice shown, Set → fields prefilled`; `Use the agency voice sends remove`; `read-only without a client runbook`; `preview shows text, flagged terms and the limit copy`; read-only-guard + help `coverage`/`copy`.
**Done when:** `pnpm --filter @cs/web exec vitest run voice runbook-editor read-only-guard help` and `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` green; `pnpm typecheck`.

### Task 9: Review flags in AM views
**Goal:** flags visible to agency roles only; banned words highlighted (P19).
**Files:** `packages/tools/src/tools/{review,alert-queue,schemas}.ts` (+tests); new `apps/web/src/components/highlight-terms.tsx` (+test); `app/(app)/agency/approvals/{page.tsx,approvals-list*}`, `approvals/[briefId]/{page.tsx,review-controls.tsx}`, `agency/alerts/{page.tsx,alert-controls.tsx}`; `docs/help/pages/{agency.approvals.agency,agency.approvals.detail.agency,agency.alerts.agency}.md`, `help/copy/agency.ts` tips.
**Interfaces:** `BriefQueueRow`, `BriefReview`, `AlertQueueRow` += `reviewReason: z.enum(['banned_term']).nullable()`, `reviewTerms: z.array(z.string()).nullable()`. `HighlightTerms({ text, terms }: { text: string; terms: readonly string[] })` wraps each `findBannedTerms`-style whole-word match in `<mark>`.
**Behaviour:** `get_brief`, `list_briefs` and other client-reachable tools gain nothing. Approvals list and alert queue rows show chip `Banned word`; brief detail shows the Appendix E band and highlights terms in summary and item fields; alert rows highlight headline/body. Shown only while `ready` / `pending_review` (V8).
**Tests (TDD):** tools `get_brief_review / list_brief_queue / list_alert_queue carry the flags`; `get_brief output has no reviewReason key`; `HighlightTerms marks whole words only, case-insensitive`; `approvals list shows the chip`; `brief detail shows the band and marks`; `alert row marks the term`; help `coverage`.
**Done when:** `pnpm --filter @cs/tools exec vitest run review alert-queue briefs`, `pnpm --filter @cs/web exec vitest run highlight approvals review-controls alert-controls help` green; `pnpm typecheck`.

### Task 10: Scrub — favicon per host, name fallbacks, Stripe product
**Goal:** Q4, Q9, P23.
**Files:** move `apps/web/src/app/icon.svg` → `apps/web/public/brand/rm-mark.svg`, `app/favicon.ico` → `public/favicon.ico`; new `public/neutral-icon.svg` (Appendix D); `app/layout.tsx` (+`layout.test.tsx`); `proxy.ts` (`matcher`, `PUBLIC`, stale comment l.9); `server/hosts.ts` (+`hosts.test.ts`); `packages/mcp/src/branding.ts` (+test); `packages/ask/src/turn.ts` (+test); `packages/tools/src/tools/{support,client-billing}.ts` (+tests); `packages/email/src/templates/support-session-started.tsx` (+test, `previews.ts` unchanged).
**Interfaces:**
```ts
export async function generateMetadata(): Promise<Metadata>; // root: today's title + robots; icons by requestHost().info.kind
// platform: { icon: [{ url: '/brand/rm-mark.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }] }; agency | mcp: { icon: [{ url: '/neutral-icon.svg', type: 'image/svg+xml' }] }
export async function productNameFor(service: Db, agencyId: string): Promise<string>; // displayName ?? agency.name ?? NEUTRAL_PRODUCT_NAME
```
**Behaviour:**
- Proxy `matcher` stops excluding `favicon.ico`; `PUBLIC` swaps `/favicon`, `/icon.svg` for `/favicon.ico`, `/neutral-icon.svg`, `/brand/`. `routeForHost`: `/favicon.ico` and `/brand/*` → `not_found` on agency and MCP hosts; `MCP_ALLOWED` swaps `/favicon`, `/icon.svg` for `/neutral-icon.svg`.
- `DEFAULT_PRODUCT_NAME` deleted from `@cs/mcp` (index export too); MCP descriptions keep their `Rival Monday` → product-name swap.
- Ask `brandingFor` final fallback → `NEUTRAL_AGENCY_NAME`; `DEFAULT_PRODUCT_NAME` removed from `@cs/ask`.
- `support.ts` description and the support email subject/opening line per Appendix E (layout stays platform-branded: agency audience).
- `ensureConnectedProduct` names the product `${resolveBranding(a.name, a.branding).displayName} competitor monitoring`; existing products not renamed.
**Tests (TDD):** layout `platform icons = rm mark + favicon`; `agency host icons are neutral`; `mcp host icons are neutral`; `no generator meta`; hosts `/brand/* is 404 off-platform`; `/favicon.ico 404 on agency and mcp hosts, next on platform`; `/neutral-icon.svg allowed on mcp`; mcp `productNameFor: displayName, else agency name`; ask `fallback never "Rival Monday"`; tools `Connect product uses displayName`; `support tool description says platform support`; email `support subject has no product name`.
**Done when:** `pnpm --filter @cs/web exec vitest run layout hosts proxy`, `pnpm --filter @cs/mcp exec vitest run branding`, `pnpm --filter @cs/ask exec vitest run turn`, `pnpm --filter @cs/tools exec vitest run client-billing support`, `pnpm --filter @cs/email exec vitest run support` green; `pnpm typecheck`.

### Task 11: Leak unit sweep
**Goal:** spec § Testing unit leak check with one shared rule.
**Files:** new `packages/core/src/white-label.ts` (+test), core index; new `packages/email/src/leak.test.ts`, `packages/mcp/src/leak.test.ts`, `packages/ask/src/leak.test.ts`; `apps/worker/src/pdf.test.ts`, `packages/engine/src/briefs/pdf.test.ts`; the existing local leak regexes (`email/*.test.ts`, `web/white-label-leak.test.tsx`, …) switch to `PLATFORM_BRAND_RE`.
**Interfaces:**
```ts
export const PLATFORM_BRAND_RE = /rival[\s-]*monday|rivalmonday/i;
/** Reasons a client-facing text/markup leaks the platform: the name, the wordmark half, the radar mark, an RM icon link. */
export function brandLeaks(text: string): string[]; // checks PLATFORM_BRAND_RE, 'data-part="monday"', 'data-slot="radar-mark"', /\/brand\//
```
**Behaviour:** fixtures = agency "Cool Agency" with **no** branding (defaults), APP_URL `https://rivalmonday.app`, neutral domain `example-neutral.test`.
- Email: `TEMPLATE_AUDIENCE: Record<EmailPayload['template'], 'client' | 'staff'>` (exhaustive: a new template fails typecheck until classified). Every `client` template renders from its `EMAIL_PREVIEWS` payload with the fixture branding; subject + html + text have no `brandLeaks`. Client set: `alert`, `alert_digest`, `brief`, `trend_report`, `sign_in`, `client_invite`, `competitor_review`, `client_billing_notice`, `lead_verify`, `lead_confirmation`, `lead_declined`.
- PDF: brief and report PDF meta + html.
- MCP: `serverInfo`, `instructions` and every MCP tool description for an agency without a display name; `list_briefs`/`get_brief`/`fetch`/`list_alerts` outputs for a client role (URLs on the client origin).
- Ask: system prompt, starters and guard/paused templates for an unbranded agency.
**Tests (TDD):** core `brandLeaks finds each pattern; clean text → []`; the sweeps above.
**Done when:** `pnpm --filter @cs/core exec vitest run white-label`, `pnpm --filter @cs/email exec vitest run leak`, `pnpm --filter @cs/mcp exec vitest run leak`, `pnpm --filter @cs/ask exec vitest run leak`, `pnpm --filter @cs/worker exec vitest run pdf`, `pnpm --filter @cs/engine exec vitest run pdf`, `pnpm --filter @cs/web exec vitest run white-label-leak` green; `pnpm typecheck`.

### Task 12: 13a1 carry-overs (hosts, MCP/auth)
**Goal:** the ten work-file backlog items tagged 13a2, except `productNameFor` (Task 10) and the proxy comment (Task 10).
**Files:** `apps/web/src/server/{env,hosts}.ts` (+tests); `packages/db/src/hosts.ts` (+test); `packages/tools/src/access/invitations.ts` test; `apps/web/src/app/oauth/consent/page.test.tsx`; `apps/web/e2e/hosts.spec.ts`.
**Behaviour:**
- `webEnv`: an unparsable `APP_URL` is a problem line (`APP_URL is not a valid URL`), not a `hostEnv!` assertion.
- `agencyByHostname`: a label in `RESERVED_HOST_SLUGS` returns null **before** any query; fix the l.73 comment.
- Host cache: LRU (a hit moves the key to the end; eviction drops the least recently used); `MAX_ENTRIES` unchanged.
- Consent `page.test` split into one `describe` per state (signed out, signed in, no membership, multi-membership).
- V11: change the 13a1 agency-host rule for `/agency*` / `/platform*` so only a staff viewer of this agency (session on this host) is bounced to `APP_URL`; everyone else gets 404. Keep it within the 8-stage budget (reuse the host viewer lookup; no extra query for no-session requests).
**Tests (TDD):** env `unparsable APP_URL → one problem`; db `reserved label → null with no query`; `hostname removed by A then live for B resolves to B`; hosts `LRU keeps a hot key past MAX_ENTRIES inserts`; `routeForHost(null, '/health') → next`; tools `hasSignInRightIn: revoked invitation → false; accepted invitation without membership → false; expired → false`; E2E (`@hosts`) `platform guest cookie is refused at /agency on an agency host`; `client session at /agency on an agency host → 404, no Location`; `no session at /platform on an agency host → 404`; unit `staff viewer of this agency at /agency → 307 APP_URL/agency`.
**Done when:** `pnpm --filter @cs/web exec vitest run env hosts consent`, `pnpm --filter @cs/db exec vitest run hosts`, `pnpm --filter @cs/tools exec vitest run invitations` green; `pnpm typecheck`.

### Task 13: E2E — leak crawl, MCP host, voice, flags
**Goal:** Q5 crawl + the 13a2 E2E.
**Files:** new `apps/web/e2e/agency-routes.ts` (+`e2e/agency-routes.test.ts` under the scripts vitest config), new `e2e/white-label.spec.ts`; `e2e/helpers.ts` (`ensureClientHostState(browser, email, slug)`), `e2e/hosts.spec.ts` (use it); `e2e/seed.ts`; `e2e/runbook.spec.ts`; `scripts/e2e-affected-rules.ts` (+test: `@whitelabel`; rules for root layout, `not-found`/`error`, `server/hosts.ts`, `proxy.ts`, `public/*icon*`, `components/runbook/voice-*` → `@whitelabel`/`@runbook`).
**Interfaces:**
```ts
export type RouteClass = 'client' | 'client_404' | 'public' | 'deny' | 'bounce' | 'error';
export function appRoutes(appDir: string): string[];            // every app/**/page.tsx via routeOfPageDir
export const AGENCY_HOST_ROUTES: Record<string, RouteClass>;   // explicit table, one entry per route
```
**Behaviour:**
- Seed: for `asker@e2e.test`'s first Ask client add a sent brief, a delivered alert, a trend report; write `whiteLabel: { clientId, params }` (briefId, alertId, reportId, competitorId, evidenceId, threadId, kb id, E2E Agency's intake slug) into `HOSTS_FIXTURE_FILE` (`HostsFixture` gains the field); one flagged `ready` brief (`banned_term`, terms `["cheap"]`) on a client no approvals/workflow assertion counts.
- Crawl (as asker on E2E Agency's host via `hostRequest` + session cookie; `public` signed out): `client` → 200; `client_404`/`deny` → 404; `bounce` (`/agency*`, `/platform*`) → 404 for the client session and signed out (V11; no redirect to the platform origin); `error` (`/e2e-throw`) → 500. Every response and every same-host redirect hop: `brandLeaks(html + status line + all headers)` empty; `<title>` has no brand; HTML has no `rel="icon"` other than `/neutral-icon.svg`. Unknown params fail (no silent skip).
- MCP host: `/sign-in`, `/oauth/consent` (signed out), `/.well-known/oauth-protected-resource`, `/neutral-icon.svg` 200; `/favicon.ico`, `/brand/rm-mark.svg` 404; no leaks.
- One browser visit of `/c/<id>` on the agency host: `document.title` and `link[rel~=icon]` hrefs.
**Tests:** unit `every app route is classified` (appRoutes ⊆ table keys and back); E2E `@whitelabel`: `no page names the platform on the agency host`, `MCP host pages are neutral`; `@runbook`: `agency admin saves a voice and previews it`, `client override saves and returns to the agency voice`; `@whitelabel @briefs`: `a flagged brief shows the chip and highlights the word`.
**Done when:** `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` green; after one build, `E2E_SKIP_BUILD=1 pnpm --filter @cs/web exec playwright test white-label runbook hosts` passes (no concurrent run on the test DB).

### Task 14: Docs, demo coverage, copy, launch gate, final review
**Files:** `docs/work/phase-13a2.md`; `packages/demo/src/agency.ts` (the module that seeds the demo agencies; Task 0 confirms), `packages/demo/src/coverage.ts` (+README via `coverage:readme`); `docs/copy/signoff.json` (owner signs); `docs/help/pages/*` via `kb:seed`.
**Behaviour:**
- Demo: agency `knob:voice` (formal, one preferred pair, banned `cheap`), Lone Star override (direct), one flagged ready brief (Brazos); coverage entries `/agency/settings/runbook (voice)`, `/c/[clientId]/settings/runbook (voice)`, `/agency/approvals/[briefId] (banned word)`.
- Work file: Status/Next; interfaces (0114, `VoiceSettings`/`knob:voice`/`loadVoice`/`withVoice`, `preview_voice`, review columns, `PLATFORM_BRAND_RE`/`brandLeaks`, route table). Owner verification: on `cs_dev` set a banned word, `brief-once` → flagged brief, no auto-send; preview a voice; agency host shows the neutral icon; Checkout shows the agency name. Merge notes: root `CLAUDE.md` favicon line → "platform host only" (Q4); BACKLOG closures — l.427 agency voice (4a), l.112 Connect product (9b M9), l.115 tab titles (9b R18, done in 15a), l.166 (fallbacks + support copy; agency-facing KB stays per Q9), the 13a2-tagged work-file items; new backlog: Ask/Friday voice (Q6), site claim (Q8).
- Launch gate: `bash apps/web/scripts/profile-gate.sh --seed`; then the agency-host pass from the 13a1 work file, now with `--strict-routes` (the seed has brief/alert ids for the asker client). Not alongside an E2E run.
- `pnpm copy:status` lists Appendix E strings; owner signs in `pnpm copy:review`; `pnpm kb:seed` (test DB).
- [ ] **Final review (top model):** `pnpm test:affected`, `pnpm --filter @cs/web e2e:affected` (background, one at a time); `pnpm eval:replay` (expect no miss, V3); Review focus 1–5 against their tests; one fix wave. `/rm-merge` **only with the owner's go-ahead**.
**Done when:** `pnpm --filter @cs/demo exec vitest run coverage` green; work file ≤ 8 KB; profile gate green on both hosts; `git ls-files --eol | grep crlf` prints nothing.

---

## Appendix A — Migration 0114 (generated part + hand-added block)
```sql
ALTER TABLE "brief" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "brief" ADD COLUMN "review_terms" jsonb;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "review_terms" jsonb;--> statement-breakpoint
ALTER TABLE "brief" ADD CONSTRAINT "brief_review_reason_check" CHECK (review_reason IN ('banned_term'));--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_review_reason_check" CHECK (review_reason IN ('banned_term'));--> statement-breakpoint
-- Hand-added (V10): the sample agency's host slug no longer carries the product name.
DO $$ DECLARE sid uuid; BEGIN
  SELECT (value->>'agencyId')::uuid INTO sid FROM platform_setting WHERE key = 'sample_agency_id';
  IF sid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('agency_host_slug'));
    UPDATE agency SET host_slug = agency_host_slug_for('Samples', id)
     WHERE id = sid AND host_slug ~ '^rival-monday-samples(-[0-9]+)?$';
  END IF;
END $$;
```

## Appendix B — `packages/core/src/voice.ts`
```ts
import { z } from 'zod';

export const TONES = ['friendly', 'formal', 'direct'] as const;
export type VoiceSettings = {
  tone: 'formal' | 'friendly' | 'direct';
  preferredTerms: { say: string; insteadOf: string }[]; // ≤ 20
  bannedTerms: string[]; // ≤ 20
};
export const VOICE_TERMS_MAX = 20;
export const VoiceTerm = z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N} '\-]+$/u);
const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const VoiceSettingsSchema = z.strictObject({
  tone: z.enum(TONES),
  preferredTerms: z.array(z.strictObject({ say: VoiceTerm, insteadOf: VoiceTerm })).max(VOICE_TERMS_MAX),
  bannedTerms: z.array(VoiceTerm).max(VOICE_TERMS_MAX),
}).superRefine((v, ctx) => {
  const banned = v.bannedTerms.map(key);
  const dup = banned.find((t, i) => banned.indexOf(t) !== i);
  if (dup) ctx.addIssue({ code: 'custom', path: ['bannedTerms'], message: `duplicate: ${dup}` });
  const both = v.preferredTerms.find((p) => banned.includes(key(p.say)));
  if (both) ctx.addIssue({ code: 'custom', path: ['preferredTerms'], message: `both preferred and banned: ${both.say}` });
});
export const DEFAULT_VOICE: VoiceSettings = { tone: 'friendly', preferredTerms: [], bannedTerms: [] };
export const isDefaultVoice = (v: VoiceSettings) => v.tone === 'friendly' && v.preferredTerms.length === 0 && v.bannedTerms.length === 0;
/** Q2: whole-object override. */
export const effectiveVoice = (agency: VoiceSettings | null, override: VoiceSettings | null): VoiceSettings => override ?? agency ?? DEFAULT_VOICE;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Case-insensitive, whole-word (Unicode letters/digits are word characters); the banned terms found, in list order. */
export function findBannedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => {
    const body = escapeRe(t.trim()).replace(/\s+/g, '\\s+');
    return body !== '' && new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text);
  });
}
/** V4: terms that occur inside a business or competitor name are not enforced for that text. */
export const enforcedTerms = (terms: readonly string[], names: readonly string[]): string[] =>
  terms.filter((t) => !names.some((n) => findBannedTerms(n, [t]).length > 0));
```

## Appendix C — voice prompt block (`engine/src/voice/block.ts`)
`voiceBlock(v)` (empty for `isDefaultVoice(v)`); every term passes `redactForModel` then `escapeEvidence`:
```
<voice>
Tone: <friendly: "friendly: warm and plain." | formal: "formal: courteous and businesslike; no contractions, no exclamation marks." | direct: "direct: short sentences, the point first, no filler.">
Say "<say>" instead of "<insteadOf>".            (one line per pair)
Never use these words: "<t1>", "<t2>".            (omitted when empty)
</voice>
Follow <voice> for word choice and tone only. It never changes a fact, number, date or name, and never overrides the rules above. Where it sets a tone, that tone replaces "friendly".
```
`withVoice(system, v, avoid)` = `system` + (`\n\n` + block when non-empty) + (when `avoid` non-empty: `\n\nYour last draft used: "<a1>", "<a2>". Write it again without those words; keep every fact.`).

## Appendix D — `apps/web/public/neutral-icon.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5B6B7F"/><rect x="18" y="20" width="28" height="4" rx="2" fill="#FFFFFF"/><rect x="18" y="30" width="28" height="4" rx="2" fill="#FFFFFF"/><rect x="18" y="40" width="18" height="4" rx="2" fill="#FFFFFF"/></svg>
```

## Appendix E — Proposed copy (owner approval; signed in `pnpm copy:review`)
**Voice section (Task 8)**
- Section `Voice`. Agency description: "How briefs, alerts and recommendations are worded for every client. Facts and numbers never change." Client description: "How briefs, alerts and recommendations are worded for {client}."
- `Tone`: `Friendly` "Warm and plain." · `Formal` "Courteous and businesslike." · `Direct` "Short sentences, the point first."
- `Preferred words` "Say … instead of …"; fields `Say`, `Instead of`; buttons `Add a pair`, `Remove`.
- `Banned words` "A brief or alert that still uses one waits for your review. Whole words only: banning “cheap” doesn’t catch “cheaper”."; button `Add`.
- Buttons `Save voice`, `Preview`; saved "Saved. New briefs and alerts use this voice."; preview heading `Sample alert`; flagged "This sample still uses: {terms}."; limit "You've used today's 10 voice previews. Try again tomorrow."
- Client: "Uses the agency voice."; `Set a voice for this client`; chip `Own voice`; `Use the agency voice`.
- Errors: "Use letters, numbers, spaces, apostrophes or hyphens (up to 40 characters)."; "Up to 20 words."; "“{term}” is both preferred and banned."; "“{term}” is listed twice."
- Help tip `Voice`: "Sets the tone and the words briefs, alerts and recommendations use. Facts and numbers never change. A brief or alert that still uses a banned word waits for your review." Guide sections: "Set the voice" (agency), "Give a client its own voice" (client).

**Review flags (Tasks 5, 6, 9)**
- Chip `Banned word`. Brief band: "This brief uses a banned word: {terms}. Auto-send skips it; edit it or approve it as it is."
- Ready notice line: "It uses a banned word ({terms}), so auto-send will leave it for you." Overdue line: "It uses a banned word ({terms}), so auto-send left it for you."
- Alert AM note: "It uses a banned word ({terms}), so it waits for your review."

**Scrub (Task 10)**
- `set_support_access_notify` description: "Agency admins: email the agency admins whenever platform support opens a read-only session."
- Support email subject: "Platform support opened a read-only session"; opening line: "This is a security notice from platform support: a member of our support team is looking at your account. You don't need to do anything."
