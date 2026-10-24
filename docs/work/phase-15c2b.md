# phase-15c2b — page fixes: client pages, ListDetail, compare_captures, Ask delete

**Kind:** feature (2b-1), then sweep (2b-2)   **Worktree:** ../CompetitorSpy-wt/phase-15c2b   **Base:** main @ 8e89d375
**Plan/spec:** [2b spec](../superpowers/specs/2026-10-23-phase-15c2b-client-pages-design.md) + [15c-2 spec](../superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md) · [2b-1 plan](../superpowers/plans/2026-10-23-phase-15c2b1-features.md) (2b-2 plan after 2b-1)

## Status (overwrite)
2b-1 done 2026-10-24 (Tasks 0-12 + final review fix wave 009617dd, re-review clean). `test:affected --base main` ran before the fix wave: 3 failures (demo coverage, help-client-b, page-controls race), all fixed and re-run focused. `e2e:affected` 136/136 at Task 11. Copy sign-off: `docs/archive/phase-15c2-copy-signoff.md` § 15c-2b (2 owner questions).

## Next (overwrite)
Owner: verify (steps below) + answer the 2 copy questions; decide merge of 2b-1 now or after 2b-2. 2b-2 planning starts after phase-7b1 merges. Deferred to 2b-2: auto-selected row keeps `aria-current` below lg with no sheet open.

## Interfaces this branch adds or changes
- Migration **0092** `ask_thread_deleted_at` (`ask_thread.deleted_at`, live index, owner grant); renumbered from 0089 at the rebase onto main (7b1 owns 0089-0091).
- Tools: `delete_ask_thread` (input `{ clientId, threadId }`, soft delete, replaces `delete_my_ask_thread`); `compare_captures` (web-only, read-only, `get_evidence` access, returns `CaptureCompareView`). Tenant reads filter `deleted_at IS NULL`; operators see deleted threads (`deletedAt` on `ReviewableAskThreadItem`).
- `components/list-detail.tsx`: `ListDetail` props `list, detail, selectedId, sheetOpen, closeHref, listLabel, detailTitle, empty?`; `list-detail-sheet.tsx` (phone Sheet, URL-driven); `whole-page-diff.tsx`.
- `AskEvent` `final.messageId: string | null`; `assistantNameForRequest` in `apps/web/src/server/ask.ts`; `AREAS_2B` in `apps/web/src/lib/page-gates.ts`; Changes `?tab=page`, `effectiveTab` in `changes/params.ts`.

## Assumes from other branches
- **phase-7b1** (unmerged): migrations renumber (above); touches `server/ask.ts`, `packages/ask/src/{quota,turn,starters}.ts` and client pages 2b-2 sweeps (`settings/usage`, rankings scan-now). Second to merge rebases.
- **phase-16** (brief only): restyles client pages, `sheet.tsx` bottom variant, Ask docked panel; assumes 15c2 lands first.

## Decisions (owner-approved)
Spec D9-D15 and plan P1-P18 (see plan). Owner chose: split 2b (2b-1 features, 2b-2 sweep), 2b before phase-16, right Sheet for the phone detail, wait for 7b1 before the sweep, all five 6b Ask items.

## New backlog (target -> item)
- Message-keyed server dedupe for "save as recommendation" (P6; changes `add_recommendation` input) -> only if the owner wants it; today a reload shows the button again.
- Client `privacy` tip (`help/copy/client.ts:325`) still says "Delete a thread with the bin icon beside it." -> owner question 2 in the sign-off.

## Owner verification steps
1. On `cs_dev`, ask a question, delete it via the dialog, confirm it is gone and `/platform/ask` shows "Deleted by user".
2. A client without review allowed: the deleted thread is absent from `/platform/ask`.
3. Changes on a web price change: the "Whole page" tab shows collapsed unchanged sections and chips; a review/ad change shows no such tab.
4. The evidence page of a web capture shows "Compare with previous".
5. Phone width (DevTools 390 px): Changes and Moves open the detail in a right sheet only after tapping an item; back and Esc close it.
6. Save an Ask answer as a recommendation twice quickly: one row.

## Brief (short)
Scope: 2b-1 = Ask soft delete + folded 6b Ask polish, `compare_captures` + whole-page diff, `ListDetail` (Changes, Moves), Task 0 (15c-2a proposals 3, 6, 8; runbook-editor flake). 2b-2 = sweep of all `(app)/c/[clientId]/**` to "fixed" (chips, `lib/format/*` in the client's zone, confirms, `SaveBar`, `Suspense`+`PageSkeleton`, labelled controls, help keys), grep gates 1-4 over all `src` (`GATED_PATHS`), folded polish (feed hex -> token, heatmap "Show as table" in `topic-heatmap.tsx`), routed items listed in the 15c-2 backlog entry in `docs/BACKLOG.md`.

Reuse: `@cs/ui` (`StatusChip`, `ConfirmDialog`, `SaveBar`, `Sheet`, `TabsLink`), `lib/labels.ts`, `lib/format/*`, `lib/page-gates.ts`, `views/*-view.tsx`; engine `web/{blocks,align,volatile}`; `wordDiff`/`MAX_DIFF_CELLS`.

Binding: root `CLAUDE.md` Decisions (DS v1, Phase 15/15b/15c, white-label, writes via `runTool`, refusals -> 404); DS tokens/primitives arrive in phase-16, so new UI uses today's tokens (sections before cards, no new shadows, chip grammar).

Pre-flight (Task 0): rebase on main clean; 7b1 not merged; `capture_block` readable via RLS `app_competitor_visible`; runbook-editor flake was a test race (Approve disabled until the retailor transition settled), fixed. E2E on 3100, never two suites at once.
