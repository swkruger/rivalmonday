# Phase 15c-2b part 1 (2b-1, features) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`): interfaces and behaviour are binding; implementers write the code. Steps use `- [ ]`.

**Goal:** Ask conversations are soft-deleted behind a confirm and vanish from every tenant read while operators still see them (with a "Deleted by user" chip, D8 privacy kept); the four 6b Ask fixes (a)(b)(c)(e) land; `compare_captures` powers a "Whole page" tab on Changes and "Compare with previous" on the evidence page; `ListDetail` gives Changes and Moves a right-side `Sheet` below `lg`, and Changes gets real `TabsLink` tabs.
**Architecture:** One migration (`ask_thread.deleted_at`); one tool replaced (`delete_my_ask_thread` → `delete_ask_thread`), one tool added (`compare_captures`, web-only read over stored `capture_block` rows via `@cs/engine`'s `loadBlocks`/`alignBlocks`/`maskedBlockKeys`). Web reads via `callTool`, writes via `runTool`. No change in `packages/ui` (phase-16 owns it).
**Spec:** `docs/superpowers/specs/2026-10-23-phase-15c2b-client-pages-design.md` (D9–D15). Parents: `docs/superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md` (D1–D8, §3, §7, §8) and `docs/superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md` (§2 C1–C11, §4 `ListDetail` + `compare_captures`, §7). Brief: `docs/work/phase-15c2b.md`. Pattern: `docs/superpowers/plans/2026-10-23-phase-15c2a-page-fixes.md`.

## Global constraints
- Brand tokens only (`packages/ui/src/styles.css`, e.g. `bg-chip-success-bg text-chip-success-text`); no new hex. **D10:** new UI uses sections before cards (cards only for independent objects), no new shadows except the Sheet, the dot/badge/chip status grammar (`StatusChip`), Inter 400/500/600, ink headings. Nothing in `packages/ui` changes.
- Client pages show dates in the client's zone (`profile.timezone`, C8) via `@/lib/format`; operator pages use `await viewerTimeZone()`. No ISO dates in UI.
- Web reads = registered tools (`callTool`/`tryCallTool`), writes = `runTool`; refusals → 404, never 403. New write controls sit in `WriteGuard`/`useReadOnly()`.
- Irreversible actions → `ConfirmDialog` (`@cs/ui`) + `fields` + a row-keyed result line hoisted to an always-mounted component (`apps/web/CLAUDE.md` UI patterns; pattern `agency/settings/slack-teams/webhook-controls.tsx`).
- Tools: `access` mark, `access-marks.test.ts` lists, a row in `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; web-only unless `channels` is set (don't add to `tools/channels.test.ts`).
- Model input (none expected here) goes through `redactForModel`. Event readers filter `retracted_at IS NULL`.
- New/changed user-facing copy goes into `docs/archive/phase-15c2-copy-signoff.md` § "15c-2b" (T12). Every changed help string keeps its `// source:` comment honest.
- New files are added to `GATED_PATHS` (`apps/web/src/lib/page-gates.ts`) by the task that creates them (ratchet); the full-`src` gate run is 2b-2.
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of `apps/web`, `packages/{tools,ask,db,engine}` first. Focused tests: `pnpm --filter <pkg> exec vitest run <pattern>` (engine: `npx vitest run <pattern>` from its dir); task reviewers: `pnpm test:affected` (+ `pnpm --filter @cs/web e2e:affected` for web code).
- Never edit applied migrations. LF only; never stage `.env`, `.claude/`, `App/`, `.superpowers/`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents: their own model line).

