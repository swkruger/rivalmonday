# Phase 15c-2 — page fixes and small features

**Status:** brainstormed with the owner 2026-10-23 · **Branch:** `phase-15c2` · **Inputs:** [brief](../../work/phase-15c2.md), [15c spec](2026-10-21-phase-15c-page-fixes-design.md) (§2 C1–C11 and §4 bind), [UX audit](../../research/2026-10-18-phase-15-ux-audit.md) §2, pre-split brief `git show 9ddfae3c:docs/work/phase-15c.md` §1.
This doc adds only the new decisions and interfaces. The tool names, behaviour and copy rules in 15c spec §4 and §3 stand unless a row below changes them.

## 1. Why
15c-1 built the shared pieces: chips, labels, formatters, confirms, the save bar, skeletons and error pages. 15c-2 puts them on **every** page and ships the nine small features from C4. After this, no page shows raw values, ISO dates, km, solid status badges or unconfirmed irreversible actions, and grep gates keep it that way.

## 2. Decisions (owner-approved 2026-10-23)
| # | Decision |
|---|---|
| D1 | **One branch, two plans by area.** **15c-2a** covers platform, agency and account/public pages, plus their features: agencies search, leads/reviews paging, billing tabs, alert-queue client filter + cap notice, webhook delete + test, invite resend, sign-up email resend and intake preview. **15c-2b** covers client pages, plus `ListDetail` (Changes, Moves), `compare_captures` and Ask delete. 2b's pre-flight starts once 2a's tasks are done on the branch (no separate merge). Each part has its own final review and its own section in one copy sign-off doc, `docs/archive/phase-15c2-copy-signoff.md`. |
| D2 | **Parallel with 15b-3b** (C7). Theme-file tasks are the last task of each part: `/platform/themes` + `theme-queue.tsx` (2a); `components/charts/theme-heatmap.tsx` + Reviews `?theme=` (2b). If 15b-3b has merged by then, the task rebases first and edits the renamed files (`/platform/topics` …). |
| D3 | **Ask delete is a soft delete**, so conversations stay available for auditing and improving Ask (15c spec §4 option kept): `delete_ask_thread` replaces `delete_my_ask_thread` (removed together with its access mark and doc row). |
| D4 | **Every page is swept**, not only the listed ones, and grep gates fail the build if old patterns return (§5). |
| D5 | **Polish items on pages we touch are folded in** (§4.3). Knowledge-base (6c) and `/platform/costs` (8c) items stay in Polish. |
| D6 | **`TzCookie` never reloads the page.** The first render without `rm_tz` uses UTC, labelled "UTC", and the cookie applies from the next navigation. The `router.refresh()` on first write goes. |
| D7 | **Agency team invites get an email.** A new `team_invite` email is sent when an agency-role invitation is created and on resend, so "Resend" works for every invite. Its copy is for owner sign-off (§6). |
| D8 | **Deleted Ask conversations keep the 6b privacy rule.** Operators see them only for clients with `askReviewAllowed`. For other clients the rows are kept but shown nowhere. |

## 3. Ask soft delete (2b)

### 3.1 Migration (next free number at execution; 0085 today)
```sql
ALTER TABLE ask_thread ADD COLUMN deleted_at timestamptz;
CREATE INDEX ask_thread_user_live_idx ON ask_thread (client_id, user_id, updated_at DESC) WHERE deleted_at IS NULL;
GRANT UPDATE (deleted_at) ON ask_thread TO app_user;   -- 0043 granted only (title, updated_at)
```
No RLS change is needed: `ask_thread_owner` already confines `app_user` to its own rows, and the soft delete is an `UPDATE` by the owner.

### 3.2 Tool
`delete_ask_thread { clientId: uuid, threadId: uuid }` → `{ deleted: true }`. It is a write, runs as the user and needs channel `ask` (`hasChannel`).
- It sets `deleted_at = now()` where `id = threadId AND client_id = clientId AND user_id = ctx.userId AND deleted_at IS NULL`. Zero rows → `not_found`, which covers another user's thread, an already-deleted thread and the wrong client.
- It writes one audit row (`ask_thread.delete`, target thread id). It never writes message content into the audit row.
- Web: `deleteAskThreadAction` calls it through `runTool` behind a `ConfirmDialog` (tone danger). The copy is for owner sign-off: title "Delete this conversation?", body "It disappears from your list. This can't be undone.", confirm "Delete". On failure it shows an inline `FormError`. After a delete it redirects to `/c/<id>/ask`.

