# Phase 15c-2b — client pages, ListDetail, compare_captures, Ask delete

**Status:** brainstormed with the owner 2026-10-23 · **Branch:** `phase-15c2b` · **Inputs:** [brief](../../work/phase-15c2b.md), [15c-2 spec](2026-10-23-phase-15c2-page-fixes-design.md) (D1–D8, §3, §4.1–4.3, §5, §7, §8 bind), [15c spec](2026-10-21-phase-15c-page-fixes-design.md) (§2 C1–C11, §4 bind).
This doc adds only the decisions taken since 15c-2a merged. Everything the 15c-2 spec says about 2b stands unless a row below changes it.

## 1. Decisions (owner-approved 2026-10-23)
| # | Decision |
|---|---|
| D9 | **Two parts, one branch, two lean plans.** **2b-1 (features):** Task 0, Ask soft delete (15c-2 §3), the 6b Ask fixes (D12), `compare_captures` + "Whole page" tab + evidence "Compare with previous", `ListDetail` adopted by Changes and Moves (incl. Changes `TabsLink` tabs). **2b-2 (sweep):** every `(app)/c/[clientId]/**` route and remaining client components to "fixed" (15c-2 §4.1) with the routed BACKLOG items, gates 1–4 on the rest and then over all `src` (`GATED_PATHS`), the feed hex → token fix, and last the topic-heatmap task. 2b-1 may merge on its own; 2b-2 is planned after 2b-1 is done. This replaces D1's "one branch with 2a" (2a has merged). |
| D10 | **15c-2b goes before phase-16's page work.** Built on today's tokens and `@cs/ui` primitives. New UI follows the DS v1 rules that today's tokens can express: sections before cards (cards only for independent objects), no new shadows except floating layers (the Sheet), the dot/badge/chip status grammar, Inter 400/500/600, ink headings. Phase-16 rebases onto 15c-2b. Its container sweep (playbook PR 4) and client-page restyle wait until 2b-2 merges. Phase-16 may change `packages/ui` and the shell in parallel. |
| D11 | **Mobile detail = right-side `Sheet`** as in 15c C9 / 15c-2 §7. No bottom sheet or 440 px peek panel (DS D-21) now; phase-16 may swap it. No mockups: the owner accepts that the UI will change in phase-16. |
| D12 | **All five 6b Ask fixes are folded into 2b-1:** (a) thread delete gets the D3 `ConfirmDialog` with an inline `FormError` (replaces one click + tooltip error); (b) the save dialog can't save twice (submit disabled while pending; a second save of the same message is a no-op or a clear "Already saved" result, whichever the existing tool supports — plan decides from code); (c) the pre-persist error carries a real `messageId` or none, never `""`; (d) *moved to 2b-2 (builder-check call):* the only "used of quota" text is the agency usage cell (`agency/settings/usage/questions-cell.tsx`) plus 7b1's new client usage card, both rewritten by 7b1, so (d) runs in 2b-2 after 7b1 merges, on both. `askMonthlyQuota = 0` means a limit turned Ask off (the plan-lacks-Ask case is already hidden via `hasChannel`), so it reads "{used} used · Ask turned off by limit" instead of "N of 0" (copy for sign-off); the client Ask screen still shows no quota; (e) `assistantName` is read once per request and passed down. |
| D15 | **Phone Sheet opens only when the URL names an item** (`?event=` / `?move=`) *(builder-check call)*. On `lg`+ the first item stays auto-selected as today; below `lg` a bare visit shows the list. `ListDetail` takes `selectedId` (what the detail renders) and `sheetOpen: boolean` (= the URL param is present). The 390 px E2E also asserts that landing on Changes opens no Sheet. |
| D13 | **Order vs phase-7b1.** 2b-1 starts now. 2b-2 starts after phase-7b1 merges and also sweeps the client files 7b1 adds or changes (`settings/usage`, rankings scan-now). If 7b1 merges first, our Ask migration takes the next free number after its renumbered ones; if we merge first, 7b1 renumbers. Our `quota.ts`/`turn.ts` deleted-thread filter rebases onto 7b1's changes in either order. |
| D14 | **Task 0 copy** (15c-2a sign-off proposals): 3, drop the branding contrast line; 6, the export reads "Download client report (CSV)"; 8, the Team invite cell drops "Sent". Plus the flaky `runbook-editor.test.tsx` "Use as is" case. 2b copy (Ask delete dialog, "Deleted by user", whole-page diff labels, ListDetail titles) goes in a new § 15c-2b of `docs/archive/phase-15c2-copy-signoff.md` for owner sign-off. |

## 2. Interfaces
No interfaces beyond 15c-2 §3, §5, §7 and 15c §4. Restated names only, for the plan:
- Migration (next free at execution, likely ≥ 0092): `ask_thread.deleted_at` per 15c-2 §3.1, verbatim.
- Tools: `delete_ask_thread` (replaces `delete_my_ask_thread`, its access mark and doc row), `compare_captures`.
- Component: `apps/web/src/components/list-detail.tsx` (`listLabel`, `detailTitle`, `closeHref`, `selectedId`, `sheetOpen` per D15).
- Gates: `apps/web/src/lib/page-gates.ts` `GATED_PATHS` grows to all `src` in 2b-2's last gate task.

## 3. Testing
15c-2 §8 for 2b, split by part. 2b-1: tool tests (`delete_ask_thread`, `confirmAskAction`, `compare_captures`), unit tests for the D12 fixes, E2E Ask delete (+ `/platform/ask` "Deleted by user") and the 390 px Changes sheet. 2b-2: gates with planted-violation fixtures, help coverage, and E2E only where a swept page's behaviour changes.

## 4. Not doing
As 15c-2 §9, plus: DS v1 tokens or primitives (phase-16); bottom sheet or peek panel (D11); mockups for this phase (D11).
