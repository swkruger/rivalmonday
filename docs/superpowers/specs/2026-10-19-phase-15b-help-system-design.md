# Phase 15b — Help system & per-page help (design)

**Status:** owner-approved in brainstorming 2026-10-19 · **Branch:** `phase-15b` · **Builds on:** [Phase 15 spec](2026-10-18-phase-15-ux-ia-design.md) D6 (help layers 1–4), D7 (content keyed by page, white-label, override-ready), §2.7 (`PageHeader.helpKey`), §4; Phase 6c knowledge base (k1–k11: operator-only authoring, read-time placeholders, `search_knowledge`); [UX audit](../../research/2026-10-18-phase-15-ux-audit.md) items tagged 15b. Only new decisions and interfaces here.

## 1. Decisions (owner-approved)

| # | Decision |
|---|---|
| B1 | Split: **15b-1** system (components, guide drawer, page keying, Help pages, glossary, pilot content on 3 pages); **15b-2** content (guides, tips, descriptions, empty states for every remaining page, incl. 14b's). |
| B2 | Help has an **audience**: `all` · `agency` (agency staff) · `client` (client owner/viewer, guests) · `operator` (platform). A page may have one `all` guide or audience-specific versions. Client roles never receive agency/operator help. |
| B3 | Claude drafts all copy from code, audit and specs; owner signs off per batch (platform, agency, client, glossary) in a shared document; the approved doc is archived in `docs/archive/`. |
| B4 | Help pages `/platform/help`, `/agency/help`, `/c/<id>/help`: search, guides grouped like the menu, glossary A–Z, "Ask {assistant}" (users with `ask`), "Contact your agency" (client roles). Avatar-menu **Help** opens the current context's page. |
| B5 | Guides are KB `help` articles: `search_knowledge` (Ask, MCP) finds and cites them, filtered by the caller's audience. |
| B6 | Timing: 15b-1 executes **after `phase-14b` merges** (no migration-number clash; 14b pages get keys); 15b-2 follows 15b-1. |
| B7 | Guides are Markdown in the repo, loaded by `pnpm kb:seed` (seed rows stay read-only in Platform › Knowledge, 6c). Editing = change the file + run `kb:seed` (no app redeploy). |
| B8 | Short copy (page descriptions, tips, empty states) = typed TypeScript constants; glossary = one typed list in `@cs/core` that feeds term tips, the Help page and generated KB articles (one source). |
| B9 | Placeholders stay `{{product}}`/`{{assistant}}`, add `{{client}}`; with no agency display name the client-facing fallback is neutral ("your agency" / "our"), never "Rival Monday". |
| B10 | Backlog: product tour, agency guide override editor, console editor for platform guides, help-usage analytics, first-visit "new" hints. |

## 2. Data model (15b-1, one migration — next free number at execution, after 14b)

```sql
ALTER TABLE kb_article ADD COLUMN help_key text;                       -- 'page:client.reviews' | 'glossary:seat' | null
ALTER TABLE kb_article ADD COLUMN audience text NOT NULL DEFAULT 'all'
  CHECK (audience IN ('all','agency','client','operator'));
CREATE UNIQUE INDEX kb_article_help_key_uq ON kb_article
  (help_key, audience, level, COALESCE(agency_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE help_key IS NOT NULL;
CREATE INDEX kb_article_help_key_idx ON kb_article (help_key) WHERE help_key IS NOT NULL;
```
- `help_key` format: `page:<context>.<page>` (context `platform|agency|client|account`; page = the route's menu id, e.g. `client.reviews`, `agency.settings.team`, `client.briefs.detail`) or `glossary:<termId>`.
- Existing RLS/levels unchanged; audience is an extra filter applied in tools (not a tenancy boundary). Existing `client_visible` stays consistent: for `help_key` rows the seed sets `client_visible = audience IN ('all','client')`, so every existing client-visibility check keeps hiding agency/operator help.
- Agency overrides later = a row with the same `help_key`/`audience` at level `agency` (no further schema change).

## 3. Content sources

- **Guides:** `docs/help/pages/<help_key minus "page:">[.<audience>].md`, front matter:
  ```yaml
  help_key: page:client.reviews
  audience: client            # all | agency | client | operator
  title: Reviews
  ```
  Body sections (H2, fixed order): `What this page tells you` · `How to use it` · `Common questions`. Placeholders per B9.
- **Glossary:** `packages/core/src/help/glossary.ts`
  ```ts
  export interface GlossaryTerm { id: string; term: string; audience: HelpAudience; short: string; long?: string; seeAlso?: string[] }
  export type HelpAudience = 'all' | 'agency' | 'client' | 'operator';
  export const GLOSSARY: readonly GlossaryTerm[];
  export function glossaryFor(audience: Exclude<HelpAudience, 'all'>): GlossaryTerm[]; // includes 'all'
  ```
  `kb:seed` generates one `help` article per term (`help_key = glossary:<id>`, `seed_key = glossary:<id>`).
- **Short copy:** `apps/web/src/help/copy/{platform,agency,client,account}.ts`
  ```ts
  export interface PageCopy { description: string; tips?: Record<string, Tip>; empty?: Record<string, EmptyCopy> }
  export interface Tip { title: string; body: string; audience?: HelpAudience; guideAnchor?: string }
  export interface EmptyCopy { title: string; body: string; audience?: HelpAudience }
  export const PAGE_COPY: Record<PageKey, PageCopy>;   // PageKey = 'client.reviews' | … (union, typed)
  export function tipFor(key: `${PageKey}.${string}`): Tip;  // compile-time keyed
  ```
  Strings may use `{assistant}`/`{agency}`/`{client}`, rendered with the viewer's names (same neutral fallback).
- **Seed:** `packages/tools/src/kb/seed.ts` reads `docs/help/pages/**` front matter + glossary; validates (unique `help_key`+`audience`, known audience, required sections, `lintKbText`); fails the CLI on errors. Existing `docs/help/*.md` articles unchanged.

## 4. Tools & server (15b-1)

| Tool | Channels | Input → output | Rules |
|---|---|---|---|
| `get_page_guide` | web | `{ helpKey: string, clientId?: uuid }` → `{ id, title, sections: {heading, html}[] } \| null` | Viewer audience: operator in platform context → `operator`, agency roles → `agency`, client roles/guests → `client`. Resolution order: agency-level row for the viewer's agency (future overrides) → platform row; audience-specific → `all`. Rendered with names (B9). `null` when none. |
| `list_help_guides` | web | `{ context: 'platform'\|'agency'\|'client', clientId?: uuid }` → `{ groups: { label, items: { helpKey, title, articleId }[] }[] }` | Same audience rule; grouping = `navFor` sections of that context. |
| `search_knowledge` (existing) | web, ask, mcp | + audience filter | Client callers never get `agency`/`operator` rows; agency callers never get `operator` rows. |

- `has_page_guide` is not a tool: `PageHeader` receives `guide={await pageGuideExists(helpKey)}` from a request-`cache()`d server helper that reads through `list_help_guides` data (one call per request, shared).
- `renderKbText(text, names)` gains `client`; `kbNamesFor` returns the neutral fallback for client-facing calls (B9).

## 5. Components (15b-1, `apps/web/src/components/help/`)

- `HelpTip({ term?: string; tip?: TipKey; label?: string })` — 16px "?" button, `aria-label="What is {term}?"`, `aria-expanded`; Popover on click/tap/Enter/Space, also on hover (pointer: fine); content = title, body, optional "More in the guide →" (opens `PageGuide`, scrolls to `guideAnchor`). Exactly one of `term`/`tip`.
- `FieldHint({ id: string; children })` + `useFieldHint(id)` → `{ hintId, 'aria-describedby' }` for inputs.
- `EmptyState({ title; body; action?: ReactNode; guideAnchor?: string })` — replaces bespoke empty states (15b-2 applies it).
- `PageGuide` — `PageHeader` renders a "? Guide" button (actions area, before page actions) when `helpKey` and `guide` are truthy; opens a right `Sheet` (full-screen below `md`), lazy-loads `get_page_guide` via a server action, renders sections; footer: "Open full article" (`/kb/<id>`), "Ask {assistant} about this page" (when `ask`; links `/c/<id>/ask?q=<encoded starter>` — add `?q` prefill to the Ask composer if absent). Loading + error states use existing patterns.
- `PageHeader`: `helpKey` now renders the button (prop `guide?: boolean`); no change for pages without a key.
- Help pages: `(platform)/platform/help/page.tsx`, `(app)/agency/help/page.tsx`, `(app)/c/[clientId]/help/page.tsx` — `PageHeader` title "Help", search (`search_knowledge`, audience-filtered, results link to `/kb/<id>`), guide groups (`list_help_guides`), glossary (`glossaryFor`), Ask link, client "Contact your agency" (agency support email if set, else omitted). `AvatarMenu` gains **Help** → current context's Help page.
- Fixes folded in: switcher pin button no longer nested in `role="option"` (a11y); support viewers see the AI connection settings tab when the page serves them.

## 6. 15b-1 pilot content
Guides + tips + descriptions + empty states for `client.overview`, `client.changes`, `client.reviews` (client and agency versions where they differ) and the full glossary (~25 terms, audit §3 Terminology). Owner sign-off per B3 before merge.

## 7. 15b-2 (content wave)
Every page with a `PageHeader` gets `helpKey`, `PAGE_COPY` description, tips for metrics/terms the audit names, `EmptyState` copy, and a guide (one `all` or per-audience). Includes 14b pages (Business types, platform/agency/client Runbook, new-business-type panel) and terminology fixes from audit §3 (hard-coded "Friday" → `assistantName`, "After AM check" → "I review alerts first", seat = active client, theme/topic, etc.). Batches signed off per B3. 15b-2's plan is written after 15b-1 merges.

## 8. Testing
- Unit: `get_page_guide` resolution (agency-level before platform; audience-specific before `all`; client never gets agency/operator; null when none); `list_help_guides` grouping + audience; `search_knowledge` audience filter on web/ask/mcp; `renderKbText` names + neutral fallback; seed validation (duplicate key+audience, bad audience, missing sections) and glossary article generation; `HelpTip` keyboard/touch/aria; `FieldHint` wiring; `PageGuide` button only when `guide`; Help pages per role.
- Coverage test (enforced from 15b-2): every `PageHeader` page has a `helpKey`; every used `helpKey` has a guide for each audience that can reach the page; every `tipFor` key exists.
- White-label leak test extended to guides, tips and Help pages.
- E2E: open the Reviews guide (client sees client version, agency sees agency version); Help page search; "Ask {assistant} about this page" prefill; keyboard open/close of a `HelpTip`.