### 3.3 Readers
- **Tenant reads filter `deleted_at IS NULL`:** `list_my_ask_threads`, `get_my_ask_thread` (deleted → `not_found` → page 404), `quota.ts` thread lookup/creation and `turn.ts` thread load. Asking into a deleted thread returns `not_found` and the UI opens a new conversation. Ask context never loads deleted threads.
- **`confirmAskAction`** (`c/[clientId]/ask/actions.ts`) refuses a proposed action whose message belongs to a deleted thread (`not_found`). Today it updates `ask_message` by id with no thread check.
- **Quota:** deleted threads' `ask_message` rows keep counting (the 0044 count function is unchanged), so deleting never resets usage.
- **Operators:** the platform Ask review (`packages/tools/src/platform.ts` list + `/platform/ask/[threadId]`) keeps showing deleted threads. It adds `deletedAt` to its row and detail output and a `StatusChip` "Deleted by user" (tone neutral). It adds no filter. The `askReviewAllowed` filter stays (D8). This is the audit surface, so no new screen is needed.
- `demo`/`coverage` seeds and `e2e/seed.ts` need no change; `topic-leftovers.ts` is untouched.

## 4. Page sweep

### 4.1 What "fixed" means on a page (applies to every route)
A page counts as fixed when all of these hold:
- statuses use `StatusChip` + `lib/labels` maps;
- dates, money and distance use `lib/format/*` with the C8 zone rule;
- every irreversible or billing action has a `ConfirmDialog`;
- multi-field settings forms use `SaveBar`;
- slow sections have an in-page `Suspense` + `PageSkeleton`;
- every form control has a label (`aria-describedby` for help/error text);
- no tip sits inside `CardTitle` (move it beside the title);
- empty states have copy;
- `PageHeader` has a help key + guides (15b gates).

### 4.2 Allocation
The per-page items come from the pre-split brief §1, the audit §2.1–2.5 and brief §4. The plan lists them per route. The two parts split by area:
- **15c-2a:** `(platform)/platform/**` except `knowledge` and `costs` content (their 6c/8c items stay in Polish, though they still pass the gates); `(app)/agency/**`, including `/agency/settings/*` and onboarding; `(app)/inbox`, account/notifications, `app/sign-up/*`, `app/sign-in/*` and `app/start/**` (focus order, privacy link, CTA, white text on light agency colours via a contrast-picked text colour).
- **15c-2b:** `(app)/c/[clientId]/**`, which covers overview, changes, moves, ads, pricing, reviews, rankings, competitors, recommendations, briefs, alerts, reports, evidence, pitch-snapshot, Ask, setup and settings.
- **Backlog items, routed to the part owning the file:** `onboarding/steps/plan.tsx` `now`, `billing-panel.tsx`/`plan-editor.tsx`/`cost-items-table.tsx` ISO dates, `agency-table.tsx`, `ai-connections.tsx`, `team/page.tsx` and `/platform/health` local chip go to 2a. The changes viewer `formatFullUtc`, `competitors/[competitorId]`, `rankings`, `report-view`, `prospect-landscape` and `pitch-snapshot` go to 2b. Also in 2b:
  - BriefView/AlertView mixed dates;
  - the briefs tab list overflow;
  - Moves "N signals" → "N changes";
  - Report empty state;
  - "Google place id" label;
  - Ask visibility line;
  - alert-rules band bar.
- **Cross-cutting backlog (2a, first task):**
  - `KM_PER_MILE` moves to `@cs/core`, and `lib/format/distance.ts` and `tools/intake/preview.ts` import it;
  - the chip CSS ↔ `CHIP_COLOURS` sync test;
  - cwd-relative guard/hex tests switch to `__dirname`;
  - `formatRelative` past 30 days uses the passed zone, not UTC (signature gains `o?: { tz?: string }`);
  - cents-unit billing renders whole dollars like the revenue card (`$299`, cents only when non-zero);
  - D6.
- **Investigate (2a, last non-theme task):** E2E "destination stream closed early" around `workspace.spec.ts`. Compare with a main run, and fix it or file the cause in BACKLOG.

### 4.3 Folded Polish (D5)
- **2a:** webhook kinds use labels (5a T18). `PrefSwitch` and toggles show a `runTool` error inline and revert (5a T17, 5b-2). The Usage page gets an empty state and dialog, and the alert cap notice (5b). The dismiss dialog becomes a `ConfirmDialog` (5b-1).
- **2b:** Ask UI items (6b). The feed hex colour moves to a token (5c-1). The heatmap gets a "Show as table" toggle with the same data (5c-2), as part of the last, theme-file task.

