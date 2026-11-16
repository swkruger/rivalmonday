# phase-13a2 refresh brief (2026-11-16)

Old plan [10-17](../superpowers/plans/2026-10-17-phase-13a-white-label.md) Part 2 (T15–23) checked against `phase-13a` @ e78256b4. Binding: spec D1–D7, P17–P24, R1–R13 ([phase-13a.md](phase-13a.md)). Addendum 11-05 = 13a3.

## Scope as of today
- **T15 Pre-flight — changed.** Own worktree (CLAUDE.md Process), base = `main` after the 13a1 merge (Q7). Next free migration **0114** (branch has 0111–0113, `main` 0110, nothing else in flight).
- **T16 Voice model — changed.** `AgencyBranding` (`db/schema/delivery.ts:36`) has no `voice`. `updateAgencyBranding` (`tools/settings.ts:82`) replaces the whole jsonb and keeps only `fromEmail`, so a stored voice would be wiped. Runbooks (14b) offer `knob:voice` instead (`engine/runbook/items.ts:14`; agency→client copy with customised/upstream badges) (Q2). The review columns still need migration 0114.
- **T17 Voice tools — changed.** With a knob, the runbook tools (`tools/runbooks.ts`) replace `update_agency_voice`, `update_client_voice` and `get_voice_settings`, and only `preview_voice` is new. The P21 limit counts `llm_call.task` + `agency_id` (`schema/ledger.ts:40`). The preview runs with `CallScope { agencyId, clientId: null }`: confirm `AiPausedError` covers agency-only scopes (R5, 7b).
- **T18 Writers — changed.**
  - Weekly `writeBrief(ai, scope, c, candidates, playbooks, period)` (`briefs/writer.ts:143`) is as assumed.
  - The starting point has no full writer now. It is deterministic, plus `writeWhy` (`starting-point.ts:99`, `brief_writer`), which writes `why_it_matters` only.
  - Recommendations use `playbook_writer` (`recommendations.ts:116`).
  - `writeAlertText` (`alerts/write.ts:43`) and `processAlert` (`route.ts:81–107`) are as assumed.
  - Auto-send runs through `isUntouched` (`deliver.ts:148`), so the flag check goes there and in `notifyOverdue`.
  - **Add** `runbook_tailor` + `runbook_retailor` (`runbook/tailor.ts:99,216`; R5). A banned term in a tailored play is rejected in `applyTailoring` (the base is kept).
- **T19 Voice UI — changed.**
  - Branding is now at `/agency/settings/branding`.
  - The "Client customisation" page and its nav item are **dropped**. R3 puts a Voice section on `/c/<id>/settings/runbook` (`RunbookEditor`/`KnobCard`).
  - Approvals `[briefId]` and `agency/alerts/alert-controls.tsx` exist.
  - 15b guides to update: `agency.settings.{branding,runbook}`, `client.settings.runbook`, `agency.approvals.detail`, `agency.alerts`.
- **T20 Scrubbing — mostly already done (15a/15b/11c/13a1).** Done:
  - Title template `{page} · {displayName}` (`(app)/layout.tsx:19`, `page-titles.test.ts`).
  - Neutral `not-found`/`error`/`global-error`, and `poweredByHeader: false`.
  - Ask `brandingFor` falls back to `agency.name` (`ask/turn.ts:95`).
  - No `resource_name` in `.well-known`.
  - `/start` per R6 (`start/brand.ts`).
  - PDF creator/producer = the agency (`worker/pdf.ts:11`).

  **Remaining:**
  - The favicon: `app/icon.svg` + `favicon.ico` = RM radar mark, served on agency and MCP hosts (F24, Q4).
  - The root `layout.tsx` metadata is static, with no host-aware `icons`.
  - The `productNameFor` fallback is still `'Rival Monday'` (`mcp/branding.ts:19`). Feeds MCP `serverInfo` and descriptions (`mcp/server.ts:33`).
  - The `kbNamesFor` agency-facing fallback (`kb/names.ts:24`).
  - The `support.ts:133` description and the `support-session-started` subject (BACKLOG l.166).
  - The profile help line (`client-profile-form.tsx:135`).
- **T21 Stripe + leak unit — keep, smaller.**
  - The Stripe product still uses `agency.name` (`client-billing.ts:200–201`).
  - Leak tests exist, each with its own regex (`email/render.test.ts:25`, `web/white-label-leak.test.tsx`, `worker/pdf.test.ts` and 4 more).
  - Missing: a shared `PLATFORM_BRAND_RE`, a sweep over every `CLIENT_KINDS` template, MCP client-role outputs with no display name, and the Ask templates.
- **T22 E2E crawl — keep.** Reuse the 13a1 hosts fixture (`seed.ts:266`). `E2E Agency` has no `displayName` (`seed.ts:22`), so the crawl is the worst case. The voice tests move to the runbook section.
- **T23 Docs/demo — changed.** Work file `docs/work/phase-13a2.md`; demo coverage for the voice section. Closures: BACKLOG l.166, l.200, l.52 (the `kbNamesFor` part), 4a voice, 9b M9 (9b R18 already closed by 15a).

## New items
1. **Work-file backlog tagged 13a2:** the "13a2 → hosts" (5) and "13a2 → MCP/auth" (5) lists in [phase-13a.md](phase-13a.md) § New backlog.
2. **Site (BACKLOG l.200):** `pricing-page.ts:114` FAQ ("own web address… on the roadmap"), `home.ts:302`, `partners.ts:64`, compare `cap-whiteLabel` (`compare.ts:159`, `partial`), plus their ledger rows. These change only once 13a1 is live on prod (Q8).
3. **Leak grep findings:**
   - The radar mark and favicon are images, so the regex can't catch them. The crawl must also assert no `data-part="monday"`/RadarMark SVG and no RM icon `link`.
   - The samples agency (`'Rival Monday Samples'`, `waitlist/sample.ts:20`) gets `host_slug` `rival-monday-samples` (R4). Exclude it from the crawl or rename its slug.
   - Allowed as is: agency-audience Rival Monday text and the Friday mascot (`friday-avatar.tsx`).

