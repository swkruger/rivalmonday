# Phase 15b-1 — Help system Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`): interfaces and behaviour are binding; implementers write the code. Steps use `- [ ]`.

**Goal:** Build the help system — page-keyed, audience-aware KB guides with a "? Guide" drawer, `HelpTip`/`FieldHint`/`EmptyState`, a typed glossary, Help pages per context — and prove it with pilot content on client Overview, Changes and Reviews.
**Architecture:** One migration adds `help_key` + `audience` to `kb_article`. Guides are repo Markdown seeded by `kb:seed`; glossary and short copy are typed constants. Two web tools (`get_page_guide`, `list_help_guides`) resolve guides per viewer audience; `search_knowledge` gains the audience filter. `PageHeader.helpKey` renders the Guide button.
**Tech stack:** Drizzle/Postgres (RLS), `@cs/core`, `@cs/tools`, Next.js App Router, `@cs/ui` (Popover, Sheet), Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-19-phase-15b-help-system-design.md` (B1–B10, §2–§8). Parent: `docs/superpowers/specs/2026-10-18-phase-15-ux-ia-design.md` D6/D7.

## Global constraints
- Audience values exactly `all | agency | client | operator`. Client roles and guests never receive `agency`/`operator` help (guides, tips, search hits, glossary terms). Agency roles never receive `operator` help.
- No "Rival Monday" in agency/client-facing help output; neutral fallback "your agency" (product) when no display name; assistant name always the agency's (`assistantNameFor`).
- Guides are KB `help` articles; seed rows stay read-only in Platform › Knowledge (6c).
- Web reads via registered tools (`callTool`); new tools are web-only (no `channels`), audited per existing rules.
- `help_key` format `page:<context>.<page>` or `glossary:<termId>`; one row per (`help_key`, `audience`, `level`, agency).
- `client_visible = audience IN ('all','client')` for every `help_key` row.
- Brand tokens only (`border-border`, not `border-line`), US English, sentence case.
- Read `docs/gotchas-cross-cutting.md` and touched packages' `CLAUDE.md` first. Focused tests: `pnpm --filter <pkg> exec vitest run <pattern>`.

## Decisions
Spec B1–B10. Plan-local: **Q1** `PageKey` ids reuse the route's menu identity, dot-separated (`client.overview`, `client.changes`, `client.reviews`, `agency.portfolio`, `agency.settings.team`, `platform.agencies` …); 15b-1 only needs the three pilot keys + the Help pages. **Q2** Guide existence for the button comes from `list_help_guides` (one call per request, `cache()`d) — no extra tool. **Q3** Ask prefill uses the existing `/c/<id>/ask?q=` support (already in `ask/page.tsx`).

## File structure
- `packages/db/src/schema/knowledge.ts` + migration `<next>_kb_help_key.sql`.
- `packages/core/src/help/{glossary.ts,audience.ts,index.ts}`; `packages/core/src/kb.ts` (`renderKbText` + `client`).
- `packages/tools/src/kb/{names.ts,seed.ts}`; `packages/tools/src/tools/help.ts` (new tools); `packages/tools/src/tools/knowledge.ts` (audience filter).
- `docs/help/pages/*.md` (pilot guides).
- `apps/web/src/help/copy/{client,index}.ts`; `apps/web/src/components/help/{help-tip,field-hint,empty-state,page-guide}.tsx`; `apps/web/src/server/help.ts`.
- `apps/web/src/components/page-header.tsx`, `components/shell/avatar-menu.tsx`, `components/shell/context-switcher.tsx`.
- Help pages: `(platform)/platform/help/page.tsx`, `(app)/agency/help/page.tsx`, `(app)/c/[clientId]/help/page.tsx`.

## Dependencies on in-flight work (re-check in Task 0)
- **phase-14b must be merged** (B6). Its migrations (0077–0079+) set the next free number. Its pages (`/platform/verticals`, `/platform/runbook`, `/agency/settings/runbook`, client Runbook tab) get keys in 15b-2, not here.
- 15a interfaces on `main`: `PageHeader` (`helpKey` slot), `AvatarMenu`, `navFor`/`settingsNavFor`, `ContextSwitcher`, `displayNameFor`.

## Review focus
1. A client owner on any client page, Help page or Ask: never sees an agency/operator guide, tip, glossary term or search result.
2. Agency with no display name, white-label: guides, tips and Help pages show "your agency"/assistant name, never "Rival Monday".
3. `kb:seed` re-run idempotent: unchanged guides untouched, edited Markdown updates the row, a removed file removes (or archives per existing seed behaviour) its row; duplicate `help_key`+`audience` fails loudly.
4. A page with a `helpKey` but no guide for the viewer's audience shows no Guide button (no dead drawer).
5. Support session (read-only) and guest viewers: Help pages and the Guide drawer render; no write actions.

---

### Task 0: Pre-flight
- [ ] Confirm `phase-14b` is merged into `main`; `git rebase main`; `pnpm install`; create test DB `cs_phase_15b_test` (rm-kickoff §1 recipe); `pnpm --filter @cs/worker exec vitest run src/boss.test.ts`.
- [ ] Find the next free migration number; re-check every path in this plan; grep `kb_article` writers (`seed.ts`, `write.ts`, demo `kb.ts`) for the new columns' impact. Commit plan fixes `docs(phase-15b): 15b-1 pre-flight`.

### Task 1: Migration — `help_key`, `audience`
**Files:** `packages/db/src/schema/knowledge.ts`; `pnpm --filter @cs/db generate --custom --name=kb_help_key` → SQL; db tests.
**Interfaces (SQL, binding):**
```sql
ALTER TABLE kb_article ADD COLUMN help_key text;
ALTER TABLE kb_article ADD COLUMN audience text NOT NULL DEFAULT 'all';
ALTER TABLE kb_article ADD CONSTRAINT kb_article_audience_check CHECK (audience IN ('all','agency','client','operator'));
CREATE UNIQUE INDEX kb_article_help_key_uq ON kb_article
  (help_key, audience, level, COALESCE(agency_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE help_key IS NOT NULL;
CREATE INDEX kb_article_help_key_idx ON kb_article (help_key) WHERE help_key IS NOT NULL;
```
Drizzle: `helpKey: text('help_key')`, `audience: text('audience').$type<HelpAudience>().notNull().default('all')`.
**Behaviour:** RLS and grants unchanged (columns on an existing table). Existing rows get `audience='all'`, `help_key=null`.
**Tests:** schema test: check constraint rejects `'staff'`; unique index rejects a second platform row with the same key+audience, allows a different audience and an agency-level row with the same key.
**Done when:** `pnpm --filter @cs/db exec vitest run knowledge`, `tsc --noEmit`.

### Task 2: Core — audience, glossary type, placeholders
**Files:** create `packages/core/src/help/{audience.ts,glossary.ts,index.ts}` (+tests); modify `packages/core/src/kb.ts` (+test), `packages/core/src/index.ts`; `packages/tools/src/kb/names.ts` (+test).
**Interfaces:**
```ts
export type HelpAudience = 'all' | 'agency' | 'client' | 'operator';
export type ViewerAudience = Exclude<HelpAudience, 'all'>;
export function visibleAudiences(v: ViewerAudience): HelpAudience[]; // client→['all','client']; agency→['all','agency']; operator→['all','agency','operator']
export function viewerAudience(role: Role | 'guest', context: 'platform' | 'agency' | 'client'): ViewerAudience; // platform context → operator; agency roles → agency; client roles/guest → client
export interface GlossaryTerm { id: string; term: string; audience: HelpAudience; short: string; long?: string; seeAlso?: string[] }
export const GLOSSARY: readonly GlossaryTerm[]; // empty array here; Task 9 fills it
export function glossaryFor(v: ViewerAudience): GlossaryTerm[]; // sorted by term
renderKbText(text, names: { productName: string; assistantName: string; clientName?: string }) // + {{client}}
```
**Behaviour:** `{{client}}` with no `clientName` renders "your business". `kbNamesFor` gains an option `{ clientFacing: boolean }`; client-facing with no agency display name → `productName: 'your agency'` (never `DEFAULT_KB_PRODUCT_NAME`); agency-facing keeps the existing behaviour. `lintKbText` accepts `{{client}}`.
**Tests:** `visibleAudiences`/`viewerAudience` table; `glossaryFor` filters + sorts (with a fixture list); `renderKbText` with/without client; `kbNamesFor` client-facing fallback never "Rival Monday".
**Done when:** `pnpm --filter @cs/core exec vitest run`, `pnpm --filter @cs/tools exec vitest run names`, both `tsc --noEmit`.

### Task 3: Seed — page guides + glossary articles
**Files:** `packages/tools/src/kb/seed.ts` (+test); `apps/worker/src/cli/kb-seed.ts` (paths only if needed); fixture guides under the test folder.
**Interfaces:** `docs/help/pages/<key>[.<audience>].md` front matter `{ help_key: string; audience: HelpAudience; title: string }`; body H2 sections exactly `What this page tells you`, `How to use it`, `Common questions` (in order). Seed key = `${help_key}#${audience}`. Glossary rows: `help_key = 'glossary:<id>'`, `seed_key = 'glossary:<id>#<audience>'`, title = term, body = short (+ long), kind `help`, level `platform`, status `published`.
**Behaviour:** reuse the existing seed's create/update/remove/unchanged logic and counts; set `client_visible = audience IN ('all','client')`; validation errors (duplicate key+audience, unknown audience, missing/out-of-order sections, `lintKbText` failures, `help_key` not matching file name) fail the run with all errors listed. Existing `docs/help/*.md` behaviour unchanged.
**Tests:** seeds two guides (client + agency) and glossary fixtures; re-run is unchanged; edit updates; removed file removed per existing semantics; each validation error; `client_visible` per audience.
**Done when:** `pnpm --filter @cs/tools exec vitest run seed`, `tsc --noEmit`.

### Task 4: Tools — `get_page_guide`, `list_help_guides`, audience in `search_knowledge`
**Files:** create `packages/tools/src/tools/help.ts` (+test), register in `all.ts`; modify `knowledge.ts` (+test); update tool catalogue tests / `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md` row list.
**Interfaces:**
```ts
get_page_guide: input { helpKey: string /* ^page:[a-z0-9.-]+$ */, context: 'platform'|'agency'|'client', clientId?: uuid }
  → { id: string; title: string; sections: { heading: string; markdown: string }[] } | null
