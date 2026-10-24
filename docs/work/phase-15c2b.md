# phase-15c2b — page fixes: client pages, ListDetail, compare_captures, Ask delete

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15c2b   **Base:** main @ 8e89d375
**Plan/spec:** [15c-2 spec](../superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md) (2b parts) · plan TBD; pattern [15c-2a plan](../superpowers/plans/2026-10-23-phase-15c2a-page-fixes.md)

## Status (overwrite)
Brief written; nothing built.

## Next (overwrite)
Owner answers Brief §6 → brainstorming → mockups (mobile sheet, whole-page diff) → lean plan → approval → SDD.

## Interfaces this branch adds or changes
Planned: migration `ask_thread.deleted_at` (next free at execution); tools `delete_ask_thread` (replaces `delete_my_ask_thread`), `compare_captures`; `components/list-detail.tsx`; `GATED_PATHS` extended to all `src`.

## Assumes from other branches
- **phase-7b1** (executing, unmerged): migrations 0085–0087 on its branch, renumber to 0089–0091 → our next free at execution likely **≥ 0092**. Edits files we sweep: `c/[clientId]/rankings/{actions,scan-copy,scan-now-button}`, new `c/[clientId]/settings/usage/page.tsx`, `settings/layout.test.tsx`, `lib/format/money.ts`, `help/copy/client.ts`, `server/ask.ts`, `packages/ask/src/{quota,turn,starters}.ts` (our deleted-thread filter hits the same `quota.ts`/`turn.ts`), `e2e/client-billing.spec.ts`. Second to merge rebases.
- **phase-16** (brief only, no code): restyles all 26 client pages, `Card`/shadow codemod (09 PR 4) on every page, `sheet.tsx` bottom variant, `changes/viewer.tsx` → 440px peek panel (D-21), Ask docked panel (D-14). Its brief assumes 15c2 work lands first and it rebases. See Q2.

## Decisions (owner-approved)
None yet beyond 15c spec C1–C11 and 15c-2 spec D1–D8.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief
### 1. Scope
Roadmap row 15 lists "15c-2b client pages … to be planned". Build (15c-2 spec D1, §4.2 2b):
- **Sweep `(app)/c/[clientId]/**`** (all 26 client routes) + remaining components (views, charts, ask, rival…) to "fixed" (§4.1): chips+labels, `lib/format/*` in the **client's** zone (C8), confirms, `SaveBar`, `Suspense`+`PageSkeleton`, labelled controls, no tips in `CardTitle`, empty states, help keys.
- **Grep gates 1–4** (§5) on the rest; the last task asserts them over all `src`.
- **`ListDetail`** (15c §4 C9 + 15c-2 §7): two columns ≥ `lg`, right `Sheet` below via `matchMedia` client wrapper, `listLabel`/`detailTitle`, close → `router.push(closeHref)`; Changes + Moves adopt it. Changes gets real `TabsLink` tabs (`?tab=`, unknown → first).
- **`compare_captures`** (15c §4, 15c-2 §7): previous `ok` web capture of the same `tracked_page`; `loadBlocks`+`alignBlocks`, `wordDiff` segments + `maskedCount`, `MAX_DIFF_CELLS` → `truncated`; no `ensureBlocks`; `get_evidence` access. "Whole page" tab in Changes viewer + "Compare with previous" on evidence page; > 2 unchanged blocks collapse.
- **Ask soft delete** (§3, D3, D8): migration (§3.1 SQL), `delete_ask_thread` (§3.2 copy for sign-off), readers filter `deleted_at` (§3.3), `confirmAskAction` thread check, operator chip "Deleted by user".
- **Folded Polish** (§4.3, D5): Ask UI (6b), feed hex → token, heatmap "Show as table" (last, topic-file task, D2/C7: now `topic-heatmap.tsx`, Reviews `?topic=`, 15b-3b merged).
- **Task 0** (STATE, sign-off doc line 10): proposals 3 (drop branding contrast line), 6 ("Download client report (CSV)"), 8 (drop "Sent" in Team invite cell); `runbook-editor` flake. Copy goes in a new § 15c-2b of `docs/archive/phase-15c2-copy-signoff.md`.
- Tests §8; E2E: Ask delete, 390 px Changes sheet.