## Interfaces to bind
- `VoiceSettings` (spec, verbatim), `DEFAULT_VOICE`, `VoiceTerm` (old T16), `effectiveVoice(agency, override)`. Merging is per field (column) or whole object (knob), depending on Q2.
- Storage (Q2): either `knob:voice` in `knobContentSchemas` plus `EffectiveRunbook.voice`, or `AgencyBranding.voice` plus `client.voice_override` jsonb + `GRANT UPDATE (voice_override)` (and `updateAgencyBranding` keeps `voice` the way it keeps `fromEmail`).
- Migration 0114: `brief`/`alert` `review_reason text CHECK IN ('banned_term')`, `review_terms jsonb`.
- `findBannedTerms(text, terms): string[]` (old T18 code), `voiceBlock(v)`, `loadVoice(db, clientId)`. `voice` is passed to `writeBrief`, `writeWhy`, recommendations, `writeAlertText` and tailor/retailor.
- `preview_voice { clientId? } → { text }`, `VOICE_PREVIEWS_PER_DAY = 10`, `ToolDeps.voicePreview?`, `ai.yaml` `voice_preview`, an `ISOLATION_FIXTURES` entry.
- `PLATFORM_BRAND_RE = /rival[\s-]*monday|rivalmonday/i` in `@cs/core`.
- Root `generateMetadata`, host-aware via `requestHost()`, sets `icons` per Q4.
- The `productNameFor` fallback is `resolveBranding(agency.name, branding).displayName` (P17). The Stripe product is `${displayName} competitor monitoring` (P23; existing products are not renamed).

## Risks
- **Legacy-runbook clients:** `effectiveRunbook` falls back to `legacy`, which has no knobs. `loadVoice` must then read the agency runbook directly.
- **13a3 in parallel** edits the same Branding form and jsonb (`headerColor`, dark logo). Expect conflicts in `branding-form.tsx`, `settings.ts` and `AgencyBranding`. Voice in the runbook avoids them.
- **The retry doubles writer cost** whenever a term appears (7b caps apply). A flagged brief blocks auto-send, so the client misses Monday.
- **The matcher misses inflections** ("cheap" vs "cheaper"); say so in the UI hint.
- **Crawl runtime and flakiness.** The alert/brief ids for `--strict-routes` are still unseeded.

## Open questions for the owner (ordered by design impact)
1. **Voice shape.** (a) Structured fields only: tone preset + preferred/banned terms (spec D6, "no free-text prompt"). (b) Free text only: an agency style note. (c) Both: fields plus a ≤ 280-char note. **Recommend (a):** D6 rules out free text (injection and verification risk); revisit after the pilot.
2. **Where voice is stored and edited.** (a) Runbook knob `knob:voice`: agency default on the agency Runbook page, client override on the client Runbook page (R3). Reuses runbook tools, badges and copy chain; whole-object override. (b) `branding.voice` on Branding + `client.voice_override` on the client Runbook page: per-field (spec), 3 new tools, clashes with 13a3. (c) A hybrid: agency default on Branding, client override as a knob. **Recommend (a):** it fits R3, needs fewer tools and avoids 13a3. It amends the spec's "Branding → Voice".
3. **Banned-term behaviour.** (a) Retry once, then flag for AM review: the brief stays `ready` and auto-send skips it; the alert goes `pending_review` (P19). (b) Retry once, then block: drop the item or alert and tell the AM. (c) Auto-rewrite: swap in the preferred term or strip it, no review. **Recommend (a)**. For tailored runbook plays, reject the item and keep the base.
4. **Favicon on agency/MCP hosts (F24 vs CLAUDE.md "never white-label").** (a) Agency logo if set, else neutral. (b) A neutral icon on every non-platform host. (c) The RM mark everywhere. **Recommend (b):** wide logos read poorly at 16 px. Amend CLAUDE.md to "platform host only".
5. **Leak-check E2E scope.** (a) Every route on an agency host (client app, auth, `/l`, `/u`, `/start/<slug>`, 404/error) plus the MCP host's sign-in and consent. (b) A breadth-first crawl from `/c/<id>`, ≤ 60 pages (old T22). (c) A fixed list of key pages. **Recommend (a)** with the route list derived from `app/**/page.tsx` minus platform-only routes, so a new unlisted page fails. Check headers, redirect hops, mark/favicon markup too.
6. **Voice coverage beyond R5.** (a) R5 as written: the P20 writers + tailor/retailor. (b) Also Ask/Friday (`ask_assistant`, `ask_starters`). **Recommend (a) now:** Ask voice touches the guard and the eval cassettes (re-record cost). Backlog (b).
7. **Merge order with 13a1.** (a) Merge 13a1 first (copy review + R9), then 13a2 from `main` in its own worktree (R1). (b) Build 13a2 on `phase-13a` and merge both together. **Recommend (a):** 13a1 is reviewed and green. Holding it widens the diff.
8. **Site white-label FAQ timing.** (a) In 13a2, behind a flag that flips when prod serves the neutral domain. (b) A small site change after 13a1 is live on prod. **Recommend (b):** a claim must be true in the ledger and code first.
9. **Name fallbacks** (`productNameFor`, `kbNamesFor`, `support.ts`). (a) Keep "Rival Monday" for agency staff. (b) The agency display name (P17) and "platform support". **Recommend (b)** for `productNameFor` (reaches clients via MCP) and `support.ts`. Keep (a) for agency-facing KB.
