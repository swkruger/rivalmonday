# Phase 16d — Friday + briefs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask page, docked Friday panel (D-14), evidence citation pills + sources lists, brief/alert/report reading views on design system v1 — look only (D1), plus the one new UI piece D11 names (the docked panel).

**Architecture:** One web-only read tool (`get_evidence_refs`) turns evidence ids into display refs (competitor, channel, date); a server helper formats them in the viewer's tz and every evidence chip becomes a `CitationPill` (falling back to today's "Evidence n" when no ref is known). The client layout mounts a `FridayDock` provider; `PageHeader` renders its trigger; the panel is a third column at ≥ 1280 px and a right `Sheet` below, hosting `AskChat` in `mode="panel"`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, `@cs/ui` (shadcn/radix), `@cs/tools` (`defineTool`, zod), Vitest + Testing Library, Playwright (+ `@axe-core/playwright` shots harness).

**Spec:** `docs/superpowers/specs/2026-10-27-phase-16-design-system-design.md` (§ 2 D10–D19, § 3 row 16d). Recipes: `docs/design-system/09-ai-implementation-playbook.md` § 4.8, § 5.5, § 6.1, § 6.2 rows `ask-screen.tsx`, `ask-card.tsx`, `ask-chat.tsx`, `views/*`, `briefs/page.tsx`, item 7 (bubbles) — **binding; tasks cite them instead of repeating class strings.** D-14/D-26 in `04-design-decisions.md`; Frame 12 in `07-visual-storyboard.md`. Brief/decisions: `docs/work/phase-16.md`.

## Global Constraints
- D1 look only: no route, permission, copy (except the lines in Decisions P8) or behaviour change outside the docked panel. Accessible names keep working: a pill with a ref is named `Evidence {n}: {source}, {date}`, without one exactly `Evidence {n}` (today's name).
- Tokens only (`packages/ui/CLAUDE.md`): no hex, `rounded-[…]`, `text-[…px]`, shadow literals in touched lines; `text-13`/`text-11` for 13/11 px; the playbook's `text-[30px]` → `text-3xl`, `leading-[26px]`/`leading-[22px]` → nearest scale (`leading-relaxed` on `text-base`, `leading-normal` on `text-sm`), `max-w-[680px]` stays (layout width, like 16a's onboarding widths).
- Focus `focus-visible:outline-2 outline-offset-2 outline-ring` (fixed, never agency-coloured). Friday amber only on `FridayBadge`/the trigger.
- Web reads are registered tools via `callTool`/`tryCallTool`; the client layout never refuses or 404s (it only adds things).
- Tests (D16): class assertions → role / `data-slot` / `data-variant` / `data-tone` in the task that breaks them; E2E role-based. A new component/route needs an `scripts/e2e-affected-rules.ts` rule; a new tool needs an `ISOLATION_FIXTURES` entry.
- Implementers run focused tests only (`apps/web/node_modules/.bin/vitest run <pattern>` from `apps/web`, `packages/ui/node_modules/.bin/vitest run <pattern>`, `pnpm --filter @cs/tools exec vitest run <pattern>`); `test:affected`, `e2e:affected` and shots run once, in Task 8. Test DB = this worktree's `.env`; E2E and shots share port 3100 — never concurrently. Commit by explicit paths (`git commit -- <paths>`), never amend.
- Commit trailer `Co-Authored-By: <your model> <noreply@anthropic.com>`; LF only.