list_help_guides: input { context: 'platform'|'agency'|'client', clientId?: uuid }
  → { guides: { helpKey: string; title: string; articleId: string }[] }
```
**Behaviour:** audience = `viewerAudience(ctx.role, context)`; `platform` context requires a platform operator (else `not_found`); client context requires `canAccessClient`. Resolution: rows with `help_key` and `audience ∈ visibleAudiences`, `status='published'`; prefer agency-level row of `ctx.agencyId` over platform; prefer exact audience over `all`. Text rendered via `renderKbText` + `kbNamesFor(..., { clientFacing: audience==='client' })`, split into the three H2 sections. `list_help_guides` returns one entry per `help_key` (same preference), `page:` keys only. `search_knowledge`: add `audience IN visibleAudiences(<caller audience>)` to its filter for all channels (caller audience from role; MCP/Ask client tokens → client).
**Tests:** resolution matrix (client never gets agency/operator; agency-level beats platform; exact beats all; null when none); operator-only platform context; foreign client `not_found`; `search_knowledge` hides agency guide from a client on web, ask and mcp channels; white-label names rendered.
**Done when:** `pnpm --filter @cs/tools exec vitest run help knowledge`, `tsc --noEmit`.

### Task 5: Copy module + `HelpTip`, `FieldHint`, `EmptyState`
**Files:** create `apps/web/src/help/copy/{client.ts,index.ts}`, `apps/web/src/components/help/{help-tip,field-hint,empty-state}.tsx` (+tests).
**Interfaces:**
```ts
export type PageKey = 'client.overview' | 'client.changes' | 'client.reviews'; // 15b-2 extends
export interface Tip { title: string; body: string; audience?: HelpAudience; guideAnchor?: string }
export interface EmptyCopy { title: string; body: string; audience?: HelpAudience }
export interface PageCopy { description: string; tips?: Record<string, Tip>; empty?: Record<string, EmptyCopy> }
export const PAGE_COPY: Record<PageKey, PageCopy>;
export type TipKey = { [K in PageKey]: `${K}.${Extract<keyof NonNullable<(typeof PAGE_COPY)[K]['tips']>, string>}` }[PageKey];
export function renderCopy(text: string, names: { agency: string; assistant: string; client?: string }): string; // {agency} {assistant} {client}
HelpTip(props: { term: string } | { tip: TipKey }; label?: string)   // client component; resolved text passed from server or resolved client-side from constants
FieldHint({ id, children }); useFieldHint(id): { hintId: string; describedBy: { 'aria-describedby': string } }
EmptyState({ title, body, action?, guideAnchor? })
```
**Behaviour:** `HelpTip` = 16px "?" button (`aria-label` "What is {term}?" / tip title), Popover opens on click/tap/Enter/Space and on hover when `(pointer: fine)`; Escape closes and returns focus; content title + body + optional "More in the guide →" (dispatches an `open-page-guide` event with `guideAnchor`). Tips/terms filtered by the viewer's audience: a term/tip not visible to the audience renders nothing. `PAGE_COPY` entries for the 3 pilot keys are filled in Task 9 (placeholders here are fine for types; no user-facing placeholder text ships — Task 9 replaces).
**Tests:** keyboard open/close/focus return; touch open; hover only with fine pointer; aria; audience filtering; `FieldHint` ids; `EmptyState` renders action.
**Done when:** `pnpm --filter @cs/web exec vitest run help`, `tsc --noEmit`.

### Task 6: `PageGuide` + `PageHeader` Guide button
**Files:** create `apps/web/src/components/help/page-guide.tsx` (+test), `apps/web/src/server/help.ts` (+test), server action for lazy load; modify `components/page-header.tsx` (+test).
**Interfaces:** `PageHeader({ …, helpKey?: string, guide?: boolean })`; `export const helpGuides = cache(async (ctx, context, clientId?) => Set<string>)` (via `list_help_guides`, failure → empty set); `loadPageGuide(helpKey, context, clientId?)` server action → `get_page_guide`.
**Behaviour:** button "? Guide" before page actions when `helpKey && guide`; opens right `Sheet` (full-screen below `md`), loads on open, skeleton while loading, `ErrorNote` on failure; renders the three sections (Markdown via the existing KB renderer), scrolls to `guideAnchor` when opened from a `HelpTip`; footer "Open full article" (`/kb/<id>`) and, when the viewer has `ask` and a client context, "Ask {assistant} about this page" → `/c/<id>/ask?q=<encoded "Explain the {title} page">`. Listens for `open-page-guide` events.
**Tests:** button hidden without guide; lazy load once; anchor scroll; Ask link only with ask + client; read-only/support renders.
**Done when:** `pnpm --filter @cs/web exec vitest run page-guide page-header help`, `tsc --noEmit`.

### Task 7: Help pages + avatar Help link
**Files:** create `(platform)/platform/help/page.tsx`, `(app)/agency/help/page.tsx`, `(app)/c/[clientId]/help/page.tsx` (+tests), shared `components/help/help-index.tsx`; modify `components/shell/avatar-menu.tsx` (+test), `page-titles.test.ts`, demo coverage (`packages/demo/src/coverage.ts`).
**Behaviour:** `PageHeader` title "Help" (metadata title "Help"); search form (GET `?q=`) → `search_knowledge` results (audience-filtered) linking `/kb/<id>`; guides grouped by the context's `navFor` sections (match `helpKey` page ids to menu items; ungrouped → "Other"); glossary A–Z (`glossaryFor`); "Ask {assistant}" link when the viewer has `ask` (client context → `/c/<id>/ask`; agency context → omitted unless a client is in scope); client roles: "Contact your agency" with the agency support email when set. Platform page operators only (404 otherwise); agency page agency roles; client page anyone who can access the client (guests included). Avatar menu "Help" → `/platform/help` | `/agency/help` | `/c/<id>/help` by current context (`useNavContext`).
**Tests:** per-role access (404s), audience filtering of guides/glossary/search, grouping, Ask/contact lines, avatar link per context.
**Done when:** `pnpm --filter @cs/web exec vitest run help avatar page-titles`, `pnpm --filter @cs/demo exec vitest run`, `tsc --noEmit`.

### Task 8: Folded fixes
**Files:** `components/shell/context-switcher.tsx` (+test); client settings nav flags (`server/client-settings-nav.ts`, `components/shell/nav-items.ts` +tests).
**Behaviour:** pin button is a sibling of the `CommandItem` (not nested inside `role="option"`), still `aria-pressed`/`aria-label`, reachable by Tab; support viewers see the "AI connection" client settings tab when the page serves them (do not change the `mcp` flag's meaning for the sidebar — add a settings-only condition).
**Tests:** axe-style structure assertion (no interactive descendant of `role=option`); support session tab list.
**Done when:** `pnpm --filter @cs/web exec vitest run switcher settings`, `tsc --noEmit`.

### Task 9: Pilot content (draft for owner sign-off)
**Files:** `packages/core/src/help/glossary.ts` (fill `GLOSSARY`, ~25 terms from audit §3 Terminology: competitor/Top rival tier, change, move, signal, brief, report, alert, pressure, score, routing, confidence, tier, seat, business type, paused (service vs client), share of voice, local pack, average map rank, review velocity, reply rate, theme, starting point, recommendation, evidence); `docs/help/pages/client.{overview,changes,reviews}[.agency|.client].md`; `apps/web/src/help/copy/client.ts` (descriptions, tips, empty states for the 3 pages); apply `PageHeader helpKey`, `HelpTip`, `EmptyState` on `c/[clientId]/page.tsx`, `changes`, `reviews` pages.
**Behaviour:** copy derived from the code's real definitions (cite the source function in a comment where a metric is defined); audiences per B2; placeholders per B9; miles not km; assistant name never hard-coded. Write `docs/archive/phase-15b1-copy-signoff.md` listing every new string grouped by page/term with its audience (the controller publishes it as a shared doc for the owner).
**Tests:** seed validation passes on the real files; pilot pages render guide button + tips for agency and client viewers with the right versions; leak test covers them.
**Done when:** `pnpm kb:seed` against the test DB succeeds (or the seed test over real files), `pnpm --filter @cs/web exec vitest run "c/[clientId]" help`, `tsc --noEmit`.

### Task 10: White-label, E2E, affected rules
**Files:** `apps/web/src/app/white-label-leak.test.tsx`; create `apps/web/e2e/help.spec.ts` (`@help`); `apps/web/scripts/e2e-affected-rules.ts`; E2E seed for pilot guides (seed runs in global setup or fixture).
**Scenarios:** client owner opens Reviews guide → client version, agency version text absent; agency admin sees agency version; `HelpTip` keyboard open/close; Help page search finds a guide and the glossary shows client terms only; "Ask {assistant} about this page" opens Ask with the prefilled question.
**Done when:** `pnpm --filter @cs/web e2e:affected` green; vitest leak test green.

### Task 11: Final review + docs
- [ ] Whole-branch review (most capable model): `pnpm test:affected --base main`, `pnpm --filter @cs/web e2e:affected --base main`; one fix wave.
- [ ] Update `docs/work/phase-15b.md` (Status, Interfaces, owner steps: run `pnpm kb:seed` on `cs_dev` after merge; check pilot pages as agency + client; sign off the copy doc). Commit.