### 2. Already built — reuse, don't rebuild
- `@cs/ui`: `StatusChip`, `ConfirmDialog`, `SaveBar`, `Skeleton`, `Sheet`, `TabsLink`.
- Web: `lib/labels.ts` (`labelFor`, `REVIEW_STATUS`, `BRIEF_STATUS`, `ASK_MESSAGE_STATUS`, `EVIDENCE_KIND`, `CLIENT_AUDIENCE_MAPS`), `lib/format/*`, `lib/page-gates.ts` (`AREAS_2A`, `GATED_PATHS`, `// format-gate:`), `components/{page-skeleton,prev-next,form-error,evidence-chips}.tsx`, `views/*-view.tsx`, `charts/topic-heatmap.tsx`, `ask/{thread-list,ask-chat}.tsx`.
- Tools: `tools/ask-threads.ts` (`delete_my_ask_thread` hard-deletes today), `tools/evidence.ts` (`compare_snapshots`, 5c-1), `workspace/word-diff.ts` (`wordDiff`, `MAX_DIFF_CELLS`); engine `web/{blocks,align,volatile,diff-stage}.ts`.
- Changes: `c/[clientId]/changes/{viewer,feed,diff-text,params}.tsx`; Moves `move-card.tsx`.

### 3. Binding decisions
Root `CLAUDE.md` § Decisions: DS v1 for all UI; Phase 15 (PageHeader + help key, Ask first); 15c (miles, tz, no route `loading.tsx`, C1–C11); 15b help (owner signs copy, no agency wording to clients); white-label; writes via `runTool`, refusals → 404. 15c-2 D1–D8. **DS v1 vs phase-16:** DS is binding, but its tokens/primitives land in phase-16 (09 §9); 09 §458 says land 15c-2 first or fold into PR 7/8, never both on the same files in parallel.

### 4. Backlog to fold in (verbatim)
- "**15c-2b** client pages (15c-2 spec D1, D8, §3, §4.2–4.3, §7 …): `ListDetail` sheet below `lg` (Changes, Moves), `compare_captures` whole-page diff + evidence section, Ask soft delete (migration after 0088), sweep `(app)/c/[clientId]/**` (labels, dates, confirms; mobile mockups first), grep gates 1–4 on the remaining areas and a last task over all `src` (extend `GATED_PATHS`). Routed items: changes viewer `formatFullUtc`, `competitors/[competitorId]/page.tsx:36`, `rankings/page.tsx:35,223`, `report-view.tsx:6`, `prospect-landscape.tsx:48`, `pitch-snapshot/page.tsx:40`, BriefView/AlertView mixed dates, briefs tab list overflow, Moves "N signals" → "N changes", Report empty state, "Google place id" label, Ask visibility line, alert-rules band bar, client billing guide "Not available", tips inside `CardTitle`, `formatWeekOf` caller, per-page REVIEW_STATUS maps; folded Polish: Ask UI (6b), feed hex → token, heatmap "Show as table". **Task 0:** fix flaky `runbook-editor.test.tsx` … ; apply 15c-2a sign-off proposals 3, 6, 8 … Coordinate with **phase-16**" — *phase-15c2*
- "Ask UI: thread delete is one-click with error only in a tooltip; save dialog allows duplicate saves; pre-persist error has empty `messageId`; quota 0 shows "N of 0"; `assistantName` read twice" — *from 6b*
- "Feed brief pill hardcodes `text-[#B45309]` (use `text-accent-text`); alert-rules "3 a day" text hard-coded" — *from 5c-1*
- "Heatmap "Show as table" cells unstyled and omit the delta; SVG text shrinks at phone width" — *from 5c-2 Task 11*
- D5 candidates: BACKLOG § Evidence, timeline & profile and § Data views items on client pages — plan decides each.

### 5. In-flight workstreams
See **Assumes from other branches**.

### 6. Open questions for the owner
1. **Split 15c-2b?** a) one plan (D1 as written); b) **2b-1 features** (Ask delete + migration, `compare_captures`, `ListDetail`, Task 0) → **2b-2 sweep + gates + topic-heatmap task**; c) split by page groups. *Rec b:* features are mostly backend and DS-neutral; the sweep is what collides with phase-16 and 7b1.
2. **Sequencing vs phase-16.** a) **2b first on today's UI; phase-16 rebases** — new UI (ListDetail, diff, confirms) follows DS rules expressible with current tokens (sections before cards, no new shadows, chip grammar); phase-16 starts only `packages/ui`/shell work in parallel, its container sweep (PR 4) after 2b merges; b) build client pages to DS v1 now — needs DS tokens/primitives that don't exist yet; c) wait and fold 2b's sweep into phase-16's client-page sub-phase. *Rec a* (09 §458; phase-16 brief Q3 assumes it).
3. **Mobile detail shape.** a) right `Sheet` per 15c §4/C9; phase-16 PR 10 may switch; b) DS bottom sheet (`side="bottom"`) / 440px peek panel (D-21) now. *Rec a:* C9 stands; DS primitives arrive later.
4. **Order vs phase-7b1.** a) **wait for 7b1 to merge, then sweep its client pages** (`settings/usage`, rankings scan-now); b) exclude 7b1's files and gate them later. *Rec a* (7b1 executing; 2b-1 can start first).
5. **6b Ask polish scope.** a) **all five 6b items**; b) delete-related only. *Rec a* (D5).