## Decisions (Claude's calls under D10 — recorded for the owner's end review)
- **P1 Refs tool.** `get_evidence_refs` (web-only, `permission: 'read'`, no feature — like `get_evidence`, decision 2: briefs-only clients' chips must work). Ids the viewer can't reach are dropped silently (a stale citation keeps its fallback pill); all ids unreachable → `not_found` (isolation rule: never an empty answer for a foreign target).
- **P2 Pill content.** Visible text = competitor name; `date` = capture date in the viewer's tz (`formatDate`); SourcesList title = `{competitor} · {channelLabel}`. Numbers stay in the accessible name only.
- **P3 One wiring point.** `EvidenceChips` renders `CitationPill`s everywhere (brief, alert, approvals, recommendations); only brief/alert/Ask pass refs in 16d. Other callers show the fallback pill (`Evidence n`) — look changes, names don't. Approvals/recommendations refs → 16e backlog line.
- **P4 Answer chips.** `ev` → `CitationPill` (n + ref); `kb` (Article) and `app` (Data) keep their behaviour and names but take `citationPillClass`. "Possible reason:" label → `text-ink-secondary font-medium`.
- **P5 SourcesList** under each assistant answer with ≥ 1 resolved `ev` ref, in first-citation order; none under briefs/alerts (pills sit on each item).
- **P6 Dock.** Trigger in `PageHeader` (client component `FridayDockTrigger`, null without a dock context or on `/c/<id>/ask*`); panel state lives in the client layout, so it survives client-side navigation between that client's pages and resets on another client or a full load. ≥ 1280 px: third column 400 px (`border-l border-line`, no shadow, sticky, own scroll); < 1280: `Sheet side="right"` (`w-full sm:max-w-[400px]`). Mobile full-screen route (D-14 note) → 16f.
- **P7 Panel chat.** `AskChat mode="panel"`: new conversation per open-session; keeps local turns as the transcript, takes the thread id from `x-ask-thread-id` (no `router.replace/refresh`); "Open full conversation" links to `/c/<id>/ask/<threadId>`. A proposed write in the panel renders a link to that thread instead of the confirm card (confirming needs the server transcript). Seed/`?q=` flows stay page-only.
- **P8 New copy (owner sign-off line in the work file):** panel heading `Ask {name}` (existing string), close button `Close {name}`, link `Open full conversation`, proposed-write line `Open the full conversation to confirm this change.`, scope chip `{client name}` (no count — the count would be new content).
- **P9 Not built** (backlog, D11): feedback icons, follow-up suggestions after answers, conversation title in the panel, toast "Brief shared … Undo" (Frame 12), mobile full-screen Friday route (16f).
- **P10 Headings.** Brief reading view: item headlines and "Where you stand" become `h2` (under the page `h1`; today `h3` after an `h1` skips a level); the Overview surface keeps `h3` under its Section `h2`. Alert/report views keep their levels.

## File Structure
- `packages/tools/src/tools/evidence.ts` (+ `getEvidenceRefs`), `tools/schemas.ts` (`EvidenceRefsView`), `isolation/fixtures.ts`; test `tools/evidence-refs.test.ts`.
- `packages/ui/src/components/citation-pill.tsx` (+ test), `control-classes.ts` (`nativeInputClass`), `index.ts`.
- `apps/web/src/server/evidence-refs.ts` (new, `server-only`) + test.
- `apps/web/src/components/evidence-chips.tsx`, `views/{brief-view,alert-view,report-view}.tsx`, `views/views.test.tsx`.
- `apps/web/src/app/(app)/c/[clientId]/{briefs/page.tsx,briefs/[briefId]/page.tsx,alerts/[alertId]/page.tsx,reports/[reportId]/page.tsx}` (pass refs / wrappers).
- `apps/web/src/components/ask/{answer,ask-chat,starter-chips,confirm-card,thread-list,ask-card}.tsx` (+ tests); `app/(app)/c/[clientId]/ask/{ask-screen.tsx,actions.ts}`.
- New `apps/web/src/components/ask/{friday-dock.tsx,friday-dock-trigger.tsx}` (+ tests); `app/(app)/c/[clientId]/layout.tsx`; `components/page-header.tsx`.
- Minors: `components/help/help-tip.tsx`, `components/recommendation-board.tsx`, `app/(app)/c/[clientId]/reviews/*` (input class).
- `apps/web/e2e-shots/routes.ts`, `e2e-shots/shots.spec.ts` (fixtures), `e2e/ask.spec.ts`, `scripts/e2e-affected-rules.ts`.

## Dependencies on in-flight work
None (only `phase-16` is unmerged; this is it). 16a–16c primitives used: `CitationPill`, `SourcesList`, `FridayBadge size="label"`, `Section`, `Band`, `Tag`, `Sheet`, `Table`, `nativeSelectClass`/`textareaClass`. Task 0 re-checks they exist with these props.

## Review Focus
1. **Dock across navigation and breakpoints** — open the panel on Overview, ask, navigate to Competitors: same conversation; resize 1440 → 1100 → 1440: column ↔ sheet without losing turns; on `/c/<id>/ask` no trigger and no panel; another client's pages start closed → Task 5 tests.
2. **Unknown/foreign/retracted citation ids** — a cited `ev:` id whose evidence is unreachable or deleted renders the fallback pill `Evidence n` linking to the evidence page (which 404s as today) and no SourcesList row; the refs tool never returns a foreign competitor's name; all-foreign ids → `not_found`, which the helper turns into `{}` → Tasks 1, 2 tests.
3. **Long names in 400 px and 390 px** — a 60-character competitor name in a pill and a sources row truncates (pill `max-w-full truncate`, row `min-w-0 truncate`); no horizontal page scroll in the panel or brief at 390 → Tasks 2, 4 tests + shots.
4. **Viewers without Ask** — guest (`contact:`), support session, plan without `ask`, out-of-scope client id in the URL: no trigger, no starters call, layout renders children unchanged (refusal swallowed), page still 404s on its own → Task 5 tests.
5. **Panel turn failure and new-thread id** — a network error shows the error copy in the panel and the next question still works; the first answer's `x-ask-thread-id` is reused for the second question (one thread, not two) → Task 5 tests.

---

### Task 0: Pre-flight
- [ ] Shots from the 16c open items passed with gates on and those fixes are committed (`fix(ui,web): scroll regions keyboard-reachable (16c axe)`, `test(web): wait for the unarchive dialog to close`). `git status` clean; `main` unmoved (else `git rebase main` + `pnpm install`).
- [ ] Confirm `@cs/ui` exports `CitationPill, SourcesList, FridayBadge, Section, Band, Tag, Sheet, SheetContent, SheetTitle` and `FridayBadge` has `size="label"`; record `pnpm design:lint` total (177 after 16c) in the work file § Status. If anything named here moved, fix this plan inline; commit `docs(phase-16): 16d pre-flight` only if changed.

### Task 1: `get_evidence_refs` tool
**Goal:** batch-resolve evidence ids to display refs, scoped like `get_evidence`.
**Files:** modify `packages/tools/src/tools/evidence.ts`, `tools/schemas.ts`, `isolation/fixtures.ts`, `index.ts` (type export); create `packages/tools/src/tools/evidence-refs.test.ts`.
**Interfaces (binding):**
```ts
// schemas.ts
export const EvidenceRefsView = z.object({ items: z.array(z.object({
  evidenceId: z.string().uuid(), competitorName: z.string(), channelLabel: z.string(), capturedAt: z.string(), // ISO
})) });
export type EvidenceRef = z.infer<typeof EvidenceRefsView>['items'][number];
// evidence.ts
export const getEvidenceRefs = defineTool({ name: 'get_evidence_refs', access: 'read', permission: 'read',
  input: z.object({ clientId: uuid, evidenceIds: z.array(uuid).min(1).max(60) }), output: EvidenceRefsView, /* no channels: web-only */ … });
// evidenceTools = [getEvidence, getEvidenceRefs, compareSnapshots, compareCaptures]
```
**Behaviour:** `workspaceClient` first (foreign client → `not_found`); one select over `evidence ⋈ capture ⋈ competitor` with `inArray(evidence.id, unique ids)`; keep rows whose competitor passes `competitorLinked` (call once per distinct competitor, not per row); output in input order, duplicates once; zero kept → `ToolError('not_found', 'Evidence not found')`. `channelLabel(capture.source)`. Description: "Display labels (competitor, channel, capture time) for evidence the viewer can open; unknown ids are left out."
**Follow pattern:** `getEvidence` (same file); fixture `get_evidence` line in `isolation/fixtures.ts` (`evidenceIds: [idOf(w, 'evidence', competitorTenant(t), 1)]`).
**Tests (first):** `evidence-refs.test.ts` (use the `get_evidence` test's world helpers): returns `{evidenceId, competitorName, channelLabel, capturedAt}` for a tracked competitor's evidence; input order kept and duplicates collapsed; an id of an untracked competitor is dropped while a valid one stays; only-foreign ids → `not_found`; a client role sees an alert-cited competitor only once the alert is `delivered` (decision 7, mirrors `competitorLinked`); > 60 ids → `invalid_input`. Isolation suite passes with the new fixture.
**Done when:** `pnpm --filter @cs/tools exec vitest run evidence-refs isolation` green; `pnpm --filter @cs/tools exec tsc --noEmit` clean. Commit `feat(tools): get_evidence_refs display refs for citation pills (16d)`.

### Task 2: CitationPill fallback + EvidenceChips wiring + refs helper
**Goal:** every evidence chip is a `CitationPill`; refs make it name the source.
**Files:** modify `packages/ui/src/components/citation-pill.tsx` (+ test), `index.ts`; create `apps/web/src/server/evidence-refs.ts` (+ `evidence-refs.test.ts`); modify `apps/web/src/components/evidence-chips.tsx` (+ test if present, else add `evidence-chips.test.tsx`).
**Interfaces (binding):**
```ts
// @cs/ui
type CitationPillProps = { href: string; icon?: LucideIcon; className?: string } &
  ({ source: string; date?: string; n?: number } | { source?: undefined; date?: undefined; n: number });
// visible text: source ?? `Evidence ${n}`
// aria-label: (n === undefined ? 'Evidence' : `Evidence ${n}`) + (source ? `: ${source}` : '') + (date ? `, ${date}` : '')
//   → 16a's "Evidence: {source}, {date}" unchanged; fallback "Evidence 2"
export const citationPillClass: string; // the pill's class string, exported for Article/Data chips (Task 4)
// apps/web/src/server/evidence-refs.ts ('server-only')
export type EvidenceRefDisplay = { source: string; channel: string; date: string };
export type EvidenceRefs = Record<string, EvidenceRefDisplay>; // keyed by evidence id; plain object (crosses to client components)
export async function evidenceRefsFor(ctx: AccessContext, clientId: string, ids: readonly string[], timezone: string): Promise<EvidenceRefs>;
// apps/web/src/components/evidence-chips.tsx (no 'use client', as today)
export function EvidenceChips(props: { clientId: string; ids: string[]; max?: number; refs?: EvidenceRefs }): JSX.Element | null;
```
**Behaviour:** pill gets `max-w-full` and the visible span `truncate` (Review Focus 3). `evidenceRefsFor`: empty/invalid ids → `{}` without a call; ids deduped, chunked at 60; `tryCallTool` (a refusal → `{}`, never throws); `date = formatDate(capturedAt, { tz: timezone })`, `source = competitorName`, `channel = channelLabel`. `EvidenceChips`: chip i → `<CitationPill href={evidenceHref(clientId,id)} n={i+1} {...(refs?.[id] ? { source, date } : {})} />`; `+N more` line unchanged (`text-xs text-muted-ink`).
**Follow pattern:** `tryCallTool` use in `app/(app)/c/[clientId]/changes/page.tsx`; formatting via `@/lib/format`.
**Tests (first):** ui: fallback renders text `Evidence 2` and name exactly `Evidence 2`; with `n` + source + date name `Evidence 1: Smith HVAC, Oct 20, 2026`; 16a assertion (no n) still `Evidence: …`; visible span has `aria-hidden`. Helper: `{}` for `[]` with no tool call (mock `@/server/tools`); refusal → `{}`; dedupes; formats in the given tz (an ISO near midnight UTC renders the previous day in `America/Chicago`). Chips: with refs → link name `Evidence 1: Smith HVAC, …` and `href` to the evidence page; without → `Evidence 1`; `max` and `+N more` unchanged; `data-slot="citation-pill"` on each.
**Done when:** focused ui + web tests green; `grep -rn "rounded-md bg-primary-soft px-2" apps/web/src/components/evidence-chips.tsx` empty. Commit `feat(ui,web): evidence chips are citation pills with source refs (16d)`.

### Task 3: Brief, alert and report reading views (L5)
**Goal:** reading archetype for `/briefs/<id>`, `/alerts/<id>`, `/reports/<id>`; briefs list unwrapped.
**Files:** modify `apps/web/src/components/views/{brief-view,alert-view,report-view}.tsx`, `views/views.test.tsx`; pages `c/[clientId]/briefs/[briefId]/page.tsx`, `alerts/[alertId]/page.tsx`, `reports/[reportId]/page.tsx`, `briefs/page.tsx` (+ their tests where they assert classes).
**Interfaces (binding):** `BriefView` `surface?: 'reading' | 'overview'` (default `'reading'`; `'card'` removed — grep callers) and new `refs?: EvidenceRefs`; `AlertView` + `refs?: EvidenceRefs`. Pages compute refs with `evidenceRefsFor(ctx, clientId, ids, profile.timezone)` (brief: all active items' ids for client roles, all items' for agency; alert: `alert.evidenceIds`) inside their existing `Promise.all` where possible.
**Behaviour:**
- Reading surface per 09 § 5.5: `mx-auto w-full max-w-[680px]`; own title only when `titled` (`text-3xl font-semibold tracking-tight`); chips/links row under it; summary paragraph `text-base leading-relaxed`; each item a `<section id="item-<id>" data-slot="brief-item">` with `border-t border-line py-6 first:border-t-0`, headline `h2 text-lg font-semibold` (P10), competitor + what changed as body, `whyItMatters` in `<Band tone="muted">` (`text-sm`), "Recommended:" label `font-semibold text-ink`, pills row (`EvidenceChips` with refs), upsell → `StatusChip tone="warning"` (agency only, same text `Upsell: {tag}`), status chip unchanged, confidence → `<Tag>` with the same text. Drop the amber/primary left border and `opacity-60` stays for non-active (agency). "Where you stand" `h2 text-lg font-semibold`. TrendTable → `@cs/ui` `Table` with its `<caption>` kept (text unchanged), `numeric` cells.
- Overview surface: only literal fixes (`text-[15px] font-bold` → `text-base font-semibold`, item container as above but `h3`, `py-4`), structure unchanged.
- `AlertView`: no `Card`; header row = competitor name (`text-sm font-medium text-ink-secondary`), agency chips, time (`ml-auto text-sm text-muted-ink`); headline (when `titled`) `h2 text-lg font-semibold`; body `text-base leading-relaxed`; pills; template note `text-sm text-muted-ink`. Container `mx-auto w-full max-w-[680px] flex flex-col gap-4`.
- `ReportView`: no `Card`; Download PDF link in a header row; period line; Table in a `Section`-less flow; "Changes detected"/"Moves" `h3 text-base font-semibold` (levels kept); the six count spans → one `StatStrip`-free definition row list: `<dl>` grid `grid-cols-2 sm:grid-cols-3` with `dt text-13 text-muted-ink`/`dd text-lg font-semibold tabular-nums` (same labels and numbers). Container as alert.
- `briefs/page.tsx`: 09 § 6.2 row :125/:128 — remove the `shadow-card` wrappers; list = divided rows (`divide-y divide-line border-y border-line`), "Nothing more" as plain `text-muted-ink`.
**Follow pattern:** `Section`/`Band` usage in `components/client-overview/*` (16b); `Table` usage in `components/prospect-landscape.tsx`.
**Tests (first):** views: brief reading surface has one `[data-slot="brief-item"]` per visible item with `id="item-<id>"`, item headline is `h2`; "Why it matters" text inside `[data-slot="band"]`; client role still never sees upsell/non-active items (existing tests stay green); pills carry `Evidence 1: …` when refs given; alert view renders no `[data-slot="card"]`; report `dl` has the six labels with their numbers; TrendTable caption `Last 28 days` still the table's name. Brief page test: `evidenceRefsFor` called once with the items' ids and the profile tz.
**Done when:** `apps/web/node_modules/.bin/vitest run views briefs alerts reports` green; `git grep -n "rounded-\[10px\]\|text-\[15px\]\|text-\[17px\]" -- apps/web/src/components/views` empty. Commit per view or one `feat(web): brief, alert and report reading views (16d)`.

### Task 4: Ask page restyle
**Goal:** 09 § 5.5 Ask page; pills + SourcesList in answers; § 6.2 rows for `ask-screen.tsx`, `ask-chat.tsx`, `confirm-card.tsx`.
**Files:** modify `apps/web/src/components/ask/{answer,ask-chat,starter-chips,confirm-card,thread-list,ask-card}.tsx` (+ tests), `app/(app)/c/[clientId]/ask/{ask-screen.tsx,actions.ts}` (+ tests).
**Interfaces (binding):**
```ts
// answer.tsx
export function AskAnswer(p: { clientId: string; content: string; citations: readonly string[]; refs?: EvidenceRefs; size?: 'page' | 'panel' }): JSX.Element;
export function answerSources(cites: AnswerCite[], refs: EvidenceRefs, clientId: string): SourceItem[]; // ev cites with a ref, first-appearance order, unique
// ask-chat.tsx — AskChatProps gains:
refs: EvidenceRefs;                       // server-resolved for `messages`
scopeLabel: string;                        // client name (P8)
mode?: 'page' | 'panel';                   // Task 5 implements 'panel'; here only 'page'
refsAction: (clientId: string, ids: string[]) => Promise<EvidenceRefs>;
// actions.ts
export async function askEvidenceRefs(clientId: string, ids: string[]): Promise<EvidenceRefs>; // requireContext; viewer must be 'user'; isUuid checks; tz via viewerTimeZone(); else {}
```
**Behaviour:**
- `AskScreen`: resolve `refs` for every stored assistant message's `ev:` ids in one `evidenceRefsFor` call (profile tz); pass `scopeLabel={profile.name}`, `refsAction={askEvidenceRefs}`. Thread list `aside` → `<div>` holding a `Section` with a divider (`border-r border-line pr-5`, no frame) — removes the second complementary landmark (backlog 16d); the thread list keeps its own `nav`/list semantics. Support view note → `<Band tone="muted">` with the same text.
- `AskChat` page mode: outer `section` (keeps `aria-label`) without frame; thread column `mx-auto w-full max-w-[680px]`; user message per 09 § 5.5 (`self-end max-w-[85%] rounded-lg bg-muted-surface px-3 py-2 text-sm text-ink`); assistant message = `<article>` flat, header row `FridayBadge size="label"`, body `AskAnswer size="page"` (`text-base leading-relaxed`; panel `text-sm leading-normal`), then `SourcesList` when `answerSources` is non-empty, then the save dialog trigger as today; local finals: after a final with `ev:` citations not in `refs`, call `refsAction` once and merge into local state (a failure leaves fallback pills). Empty state: intro line + `StarterChips` as ↳ rows. Composer per § 5.5: `rounded-md border border-input p-3` containing the textarea (borderless inside, `textareaClass` minus border), a row with the scope chip (`<Tag>{scopeLabel}</Tag>`), disclosure line, and a `size-7 rounded-sm` primary send button with `aria-label="Ask"` and an `ArrowUp` icon — the accessible name stays `Ask`. Sticky bottom kept; `rounded-b-[14px]` gone.
- `StarterChips`: same `ul aria-label="Starter questions"`, each row `border-t border-line py-2.5 text-13 text-ink-secondary` with `↳` (`aria-hidden`) before the text; buttons/links keep their names (the question text).
- `ConfirmCard`: Frame look (`rounded-md border border-line bg-surface p-3`), no `rounded-xl`.
- `AskCard` (Overview band): no structure change; its starters inherit the ↳ rows.
**Follow pattern:** `SourcesList`/`CitationPill` props from Task 2; server action shape in `ask/actions.ts` (`requireContext`, `NOT_FOUND`).
**Tests (first):** answer: `ev` cite with ref → link named `Evidence 1: Smith HVAC, Oct 20, 2026`; without → `Evidence 1`; `kb`/`app` chips keep names `Open in the app` / ArticleSheet trigger; `answerSources` dedupes and orders. ask-chat: user message has `data-slot="ask-user-message"`, assistant `data-slot="ask-answer"` with a FridayBadge `data-size="label"`; SourcesList rendered only with resolved refs; after a streamed final with a new `ev:` id `refsAction` is called once with that id and the pill gains its source; a rejecting `refsAction` keeps `Evidence 1`; send button name `Ask` and disabled while empty; scope chip shows the client name; textarea name `Ask Friday a question` unchanged. ask-screen: no `complementary` role in the main column; `evidenceRefsFor` called once. actions: `askEvidenceRefs` returns `{}` for a guest viewer and for non-uuid ids.
**Done when:** `apps/web/node_modules/.bin/vitest run ask` green; `e2e/ask.spec.ts` locators updated where `exact: 'Evidence 1'` now has a ref (`{ name: /^Evidence 1\b/ }`) — no other E2E edits. Commit `feat(web): Ask page on design system v1 with citation pills and sources (16d)`.

### Task 5: Docked Friday panel (D-14)
**Goal:** the D11 new piece: open Friday beside any client page.
**Files:** create `apps/web/src/components/ask/friday-dock.tsx`, `friday-dock-trigger.tsx` (+ `friday-dock.test.tsx`); modify `app/(app)/c/[clientId]/layout.tsx` (+ test), `components/page-header.tsx` (+ test), `components/ask/ask-chat.tsx` (panel mode), `scripts/e2e-affected-rules.ts`, `e2e/ask.spec.ts`.
**Interfaces (binding):**
```ts
// friday-dock.tsx ('use client')
export type FridayDockConfig = { clientId: string; assistantName: string; productName: string | null; reviewAllowed: boolean;
  starters: readonly string[]; scopeLabel: string; saveAction: SaveRecommendationAction; refsAction: AskChatProps['refsAction'] };
export function FridayDock(p: { config: FridayDockConfig | null; children: React.ReactNode }): JSX.Element; // null config → children only
export function useFridayDock(): { available: boolean; open: boolean; setOpen(v: boolean): void; assistantName: string } | null;
// friday-dock-trigger.tsx ('use client')
export function FridayDockTrigger(): JSX.Element | null; // null without dock, on /c/<id>/ask*, or while open at ≥ 1280
```
**Behaviour:**
- Layout: keep the help-name logic; additionally, when `viewer.kind === 'user'`, not support, not `contact:`, and `hasChannel(ctx, 'ask')`: `tryCallTool(ctx, 'get_ask_starters', { clientId })`, `tryCallTool(ctx, 'get_client_profile', …)` for `scopeLabel`, `assistantNameForRequest`, `displayNameFor` (all in one `Promise.all`); any refusal → `config = null`. Wrap children in `<FridayDock config={…}>` (inside the help-name wrapper).
- `FridayDock`: `useMediaQuery('(min-width: 1280px)')` (local hook, SSR default false, `matchMedia` guarded); open + wide → `<div className="xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6">{children}<aside aria-label={`Ask ${name}`} data-slot="friday-panel" className="sticky top-… h-[calc(100dvh-…)] border-l border-line …">` (offsets from the shell's top-bar height constant if one exists, else `top-4`); open + narrow → children + `Sheet side="right"` with `SheetTitle` `Ask {name}`; closes and stays closed when `usePathname()` matches `^/c/[^/]+/ask(/|$)`. Panel header: `h2` `Ask {name}` with `FridayBadge size="label"`, "Open full conversation" link (only once a thread id exists), close icon button `aria-label="Close {name}"`. Esc closes (Sheet does it; column: keydown on the aside).
- `FridayDockTrigger` (in `PageHeader`'s actions area, before page actions): `button` with FridayBadge look at `h-8` (`rounded-full bg-amber text-amber-text px-3 text-sm font-semibold`), text `Ask {name}`, `aria-expanded`, `aria-controls` the panel id; `data-slot="friday-trigger"` (not a `Button default`, so `countPrimaryActions` is unaffected — assert it).
- `AskChat mode="panel"`: `threadId` in state, set from `x-ask-thread-id` and sent on later turns; no `router.replace`/`refresh`; local turns are the transcript; text `sm`; proposed write → `<p>` with link `Open the full conversation to confirm this change.` to `/c/<id>/ask/<threadId>`; error copy as page mode; composer and starters as Task 4. Page mode unchanged.
- E2E rule: `components/ask/friday-dock*` and `c/[clientId]/layout.tsx` → `@ask` (layout also `'all'` if the rules file already maps it so — keep the stricter).
**Follow pattern:** `Sheet` usage in `components/list-detail.tsx` (16c peek sheet); context + provider shape in `components/help/help-context.tsx`.
**Tests (first):** dock: `config=null` renders only children and `useFridayDock()` is null; trigger opens the column at ≥ 1280 (mock `matchMedia`) — `complementary` named `Ask Friday`, trigger hidden while open; < 1280 opens a `dialog` named `Ask Friday`; state survives a rerender with new children (navigation); on pathname `/c/x/ask` nothing renders and an open panel closes; Close and Esc close it; panel chat: two sends post the same `threadId` (second body carries the first response's `x-ask-thread-id`), no `router.replace`/`refresh` calls; network failure shows `Friday couldn't answer just now — please try again.` and the next send works; a proposed action renders the link, not Confirm. Layout: guest/support/no-`ask` → no `get_ask_starters` call and children unchanged; refusal from `get_ask_starters` → children unchanged. PageHeader: trigger rendered inside the header; `countPrimaryActions` unchanged on a page with one primary action. E2E (`ask.spec.ts`, tag `@ask`): at 1440 on the Ask demo client's Overview click `Ask Friday`, send a starter, see an answer with a pill whose name starts `Evidence 1`, navigate to Competitors via the sidebar and the answer is still in the panel, `Open full conversation` lands on `/c/<id>/ask/<thread>` showing the same question.
**Done when:** focused tests green (`vitest run friday-dock layout page-header ask-chat`); `scripts/e2e-affected.test.ts` green via `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`. Commit `feat(web): docked Friday panel beside client pages (16d, D-14)`.

### Task 6: 16d backlog minors
**Goal:** the four 16d lines in the work file's backlog.
**Files:** `apps/web/src/components/help/help-tip.tsx` (+ test), `components/recommendation-board.tsx`, `packages/ui/src/components/control-classes.ts` (+ test, `index.ts`), the Reviews text input file (`git grep -n nativeSelectClass -- 'apps/web/src/app/(app)/c/[clientId]/reviews'`).
**Interfaces:** `export const nativeInputClass = nativeSelectClass` replaced by its own string if the select one carries a chevron/appearance rule (read it first); otherwise an alias with a doc comment.
**Behaviour:** HelpTip trigger focus → fixed `outline-ring` (no `ring-primary`/agency colour); recommendation-board rationale `text-muted-foreground` → `text-ink-secondary`; Reviews' text input uses `nativeInputClass`.
**Tests (first):** help-tip trigger class does not contain `ring-primary` (guard: agency colour must not drive focus — the one allowed class assertion); control-classes test covers `nativeInputClass` exists and has the focus outline.
**Done when:** focused tests green. Commit `fix(ui,web): 16d backlog minors (focus, muted ink, input class)`.

### Task 7: Shot routes and gates
**Goal:** 16d pages in the harness with axe gates.
**Files:** `apps/web/e2e-shots/routes.ts`, `e2e-shots/shots.spec.ts` (fixture lookups).
**Interfaces:** `ShotFixtures` += `alertId: string; reportId: string | null` (`select id from alert where client_id = $clientId and status = 'delivered' order by created_at desc limit 1`; `select id from report where client_id = $clientId limit 1` — null ⇒ route skipped with `test.skip`).
**Behaviour:** add `client-alert` (`/c/<clientId>/alerts/<alertId>`), `client-report` (when present), `owner-alert` (owner) — all `gate: true`; set `gate: true` on `client-ask`, `client-brief`, `owner-brief`.
**Tests:** `scripts/shots-index.test.ts` still green; the route list type-checks.
**Done when:** `pnpm --filter @cs/web exec tsc --noEmit` clean. Commit `test(web): 16d shot routes and axe gates`.

### Task 8: Final review (whole 16d)
- [ ] `pnpm test:affected` (default merge-base) green; `pnpm --filter @cs/web e2e:affected --full` green (one retry on `0xC0000409`).
- [ ] `SHOTS_LABEL=after pnpm --filter @cs/web shots` (after a separate `pnpm build`, `E2E_SKIP_BUILD=1`) passes with gates on; reviewer compares ask/brief/alert/report shots with Frame 12 and 09 § 5.5.
- [ ] `pnpm design:lint` total ≤ the Task 0 figure; record the new total.
- [ ] Reviewer (most capable model) checks Review Focus 1–5, D1 (no lost control, link, name), P1–P10; one fix wave.
- [ ] Work file: Status/Next for 16e, P8 copy lines in Owner verification, P3/P9 items in New backlog. Commit `docs(phase-16): 16d done`.