## Decisions
Spec D9–D15 bind; 15c-2 D3 (soft delete), D8 (privacy), §3 (SQL, tool, readers, copy), §7; 15c C8, C9, §4. Planner calls (marked **[P]**; owner may overrule at approval):
- **P1 Migration via the schema, not `--custom`.** `packages/db/CLAUDE.md`: a `--custom` column/index migration leaves the snapshot stale. Add `deletedAt` + the partial index to `schema/ask.ts`, run `pnpm --filter @cs/db generate --name=ask_thread_deleted_at`, then append the `GRANT` line (Drizzle can't express it) to the generated, still-unapplied file. The result equals 15c-2 §3.1. Number = next free at execution (main is at 0088; 0089 if we merge before 7b1, ≥ 0092 after its renumber).
- **P2 The audit row is the registry's own** (tool `delete_ask_thread`, `input_hash` of `{clientId, threadId}`, outcome): `audit_log` has no target column (15c-2a B2), and that row names the tool and hashes the target id. No message content.
- **P3 `delete_ask_thread`** keeps `delete_my_ask_thread`'s marks: `access: 'write'`, `permission: 'read'` (any Ask user deletes their own), `feature: 'ask'`, `supportHidden`, `channels: ['web']`, and checks `hasChannel(ctx, 'ask')` in the handler. The `ask_thread` DELETE grant stays (spec SQL verbatim); no code path hard-deletes after T2.
- **P4 Redirect only when the open conversation is deleted** (today's behaviour). Deleting another row from the list refreshes the list in place: redirecting away from the thread the user is reading is worse than spec §3.2's literal "redirects".
- **P5 A turn into a deleted thread** gets the route's empty 404 (`beginTurn` → `not_found`); `AskChat` then `router.replace('/c/<id>/ask')` (the new-conversation screen). The typed question is not carried over (rare: deleted in another tab).
- **P6 D12(b), no server dedupe:** `add_recommendation` has no idempotency key or uniqueness to lean on. The dialog guards double submit with a ref and, after a success, the trigger is replaced by the existing "Saved to Recommendations." line for that answer. A reload shows the button again (accepted; a message-keyed dedupe would change the MCP tool's input).
- **P7 D12(c):** `AskEvent` `final.messageId` becomes `string | null`; `null` = never persisted. The route's pre-persist error sends `null`; `AskChat` keeps `if (!final.id) return`.
- **P8 D12(e):** `assistantNameForRequest = cache((agencyId) => assistantNameFor(dbs().service, agencyId))` in `server/ask.ts`; `askMetadata`, `AskScreen` and `supportAskView` use it, so a request reads the name once (metadata and page share React's request cache).
- **P9 `compare_captures` is web-only** (no `channels`): no MCP/Ask exposure, so no `forChannel`. Output adds `state` (`ok | first | no_blocks | not_web`) and `pageUrl` to 15c §4's shape, so the UI can hide or explain without a refusal.
- **P10 Truncation:** one page-wide budget of `MAX_DIFF_CELLS` LCS cells across modified blocks (each block's cells = token count before × after); a block that would exceed the remaining budget is shown as whole delete + insert and sets `truncated`. More than `MAX_COMPARE_BLOCKS = 600` aligned blocks → the rest are dropped and `truncated` is set.
- **P11 Masking:** an alignment whose block key (before or after) is in `maskedBlockKeys` is left out, whatever its kind, and counted in `maskedCount`. Money changes are not exempt here (the viewer shows text, not detected changes).
- **P12 Changes tabs:** `TabsLinkList`/`TabsLink` (`aria-current="page"`, no tablist roles); `tab` gains `'page'` ("Whole page"), shown only when `compare.channel === 'web' && compare.after`. A hidden or unknown tab renders the first tab. `workspace.spec.ts` switches `getByRole('tab', …)` to `getByRole('link', …)`.
- **P13 `ListDetail` renders the detail twice:** in the `lg` column (CSS `hidden lg:block`) and inside the Sheet, which mounts only while open below `lg`. The client wrapper starts closed until `matchMedia` has run (no hydration mismatch), so a phone refresh on `?event=` opens the Sheet right after hydration.
- **P14 Static titles:** Changes `listLabel` "Changes", `detailTitle` "Change details"; Moves "Moves" / "Move details" (copy sign-off).
- **P15 Sweep items stay in 2b-2** even in files 2b-1 touches (`viewer.tsx` `formatFullUtc`, `DiffText` hex, Moves "N signals", evidence page Cards). 2b-1 changes only what its features need.
- **P16 Ask E2E creates its own thread** (asks a question with the fake AI, then deletes it); `e2e/seed.ts` is unchanged (15c-2 §3.3).
- **P17 Honest privacy copy:** the guides drop "Its messages are deleted with it" and say a deleted conversation leaves the list but, while review is allowed, the named reviewers can still read it (D8). Owner question in the sign-off doc.
- **P18 Evidence "Compare with previous"** is a plain `<section>` (h2 + body, D10), shown only when `evidence.channel === 'web'`, inside `<Suspense fallback={<PageSkeleton/>}>`.

## File structure
- **db:** `packages/db/src/schema/ask.ts`; migration `packages/db/migrations/<next>_ask_thread_deleted_at.sql` + `meta/*`; tests `packages/db/src/{ask-rls,evidence}.test.ts`.
- **tools:** `packages/tools/src/tools/{ask-threads,evidence,schemas}.ts` (+ `ask-threads.test.ts`, new `compare-captures.test.ts`), `packages/tools/src/workspace/word-diff.ts` (+ test), `packages/tools/src/platform.ts` (+ `platform.test.ts`), `packages/tools/src/tools/access-marks.test.ts`, `packages/tools/src/index.ts` (type exports), `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`.
- **ask:** `packages/ask/src/{quota,turn}.ts` (+ `quota.test.ts`, `turn.test.ts`).
- **web Ask:** `apps/web/src/app/(app)/c/[clientId]/ask/{actions,ask-screen}.ts(x)` (+ `actions.test.ts`), `apps/web/src/components/ask/{thread-list,ask-chat,save-recommendation-dialog}.tsx` (+ tests), `apps/web/src/server/ask.ts`, `apps/web/src/app/api/ask/turn/route.test.ts`, `apps/web/src/app/(platform)/platform/ask/{page,[threadId]/page}.tsx` (+ `page.test.tsx`).
- **web Changes/Moves/evidence:** create `apps/web/src/components/{list-detail,list-detail-sheet,whole-page-diff}.tsx` (+ tests); modify `apps/web/src/app/(app)/c/[clientId]/changes/{page,viewer,params}.tsx|ts` (+ `params.test.ts`), `.../moves/page.tsx`, `.../evidence/[evidenceId]/page.tsx`, `apps/web/src/lib/page-gates.ts`.
- **help:** `apps/web/src/help/copy/{client,platform}.ts`; `docs/help/pages/{client.ask.client,client.ask.agency,client.ask.thread,platform.ask.operator,platform.ask.thread.operator}.md`.
- **Task 0 copy:** `apps/web/src/components/agency/branding-editor.tsx` (+ test), `apps/web/src/app/(app)/agency/settings/billing/page.tsx` (+ test), `apps/web/src/app/(app)/agency/settings/team/page.tsx` (+ test), `apps/web/src/components/runbook/runbook-editor.test.tsx`.
- **e2e:** `apps/web/e2e/{ask,workspace}.spec.ts`, `apps/web/scripts/e2e-affected-rules.ts`.
- **docs:** `docs/archive/phase-15c2-copy-signoff.md` (§ 15c-2b), `docs/work/phase-15c2b.md`, `packages/{tools,ask}/CLAUDE.md`, `apps/web/CLAUDE.md` (gotchas only).

## Dependencies on in-flight work (re-check in T0)
- **phase-7b1** (executing; migrations 0085 `ledger_cost_numeric`, 0086 `spend_guard`, 0087 `retry_backoff` on its branch, which collide with main's 0085–0088 and renumber to 0089–0091). It rewrites `packages/ask/src/quota.ts` (`beginTurn` gains `opts.pause`, `BeginTurnResult` kinds `paused`/`busy`), `turn.ts` (`askPausedCopy`, guard), `apps/web/src/server/ask.ts`, `api/ask/turn/route.test.ts`, `help/copy/client.ts`. Our T3/T6 edits hit the same functions: whoever merges second rebases (D13); the deleted-thread filter and `messageId: null` apply to 7b1's new `paused`/`busy` branches too (they carry real ids). Migration number per P1.
- **phase-16** (brief only, no code): rebases onto 15c-2b (D10). Plans a `sheet.tsx` bottom variant and `changes/viewer.tsx` → 440 px peek panel; we change neither `packages/ui` nor the Sheet API, so its swap stays local to `list-detail-sheet.tsx`.
- **15c-2b part 2 (2b-2, same branch, later):** sweeps every client route incl. the files touched here; gates over all `src`; Ask quota text (D12 d).

## Review focus
1. **A deleted conversation leaks back to its author:** list, get, `beginTurn` (continue), `runTurn` thread load and `confirmAskAction` all ignore it. Tests: T2 `deleted thread disappears from list and get`; T3 `beginTurn into a deleted thread is not_found`, `runTurn never loads a deleted thread`; T4 `confirmAskAction refuses a proposed action in a deleted thread and leaves it proposed`.
2. **Deleting breaks D8 or the audit surface:** a deleted thread of a client without `askReviewAllowed` shows up for operators, or a deleted thread of an allowed client disappears from `/platform/ask`. Tests: T5 `operator list keeps deleted threads with deletedAt`, `deleted thread of a non-review client stays hidden`.
3. **Deleting resets usage or lets one user delete another's thread:** Tests: T3 `quota used is unchanged after a delete`; T2 `refuses another user's thread, an already-deleted thread and the wrong client`; T1 `app_user cannot update another user's deleted_at` and `cannot update client_id`.
4. **`compare_captures` crosses tenants, pairs the wrong capture or writes on read:** a capture of an untracked competitor, a previous capture from another page / vendor source / failed status, and any `capture_block` or `stage_run` insert. Tests: T7 `another client's capture is not_found`, `pairs the previous ok web capture of the same page`, `never writes` (row counts before/after), `no blocks → no_blocks`.
5. **The phone Sheet opens when it shouldn't (or desktop shows it):** a bare visit opens a Sheet, `lg` shows a Sheet, closing leaves a stale `?event=`. Tests: T9 `sheet stays closed at lg`, `bare visit below lg shows only the list`, `close pushes closeHref`; T11 E2E 390 px.

---

### Task 0: Pre-flight, D14 copy and the runbook flake
- [ ] `git fetch`; `git rebase main` in the worktree; `pnpm install` (background); test DB `cs_phase_15c2b_test` on the local cluster (`bash scripts/local-test-db.sh env`), unique `E2E_PORT` only if the owner allows a `.env` edit (else note "E2E on 3100, never two suites at once"); `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once.
- [ ] Re-check Dependencies: `git branch --no-merged main`; `git diff --stat main...phase-7b1 -- packages/ask packages/db/migrations apps/web/src/server/ask.ts`; has 7b1 merged? Record the migration number this branch will take.
- [ ] Conflict scan: every path in File structure exists or is a declared create (`git ls-files`); `rg -n "delete_my_ask_thread" --glob '!docs/archive/**' --glob '!docs/superpowers/plans/2026-10-12*'` (expect: tool, tests, actions, 8b doc, `turn.test.ts`); `rg -n "getByRole\('tab'" apps/web/e2e`; confirm `loadBlocks`, `alignBlocks`, `maskedBlockKeys` are exported from `@cs/engine` and `capture_block` is readable by `deps.service`.
- [ ] **D14 copy** (signed off 2026-10-23): proposal 3, drop the `note` "Buttons will use dark text so they stay readable." (`components/agency/branding-editor.tsx:122`, its two test lines become "no note"); 6, link text "Download client report (CSV)" (`agency/settings/billing/page.tsx:118`, href unchanged, `page.test.tsx:65`); 8, Team invite cell `${formatDate(sentAt)} · expires ${formatDate(expiresAt)}` without "Sent" (`agency/settings/team/page.tsx:119`, `page.test.tsx:58` → `Oct 18 · expires Nov 1`). Run `rg -n "Download seat report|Buttons will use dark text" apps/web` (e2e too).
- [ ] **Flake** `runbook-editor.test.tsx` "Use the update … offers Use as is" (got `retailor`): reproduce under load (`for i in $(seq 20); do pnpm --filter @cs/web exec vitest run runbook-editor || break; done` while another package's tests run). Fix by awaiting each async step (`await screen.findByRole('button', { name: 'Approve' })`, a `findByRole('dialog')` if Approve confirms, `findByRole('button', { name: 'Use as is' })`) rather than a bigger timeout; no product change unless the cause is app code.
- [ ] Record findings under this task; commit `docs(phase-15c2b): 2b-1 pre-flight`, then `fix(web): 15c-2a sign-off copy (3, 6, 8) and runbook-editor flake`.
**Done when:** `pnpm --filter @cs/web exec vitest run branding-editor billing/page team/page runbook-editor` green 20× for the flake loop.

### Task 1: Migration `ask_thread.deleted_at`
**Goal:** 15c-2 §3.1, P1.
**Files:** `packages/db/src/schema/ask.ts`; generated `packages/db/migrations/<next>_ask_thread_deleted_at.sql` + snapshot/journal; `packages/db/src/ask-rls.test.ts`; `packages/db/src/evidence.test.ts` (comment only).
**Interfaces:**
```ts
// schema/ask.ts, askThread
deletedAt: ts('deleted_at'),
// table extras
index('ask_thread_user_live_idx').on(t.clientId, t.userId, t.updatedAt.desc()).where(sql`${t.deletedAt} IS NULL`),
```
Final SQL (the first two statements as drizzle-kit emits them, whatever its exact quoting; the grant appended by hand):
```sql
ALTER TABLE "ask_thread" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ask_thread_user_live_idx" ON "ask_thread" USING btree ("client_id","user_id","updated_at" DESC NULLS LAST) WHERE "ask_thread"."deleted_at" IS NULL;--> statement-breakpoint
-- 0043 granted app_user only UPDATE (title, updated_at); the soft delete is an UPDATE by the owner (RLS ask_thread_owner).
GRANT UPDATE (deleted_at) ON ask_thread TO app_user;
```
**Behaviour:** no RLS change (`ask_thread_owner` already confines `app_user`). `ts` is the schema's timestamptz helper. After generating, `pnpm --filter @cs/db generate` must say "No schema changes". The privilege allow-list in `evidence.test.ts` is unchanged (UPDATE already listed); update its comment to `UPDATE(title, updated_at, deleted_at)`.
**Tests (TDD, `ask-rls.test.ts`):** `owner can set deleted_at on own thread`; `app_user cannot update another user's deleted_at` (0 rows); `app_user cannot update client_id` (permission denied, `errorText`); `ask_thread_user_live_idx exists and is partial` (`pg_indexes.indexdef` contains `WHERE (deleted_at IS NULL)`).
**Done when:** `pnpm --filter @cs/db exec vitest run ask-rls evidence`, `pnpm --filter @cs/db generate` → "No schema changes", `pnpm typecheck`.

### Task 2: `delete_ask_thread` and the tenant thread reads
**Goal:** 15c-2 §3.2 and §3.3 (first bullet, tools side); P2, P3.
**Files:** `packages/tools/src/tools/ask-threads.ts` (+ `ask-threads.test.ts`), `packages/tools/src/tools/access-marks.test.ts`, `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`, `packages/ask/src/turn.test.ts:628` (name only).
**Interfaces:**
```ts
export const deleteAskThread = defineTool({
  name: 'delete_ask_thread', access: 'write', supportHidden: true, permission: 'read', feature: 'ask', channels: WEB_ONLY,
  description: "Delete one of the signed-in user's own Ask conversations from their list (kept for review; never shown to them again).",
  input: z.object({ clientId: uuid, threadId: uuid }),
  output: z.object({ deleted: z.literal(true) }),
  async handler(ctx, input, deps) {
    refuseGuest(ctx);
    if (!hasChannel(ctx, 'ask')) throw new ToolError('not_found', 'Not found');
    const c = await workspaceClient(deps, ctx, input.clientId);
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.update(askThread).set({ deletedAt: new Date() })
        .where(and(eq(askThread.id, input.threadId), eq(askThread.clientId, c.id), eq(askThread.userId, ctx.userId), isNull(askThread.deletedAt)))
        .returning({ id: askThread.id }));
    if (rows.length === 0) throw new ToolError('not_found', 'Thread not found');
    return { deleted: true as const };
  },
});
export const askThreadTools = [listMyAskThreads, getMyAskThread, deleteAskThread, getAskStarters];
```
**Behaviour:**
- `delete_my_ask_thread` (and `deleteMyAskThread`) is removed. `access-marks.test.ts`: `WRITE_TOOLS` and `ASK_THREAD_TOOLS` swap the name (sorted). 8b doc: replace the row with `delete_ask_thread (ask-threads.ts) | write | soft-deletes own thread (sets deleted_at; permission is read); supportHidden`.
- `list_my_ask_threads` and `get_my_ask_thread` add `isNull(askThread.deletedAt)`; a deleted thread → `not_found` (page 404).
- The registry's audit row is the only audit record (P2); the handler writes none itself.
**Tests (TDD):** `deletes own thread → { deleted: true } and sets deleted_at`; `refuses another user's thread` (`not_found`); `refuses an already-deleted thread`; `refuses the wrong client` (thread of A1 with clientId A2 in scope); `guest refused`; `deleted thread disappears from list and get` (get → `not_found`); `messages are kept` (owner count unchanged); `writes one ok audit row for delete_ask_thread with no content` (audit_log row, `input_hash` set, no text column holds the title); `ASK_THREAD_TOOLS` assertion updated.
**Done when:** `pnpm --filter @cs/tools exec vitest run ask-threads access-marks channels`, `pnpm --filter @cs/ask exec vitest run turn -t actionAllowed`, `pnpm typecheck`.

### Task 3: Ask turn readers skip deleted threads
**Goal:** 15c-2 §3.3 for `quota.ts` and `turn.ts`; quota unchanged.
**Files:** `packages/ask/src/quota.ts`, `packages/ask/src/turn.ts` (+ `quota.test.ts`, `turn.test.ts`).
**Interfaces:** no signature change. `findOwnThread` adds `isNull(askThread.deletedAt)`; `runTurn`'s thread load (`turn.ts` ~L225) adds `isNull(askThread.deletedAt)` and keeps its existing "no thread" path (→ `not_found`, no model call).
**Behaviour:**
- `beginTurn` with the id of a deleted thread → `ToolError('not_found')` before any message insert (route → 404, P5). A new question (no `threadId`) still creates a fresh thread.
- The `ask_quota_used` count (0044) is untouched: deleted threads' messages keep counting.
- After a 7b1 rebase the filter also guards its `opts.pause` branch (same `findOwnThread`).
**Follow pattern:** existing `findOwnThread` / tests in `quota.test.ts`.
**Tests (TDD):** `beginTurn into a deleted thread is not_found and inserts nothing`; `quota used is unchanged after a delete` (seed counted messages, soft-delete the thread, `ask_quota_used` same; a client at quota stays at quota); `runTurn never loads a deleted thread` (no AI call, rejects `not_found`).
**Done when:** `pnpm --filter @cs/ask exec vitest run quota turn`.

### Task 4: Ask web — delete confirm, `confirmAskAction` thread check, deleted-thread turn
**Goal:** 15c-2 §3.2 web + §3.3 `confirmAskAction`; D12(a); P4, P5.
**Files:** `apps/web/src/app/(app)/c/[clientId]/ask/actions.ts` (+ `actions.test.ts`), `apps/web/src/components/ask/thread-list.tsx` (+ new `thread-list.test.tsx`), `apps/web/src/components/ask/ask-chat.tsx` (+ `ask-chat.test.tsx`).
**Interfaces:**
```ts
// actions.ts — signature unchanged; calls runTool(ctx, 'delete_ask_thread', { clientId, threadId })
export async function deleteAskThreadAction(_prev: FormResult, fd: FormData): Promise<FormResult>;
// thread-list.tsx — the row result line lives in ThreadList (always mounted), keyed by thread id
type RowError = Record<string, string | undefined>;
```
The claiming UPDATE in `confirmAskAction` becomes (security-sensitive, exact):
```sql
UPDATE ask_message SET action = jsonb_set(action, '{state}', to_jsonb(${target}::text))
WHERE id = ${messageId} AND action->>'state' = 'proposed'
  AND EXISTS (SELECT 1 FROM ask_thread t WHERE t.id = ask_message.thread_id AND t.deleted_at IS NULL)
RETURNING action, thread_id, client_id
```
**Behaviour:**
- Delete: the bin button (aria-label `Delete conversation “{title}”`) is the `ConfirmDialog` trigger; `tone="danger"`, title **"Delete this conversation?"**, body **"It disappears from your list. This can't be undone."**, confirm **"Delete"**; `fields` = `clientId`, `threadId`, `active` ('1' for the open thread). On `!ok` the error shows inline as `<ErrorNote compact focusKey>` (the `FormError` primitive's compact form) under that row, replacing the tooltip error. Same component inside `ThreadDrawer`. Wrapped in `useReadOnly()` (hidden in read-only).
- `deleteAskThreadAction`: `revalidatePath('/c/<id>/ask', 'layout')`; `redirect('/c/<id>/ask')` only when `active === '1'` (P4).
- `confirmAskAction`: a message in a deleted thread → 0 rows → `NOT_FOUND`; the action stays `proposed` and no tool runs.
- `AskChat.send`: when `threadId` is set and the turn answers 404, `router.replace('/c/<clientId>/ask')` instead of showing the error copy (P5).
**Follow pattern:** `agency/settings/slack-teams/webhook-controls.tsx` (`ConfirmDialog` + `fields` + hoisted row result).
**Tests (TDD):** actions `runs delete_ask_thread with clientId and threadId`; `redirects only for the active thread`; `confirmAskAction refuses a proposed action in a deleted thread and leaves it proposed` (real DB, `runTool` not called); thread-list `delete needs a confirm` (click bin → dialog title, action not called until "Delete"); `a refused delete shows the error under its row`; `read-only hides delete`; ask-chat `a 404 turn into an existing thread opens a new conversation` (fetch mock 404 → `router.replace('/c/c1/ask')`).
**Done when:** `pnpm --filter @cs/web exec vitest run ask/actions thread-list ask-chat read-only-guard`.

### Task 5: Operator chip "Deleted by user" and help copy
**Goal:** 15c-2 §3.3 operators bullet, D8; P17.
**Files:** `packages/tools/src/platform.ts` (+ `platform.test.ts`), `apps/web/src/app/(platform)/platform/ask/page.tsx` (+ `page.test.tsx`), `apps/web/src/app/(platform)/platform/ask/[threadId]/page.tsx`, `apps/web/src/help/copy/{platform,client}.ts`, `docs/help/pages/{client.ask.client,client.ask.agency,client.ask.thread,platform.ask.operator,platform.ask.thread.operator}.md`.
**Interfaces:**
```ts
export interface ReviewableAskThreadItem { /* … */ deletedAt: Date | null }
export interface ReviewableAskThread { /* … */ deletedAt: Date | null }
```
**Behaviour:**
- Both queries select `askThread.deletedAt`; no new filter; the `askReviewAllowed` / archived filters stay.
- List row and detail header show `<StatusChip tone="neutral">Deleted by user</StatusChip>` when `deletedAt` is set (detail: beside the title via `PageHeader` meta/actions slot, whichever exists; the detail also says "Deleted {formatDateTime(deletedAt, { tz, zoneLabel: true })}").
- Help: `platform.ask.flags` body appends " Deleted by user: the person removed it from their list; it stays here for review." Operator guides add the same line. Client/agency guides replace "Delete a conversation with the bin icon … Its messages are deleted with it." with "Delete a conversation with the bin icon beside it and confirm. It leaves your list for good. While conversations may be reviewed (the line under the box), the people it names can still read it." (P17, sign-off). Update `// source:` comments.
**Tests (TDD):** platform `operator list keeps deleted threads with deletedAt`; `operator detail returns deletedAt`; `deleted thread of a non-review client stays hidden` (list + detail `not_found`); page `shows a Deleted by user chip`; `help/coverage` and `copy` tests still green.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform`, `pnpm --filter @cs/web exec vitest run platform/ask help/coverage help/copy terminology`.

### Task 6: Ask fixes D12 (b), (c), (e)
**Goal:** save dialog can't save twice; no `""` message id; one assistant-name read per request. P6–P8.
**Files:** `packages/ask/src/turn.ts` (`AskEvent`), `apps/web/src/server/ask.ts`, `apps/web/src/app/api/ask/turn/route.test.ts`, `apps/web/src/components/ask/{ask-chat,save-recommendation-dialog}.tsx` (+ tests), `apps/web/src/app/(app)/c/[clientId]/ask/ask-screen.tsx` (+ `ask-support.test.tsx` if it mocks `assistantNameFor`).
**Interfaces:**
```ts
// @cs/ask turn.ts
| { type: 'final'; messageId: string | null; content: string; citations: string[]; action: AskAction | null; status: 'ok' | 'refused' | 'error' | 'quota' };
// apps/web/src/server/ask.ts
export const assistantNameForRequest: (agencyId: string) => Promise<string>; // React cache() over assistantNameFor(dbs().service, agencyId)
// ask-chat.tsx
type ChatMessage = Omit<Pick<AskMessageView, 'id' | 'role' | 'content' | 'citations' | 'status' | 'action'>, 'id'> & { id: string | null };
```
**Behaviour:**
- (c) `handleAskTurn`'s catch writes `messageId: null`; every persisted final keeps its id. `AskChat` builds the local error with `id: null`; React keys for local turns use the turn `key`, never the message id.
- (b) `SaveRecommendationDialog`: a `useRef` flag blocks a second submit while one is in flight (before `pending` flips); after `ok` the trigger is not rendered again in that instance; the existing `role="status"` "Saved to Recommendations." line stays. No tool change (P6).
- (e) `askMetadata`, `AskScreen` and `supportAskView` call `assistantNameForRequest(ctx.agencyId)`; `askMetadata` stops using `themeForViewer` for the name. `AskScreen` passes the value down (unchanged props). `assistantNameFor` stays for the route and other callers.
**Tests (TDD):** route `pre-persist error final has messageId null` (update the three `messageId: ''` expectations); ask-chat `a network failure shows the error copy and doesn't refresh`; dialog `double submit calls saveAction once`, `after a save the trigger is gone and the status line shows`; ask-screen `reads the assistant name once per request` (spy on the service select or `assistantNameFor`: one call across `askMetadata` + render).
**Done when:** `pnpm --filter @cs/ask exec vitest run turn`, `pnpm --filter @cs/web exec vitest run api/ask ask-chat save-recommendation ask-support ask-screen`, `pnpm typecheck`.

### Task 7: `compare_captures`
**Goal:** 15c §4 "Compare with previous capture", 15c-2 §7; P9–P11.
**Files:** `packages/tools/src/tools/evidence.ts`, `packages/tools/src/tools/schemas.ts`, `packages/tools/src/workspace/word-diff.ts` (+ `word-diff.test.ts`), `packages/tools/src/index.ts`, create `packages/tools/src/tools/compare-captures.test.ts`; `access-marks.test.ts` (read, nothing to add unless it lists reads), 8b doc row `compare_captures (evidence.ts) | read | read-only (no ensureBlocks)`.
**Interfaces:**
```ts
// word-diff.ts
export function diffCells(before: string, after: string): number; // tokens(before).length * tokens(after).length
// schemas.ts
const CaptureRef = z.object({ captureId: uuid, capturedAt: iso });
export const CaptureCompareView = z.object({
  state: z.enum(['ok', 'first', 'no_blocks', 'not_web']),
  before: CaptureRef.nullable(), after: CaptureRef, pageUrl: z.string().nullable(),
  blocks: z.array(z.object({ kind: z.enum(['added', 'removed', 'modified', 'unchanged']), segments: z.array(z.object({ op: z.enum(['equal', 'insert', 'delete']), text: z.string() })) })),
  truncated: z.boolean(), maskedCount: z.number().int().nonnegative(),
});
export type CaptureCompareView = z.infer<typeof CaptureCompareView>;
// evidence.ts
export const compareCaptures = defineTool({ name: 'compare_captures', access: 'read', permission: 'read',
  description: 'The whole stored page of one web capture compared with the previous successful capture of the same page, block by block, with a word-level diff of changed blocks.',
  input: z.object({ clientId: uuid, captureId: uuid }), output: CaptureCompareView, /* no channels, no feature (get_evidence's rules) */ });
export const MAX_COMPARE_BLOCKS = 600;
```
**Behaviour (access, pairing — exact):**
```ts
const c = await workspaceClient(deps, ctx, clientId);
const [cap] = await deps.service.select({ id: capture.id, competitorId: capture.competitorId, trackedPageId: capture.trackedPageId, source: capture.source,
  status: capture.status, capturedAt: capture.capturedAt, url: capture.url }).from(capture).where(eq(capture.id, captureId));
if (!cap || !(await competitorLinked(deps, ctx, c.id, cap.competitorId))) throw new ToolError('not_found', 'Capture not found');
const after = { captureId: cap.id, capturedAt: cap.capturedAt.toISOString() };
const empty = (state, before = null) => ({ state, before, after, pageUrl: cap.url ?? null, blocks: [], truncated: false, maskedCount: 0 });
if (cap.source !== 'web' || !cap.trackedPageId) return empty('not_web');
const [prev] = await deps.service.select({ id: capture.id, capturedAt: capture.capturedAt }).from(capture)
  .where(and(eq(capture.trackedPageId, cap.trackedPageId), eq(capture.source, 'web'), eq(capture.status, 'ok'), lt(capture.capturedAt, cap.capturedAt)))
  .orderBy(desc(capture.capturedAt), desc(capture.id)).limit(1);
const [afterBlocks, beforeBlocks, masked] = await Promise.all([loadBlocks(deps.service, cap.id), prev ? loadBlocks(deps.service, prev.id) : [], maskedBlockKeys(deps.service, cap.trackedPageId)]);
// order matters: a capture without stored blocks (failed, or never extracted) → no_blocks; then first
```
- `cap.status !== 'ok'` or `afterBlocks.length === 0` → `no_blocks`; no `prev` → `first` (before null); `prev` with no blocks → `no_blocks` (before set). Never call `ensureBlocks` or anything that writes.
- Else `alignBlocks(beforeBlocks, afterBlocks)`; drop and count masked alignments (P11); keep the first `MAX_COMPARE_BLOCKS` (rest dropped → `truncated`). Segments: unchanged → `[{op:'equal', text: after.text}]`; added → `[{op:'insert', text}]`; removed → `[{op:'delete', text}]`; modified → `wordDiff(before.text, after.text)` while `spent + diffCells(...) ≤ MAX_DIFF_CELLS` (add to `spent`), else `[{op:'delete', before}, {op:'insert', after}]` and `truncated = true`. `state: 'ok'`.
- Block text is shown as stored (web channel; P9).
**Tests (TDD, real DB, seed captures + `capture_block` rows directly):** `pairs the previous ok web capture of the same page` (a newer capture, a failed one in between, and another page's capture are ignored); `first capture → state first`; `no blocks on the after capture → no_blocks`; `no blocks on the previous capture → no_blocks with before`; `vendor capture → not_web`; `another client's capture is not_found` (competitor not linked); `added, removed, modified and unchanged kinds`; `masked keys are left out and counted`; `page budget sets truncated and falls back to delete+insert` (stub small texts by passing a tiny budget via exported const override or a large block pair); `never writes` (`capture_block` and `stage_run` counts unchanged); `diffCells multiplies token counts`.
**Done when:** `pnpm --filter @cs/tools exec vitest run compare-captures word-diff evidence access-marks`, `pnpm typecheck`.

### Task 8: Whole-page diff UI, Changes tabs, evidence "Compare with previous"
**Goal:** "Whole page" tab + real `TabsLink` tabs (15c-2 §6 Changes rule) + evidence section; collapse > 2 unchanged; P12, P18.
**Files:** create `apps/web/src/components/whole-page-diff.tsx` (+ test); modify `apps/web/src/app/(app)/c/[clientId]/changes/{params.ts,page.tsx,viewer.tsx}` (+ `params.test.ts`), `apps/web/src/app/(app)/c/[clientId]/evidence/[evidenceId]/page.tsx`, `apps/web/e2e/workspace.spec.ts` (tab locator), `apps/web/src/lib/page-gates.ts` (append the new file).
**Interfaces:**
```ts
// params.ts
const TABS = ['side', 'text', 'details', 'page'] as const;
// whole-page-diff.tsx (server component, no hooks)
export function WholePageDiff({ view, timezone }: { view: CaptureCompareView; timezone: string }): React.ReactElement;
export type DiffRun = { type: 'block'; block: CaptureCompareView['blocks'][number] } | { type: 'collapsed'; blocks: CaptureCompareView['blocks'] };
export function collapseUnchanged(blocks: CaptureCompareView['blocks']): DiffRun[];
```
Collapse rule (exact):
```ts
export function collapseUnchanged(blocks: CaptureCompareView['blocks']): DiffRun[] {
  const out: DiffRun[] = [];
  let run: CaptureCompareView['blocks'] = [];
  const flush = () => {
    if (run.length > 2) out.push({ type: 'collapsed', blocks: run });
    else for (const b of run) out.push({ type: 'block', block: b });
    run = [];
  };
  for (const b of blocks) {
    if (b.kind === 'unchanged') run.push(b);
    else { flush(); out.push({ type: 'block', block: b }); }
  }
  flush();
  return out;
}
```
**Behaviour:**
- `WholePageDiff`: a heading line "Compared with the capture from {formatDateTime(before.capturedAt, { tz, zoneLabel: true })}"; each changed block shows a chip (`StatusChip` added success "Added", removed danger "Removed", modified info "Changed") and its segments (`<ins>`/`<del>` with `bg-chip-success-bg text-chip-success-text` / `bg-chip-danger-bg text-chip-danger-text line-through`, `aria-label` "added: …"/"removed: …"); a collapsed run is `<details><summary>{n} unchanged sections</summary>…</details>`. Notes: `maskedCount > 0` → "{n} sections change on every visit and are hidden."; `truncated` → "This page changed too much to compare word by word, so some sections show as removed and added in full."; `first` → "This is the first capture of this page, so there is nothing to compare yet."; `no_blocks` → "Comparison not available for this capture."; no changed blocks → "No differences on this page." All copy for sign-off.
- Changes: tabs render as `TabsLinkList aria-label="Evidence views"` + `TabsLink asChild active` + `Link` (pattern `platform/billing/page.tsx`). "Whole page" appears only when `compare.channel === 'web' && compare.after`; a hidden/unknown tab renders the first (`side`). `page.tsx` calls `compare_captures({ clientId, captureId: compare.after.captureId })` only when the effective tab is `page`.
- Evidence page: when `evidence.channel === 'web'`, a `<section aria-labelledby>` "Compare with previous" (h2) after "Capture details", body `<Suspense fallback={<PageSkeleton/>}>` → async child calling `compare_captures({ clientId, captureId: evidence.captureId })` → `WholePageDiff`. Vendor evidence shows no section.
**Tests (TDD):** `collapseUnchanged collapses runs of 3+ and keeps runs of 1–2` (incl. leading/trailing runs); `WholePageDiff renders chips and summary "4 unchanged sections"`; `shows masked, truncated, first and no_blocks notes`; params `tab=page parses; unknown tab → side`; viewer `tabs are links with aria-current`, `Whole page hidden for a vendor change and ?tab=page falls back to Side by side`; evidence page `section only for web evidence`.
**Done when:** `pnpm --filter @cs/web exec vitest run whole-page-diff changes evidence page-gates`.

### Task 9: `ListDetail`
**Goal:** 15c §4 C9 + 15c-2 §7 + D15; P13.
**Files:** create `apps/web/src/components/list-detail.tsx` (server-safe), `apps/web/src/components/list-detail-sheet.tsx` (`'use client'`) (+ `list-detail.test.tsx`); `apps/web/src/lib/page-gates.ts` (append both).
**Interfaces:**
```ts
export interface ListDetailProps {
  list: React.ReactNode;
  detail: React.ReactNode;          // what the detail shows (rendered for selectedId)
  selectedId: string | null;        // lg: the auto-selected or URL item; null → `empty`
  sheetOpen: boolean;               // the URL names an item (?event= / ?move=)
  closeHref: string;                // the list URL without the item param
  listLabel: string;                // aria-label of the list region
  detailTitle: string;              // Sheet title (screen readers)
  empty?: React.ReactNode;          // lg detail column when nothing is selected
}
export function ListDetail(p: ListDetailProps): React.ReactElement;
// list-detail-sheet.tsx
export function ListDetailSheet({ open, closeHref, title, children }: { open: boolean; closeHref: string; title: string; children: React.ReactNode }): React.ReactElement;
export const LG_QUERY = '(min-width: 1024px)';
```
**Behaviour:**
- Layout: `grid gap-4 lg:grid-cols-[420px_1fr]`; `<section aria-label={listLabel}>{list}</section>`; detail column `hidden lg:block` with `detail` (or `empty`). Below `lg` only the list shows in flow.
- `ListDetailSheet`: `isLg: boolean | null` from `matchMedia(LG_QUERY)` in an effect (+ `change` listener, guarded when `matchMedia` is missing); `Sheet open={isLg === false && open}`; `SheetContent side="right"` with a visible `SheetTitle` = `title`, `aria-describedby={undefined}`; `onOpenChange(false)` → `router.push(closeHref)` (Esc, backdrop and the close button all route through it). Rendered only when `selectedId` is set.
- No new shadow besides the Sheet's own; no Cards added by `ListDetail` (pages keep theirs until 2b-2/phase-16).
**Follow pattern:** `components/shell/mobile-nav.tsx` (matchMedia listener), `components/ask/thread-list.tsx` `ThreadDrawer` (Sheet usage).
**Tests (TDD, jsdom with a `matchMedia` stub):** `sheet stays closed at lg` (matches true, open → no dialog); `bare visit below lg shows only the list` (open false → no dialog); `below lg with open shows the sheet titled detailTitle`; `close pushes closeHref` (Esc → `router.push` mock called once with closeHref); `server render has no dialog` (`renderToString` contains no `role="dialog"`); `list region has aria-label`.
**Done when:** `pnpm --filter @cs/web exec vitest run list-detail page-gates`.

### Task 10: Changes and Moves adopt `ListDetail`
**Goal:** C9 on both pages; D15 selection rule.
**Files:** `apps/web/src/app/(app)/c/[clientId]/changes/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/moves/page.tsx` (+ page tests if present, else `changes/page.test.tsx`, `moves/page.test.tsx` new, mocking `callTool` like other page tests).
**Interfaces:** Changes: `selectedId = p.event ?? rows[0]?.eventId ?? null`, `sheetOpen = !!p.event`, `closeHref = changesHref(clientId, { ...p, event: undefined, change: undefined, tab: 'side' })`, `listLabel "Changes"`, `detailTitle "Change details"`. Moves: `selectedId = moveParam ?? items[0]?.id ?? null`, `sheetOpen = !!moveParam`, `closeHref = movesHref(clientId, { status })`, `"Moves"` / `"Move details"`.
**Behaviour:**
- The existing list and detail markup move into `list` / `detail` / `empty` unchanged (stale-id "no longer available" text, empty states, "Show older changes" stay).
- `lg`: first item auto-selected as today. Below `lg`: a bare visit shows the list only; a feed/move link (which sets `?event=`/`?move=`) opens the Sheet; browser back removes the param and closes it; refresh keeps it open.
- Feed links keep `tab: 'side'` (a new event opens on the first tab).
**Tests (TDD):** changes page `bare visit passes sheetOpen false with the first event selected`; `?event= passes sheetOpen true`; `closeHref keeps filters and drops event, change, tab`; moves page same three.
**Done when:** `pnpm --filter @cs/web exec vitest run changes moves list-detail`.

### Task 11: E2E — Ask delete and the 390 px Changes sheet
**Goal:** 15c-2 §8 E2E for 2b-1 (spec §3); P16.
**Files:** `apps/web/e2e/ask.spec.ts`, `apps/web/e2e/workspace.spec.ts`, `apps/web/scripts/e2e-affected-rules.ts` (rules for `components/list-detail*.tsx` → `@changes`, `@moves`, `@responsive`; `components/whole-page-diff.tsx` → `@changes`, `@evidence`).
**Behaviour:**
- `ask.spec.ts`, client describe, `test('deleting a conversation needs a confirm; it leaves the list and operators see "Deleted by user"', { tag: ['@ask', '@platform'] })`: ask a typed question (fake AI) → wait for `/ask/<uuid>`; read the id from the URL; click `Delete conversation “…”` → dialog "Delete this conversation?" → Cancel keeps it → again → "Delete" → URL `/c/<askCo>/ask`, the list has no link to that id, `goto('/c/<askCo>/ask/<id>')` → 404. Then a context with `ADMIN_STATE` (`ensureAdminState`) → `/platform/ask` → the row linking `/platform/ask/<id>` contains "Deleted by user"; the detail page shows it too.
- `workspace.spec.ts`, `test('at 390 px the change detail opens in a sheet that back closes and refresh keeps', { tag: ['@changes', '@responsive'] })`: viewport 390×844; `goto('/c/<id>/changes')` → `getByRole('dialog')` count 0 and the list visible; click the first feed item → dialog "Change details" visible, URL has `event=`; `page.goBack()` → dialog gone; click again → `page.reload()` → dialog visible; Esc → dialog gone and URL has no `event=`.
- Update the existing Changes test's `getByRole('tab', { name: 'Text changes' })` → `getByRole('link', { name: 'Text changes' })` (P12).
**Done when:** `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` (rules test), then `pnpm --filter @cs/web e2e:affected` green (build first; never alongside another E2E run).

### Task 12: Copy sign-off and docs
**Goal:** D14 § 15c-2b; work file for the owner.
**Files:** `docs/archive/phase-15c2-copy-signoff.md` (new `## 15c-2b` → `### 2b-1`), `docs/work/phase-15c2b.md`, `packages/tools/CLAUDE.md`, `packages/ask/CLAUDE.md`, `apps/web/CLAUDE.md` (gotchas only, one line each).
- [ ] Sign-off: every new/changed string from T0–T10 with file:line, grouped by page: Ask delete (trigger label, dialog title/body/button, row error), "Deleted by user" chip + operator detail line + tip text, guide paragraphs (P17) with the **owner question** "Is saying reviewers can still read a deleted conversation (while review is allowed) the wording you want?", whole-page diff (chips "Added"/"Removed"/"Changed", heading, "N unchanged sections", masked/truncated/first/no-blocks/no-differences notes, tab "Whole page", section "Compare with previous"), `ListDetail` titles (P14), tabs nav label "Evidence views", D14's three applied changes (for the record).
- [ ] Gotchas: tools — `delete_ask_thread` soft-deletes and tenant reads must filter `deleted_at IS NULL`; `compare_captures` never calls `ensureBlocks`. ask — `findOwnThread`/turn load filter deleted threads; `final.messageId` may be `null`. web — `ListDetail` Sheet opens only from the URL param; Changes tabs are links (`aria-current`), E2E locates them as links.
- [ ] Work file: Status/Next (→ final 2b-1 review, then owner merge decision or 2b-2 planning after 7b1), Interfaces added (migration number, tools, `ListDetail` props, `AskEvent.messageId`), New backlog (message-keyed save dedupe P6 if the owner wants it), **Owner verification steps:** (1) on `cs_dev`, ask a question, delete it via the dialog, confirm it is gone and `/platform/ask` shows "Deleted by user"; (2) a client without review allowed: deleted thread absent from `/platform/ask`; (3) Changes on a web price change → "Whole page" tab shows collapsed unchanged sections and chips; a review/ad change shows no such tab; (4) evidence page of a web capture shows "Compare with previous"; (5) phone width (DevTools 390 px): Changes and Moves open the detail in a right sheet only after tapping an item; back and Esc close it; (6) save an Ask answer as a recommendation twice quickly → one row.
**Done when:** docs committed; final 2b-1 whole-branch review (most capable model) with `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`, then one fix wave.