## 5. Grep gates (D4)
These are new tests in `apps/web/src/lib/format/` and `apps/web/src/lib/`, beside `no-old-helpers.test.ts`. They are path-based via `__dirname` and scan `apps/web/src/**/*.tsx?`, excluding tests:
1. **No status `Badge`:** `<Badge` is allowed only in a file listed in an explicit allow-list of non-status uses, each with a reason comment. Everything else uses `StatusChip`.
2. **No ad-hoc dates:** no `.slice(0, 10)` / `.slice(0,10)` on date-ish values, `toLocaleDateString`, `toLocaleTimeString`, `toLocaleString(` or `toISOString()` in JSX-rendering files outside `lib/format/*`. A per-line escape `// format-gate: <reason>` covers non-UI uses such as form values and cache keys.
3. **No raw enum render:** a list of known enum field names (`status`, `billingState`, `kind`, `role` …, defined in the test) must not be rendered as `{x.status}`-style text children. Render them through `labelFor`. The escape is the same comment.
4. **No `km` in UI copy:** no `km` word in JSX text or help copy (`help/copy/*`, `docs/help/pages/*`), except in tool descriptions.

Each gate prints file:line for every hit. Part 2a turns gates 1–4 on for the 2a areas and part 2b for the rest. The final task of 2b runs them over the whole `src`.

## 6. 2a features — interfaces beyond 15c spec §4
- **`delete_webhook { webhookId }` → `{ deleted: true }`:** hard delete. Webhooks hold no evidence, and delivery logs (if any rows reference it) cascade. The 15c spec §4 tool access is agency admin. It runs behind a `ConfirmDialog`.
- **`test_webhook { webhookId }` → `{ ok: boolean; status?: number; error?: 'timeout' | 'blocked' | 'http' | 'network' }`:**
  - Webhooks are Slack/Teams incoming webhooks (`delivery.ts` `kind IN ('slack','teams')`). They carry no signature. *(Builder-check call.)*
  - The test posts one "Test message from {agency display name}" through the existing sender in `engine/src/delivery/webhooks.ts`, using `slackPayload`/`teamsPayload`, `redirect: 'manual'` and a 5 s timeout.
  - It runs `webhookUrlProblem` (the host allow-list) first; a problem → `blocked`. It doesn't use the SSRF guard, whose fetch is GET-only. The allow-list is the stricter check.
  - Rate limit: 5 per webhook per 10 min, enforced by counting audit rows. Exceeding it → `rate_limited`.
  - It records no delivery row.
  - For tests, the sender's `fetch` is injectable (a parameter defaulting to global `fetch`). Unit tests use it, and E2E stubs it through the existing fake-switch pattern (`WEBHOOK_FAKE_SEND`, E2E only, declared in `turbo.json`).
- **`resend_invitation { invitationId }` → `{ sentAt, expiresAt }`:** a service function `resendInvitation(ctx, invitationId)` in `packages/tools/src/access/team.ts` (15c-3 reuses it). Invitations have no token; sign-in matches by email. So resend resets `expires_at` to the usual TTL and sends the email again:
  - client roles → `client_invite` via the outbox with dedupe key `client-invite:${id}:resend:${n}` (n = resend count, so the unique key never swallows it);
  - agency roles → the new `team_invite` email (D7).
  - Resends are counted by audit rows: 3 per invitation per 24 h, then `rate_limited` with copy "You can resend this invite again tomorrow."
- **`team_invite` email (D7):** sent by `inviteMember` for agency roles and by `resendInvitation`, via the outbox like `client_invite`. It uses the agency's branding (white-label rules: nothing names Rival Monday for a white-label agency). Copy for owner sign-off: subject **"{inviterName} invited you to {agencyName}"**; body **"{inviterName} has invited you to join {agencyName} as {roleLabel}. Sign in with this email address to accept. This invite expires on {expiryDate}."**; button **"Sign in"** (the sign-in URL). The plan adds the template to the outbox kinds and the `delivery_kind` list if they are enumerated.
- **Sign-up email resend:**
  - Auth is magic-link only, so a resend means sending the magic link again (`signIn.magicLink` server-side).
  - The check-email page doesn't know the address today. On submit, the sign-in and sign-up flows set a short-lived (15 min) httpOnly, `SameSite=Lax`, signed cookie `rm_pending_email` (HMAC with `BETTER_AUTH_SECRET`). The resend action reads it and never takes the address from the URL. A missing or expired cookie → the button links back to the form. *(Builder-check call.)*
  - The button appears on both variants of `/sign-in/check-email` (plain and `?for=signup`).
  - The UI cooldown is 60 s, with the button counting down.
  - The server limit is ≤ 5 per hour per lower-cased address. It uses Better Auth's rate-limit storage if the plan's pre-flight finds it configurable per path, otherwise a small `auth.email_resend` counter table in the next migration.
  - The response never reveals whether the address exists (same copy either way: "If that address can sign in, a new email is on its way.").
- **`list_platform_agencies`:** `query?: string` (trimmed; < 2 chars is ignored, not refused), `ILIKE '%' || q || '%'` on `agency.name` with `%`/`_` escaped, cursor as today. The page uses a search box (GET form, `?q=`) + `PrevNext`.
- **Leads and reviews paging:** `list_pool_leads` and `list_decision_reviews` take `{ cursor?, limit? }` (default 25, max 100) via `pageOf`/`pageResult`. The pages use `?cursor=` + `PrevNext`, and filters keep their query params.
- **`list_alert_queue { clientId? }`:** the output gains `capped: boolean`. The page has a client `<select>` (GET) and the notice "Showing the oldest 200 — filter by client to see more" when capped.
- **`/platform/billing` tabs:** `TabsLink` with `?tab=`; an unknown tab → the first tab. The tabs are whatever sections exist today. No new data. The Changes tabs follow the same rule in 2b. *(Builder-check call.)*
- **Intake preview:** as 15c spec §4. `IntakeLanding` gains `preview?: boolean`, which disables lookup and submit and shows no Turnstile. The help key is `page:agency.settings.intake.preview`; the guide goes in `docs/help/pages/agency/`.

## 7. 2b features — interfaces beyond 15c spec §4
- **`ListDetail`** (`apps/web/src/components/list-detail.tsx`): as 15c spec §4 plus `listLabel: string` (aria-label of the list region) and `detailTitle: string` (the `Sheet` title, for screen readers).
  - The `lg` breakpoint is read in CSS: both layouts render, and the Sheet is shown only `< lg` via a client wrapper using `matchMedia`, so the server render needs no viewport guess.
  - Closing the Sheet → `router.push(closeHref)`; Esc and backdrop do the same.
  - Changes and Moves adopt it.
- **`compare_captures`:** as 15c spec §4. Output segments keep `wordDiff`'s existing shape (`DiffOp = 'equal' | 'insert' | 'delete'`, `workspace/word-diff.ts`), and `maskedCount: number` is added. *(Builder-check call.)* The UI collapses runs of > 2 unchanged blocks to "N unchanged sections" (expandable).

## 8. Testing
- **Unit tests per tool:**
  - `delete_ask_thread` refuses another user's thread, an already-deleted thread and the wrong client; a deleted thread disappears from list/get/turn; quota counts are unchanged after a delete; the operator list shows `deletedAt`.
  - `test_webhook` covers the timeout, an allow-list-blocked URL, the Slack and Teams payload shapes, a redirect treated as a failure and the rate limit.
  - `resend_invitation` covers the expiry reset, a new outbox row each time (the dedupe key differs), `team_invite` for agency roles and `client_invite` for client roles, 3/24 h and `canManage`. `inviteMember` sends `team_invite` for agency roles.
  - `confirmAskAction` refuses an action in a deleted thread.
  - Sign-up resend covers the signed cookie (a tampered or expired one is refused), 5/h and the same copy for unknown addresses.
  - Agencies `query` covers < 2 chars ignored and `%` escaped.
  - Paging covers next/prev and filter persistence.
  - `list_alert_queue` covers `capped` and `clientId`.
  - `compare_captures` per 15c spec §7.
- **Gates:** §5, each with a fixture proving it fails on a planted violation.
- **E2E:** a confirm on Ask delete (the thread is gone from the list, and `/platform/ask` shows "Deleted by user"); the mobile Changes sheet at 390 px (open, back button closes, refresh keeps it open); webhook test with the fake receiver; intake preview renders with the submit disabled.
- **Help coverage** for the new page key.

## 9. Not doing
- an operator screen for browsing deleted Ask conversations beyond `/platform/ask`'s chip;
- restoring a deleted conversation;
- knowledge-base/costs Polish (6c/8c);
- the agency "coming soon" line (15c-3);
- host-aware error pages (13a);
- new billing data on the tabs.
