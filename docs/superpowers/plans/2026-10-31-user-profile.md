# User Profile Implementation Plan

> **For agentic workers:** use superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`).

**Goal:** `/settings/profile` where a signed-in user sees and edits their details and avatar and manages notifications; client roles also get Business profile, Usage and Billing summaries.
**Spec:** `docs/superpowers/specs/2026-10-31-user-profile-design.md` (decisions there are binding).
**Worktree:** `../CompetitorSpy-wt/user-profile`, test DB `cs_user_profile_test` (already in its `.env`). No migration.

## Global constraints
- Reads are registered tools, writes via `runTool`, refusals 404. New tool ⇒ `ISOLATION_FIXTURES` + `access-marks.test.ts`. New route ⇒ `e2e-affected-rules.ts`. Every write control ⇒ `WriteGuard`/`useReadOnly`.
- Design system v1 binding (`docs/design-system/`, `packages/ui/CLAUDE.md`): sections before cards, 640 px form column, 36 px controls, people = circles (D-25).
- Client-facing copy never names Rival Monday; credits only (1 USD = 100), never dollars; no limit controls. New copy is signed in `pnpm copy:review` by the owner.
- A server module imports only components from a `'use client'` module; shared values go in a plain module.
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of each package touched before coding. Commits end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents: own model). LF only.
- Test scope: focused tests only per task; `test:affected` + `e2e:affected` run once at final review.

## Dependencies on in-flight work
None on branches. Main's checkout has uncommitted `proxy.ts` / `e2e-affected-rules.ts` / `apps/web/CLAUDE.md` / `client-boundary.test.ts` edits; expect small textual conflicts at merge, no behaviour overlap. This plan needs no `proxy.ts` change: `/files/avatar/*` stays behind the session.

## Review focus
1. A phone photo (rotated by EXIF, several MB, HEIC) gives an upright avatar or a clear error, never a sideways image or a 500.
2. One user can never fetch another's avatar, and a guest or signed-out request gets 404; a crafted `userId`/`file` never reaches the store.
3. A Google URL already in `user.image` never renders or gets deleted; `store.delete` only ever touches `avatars/<own id>/`.
4. A client whose usage or billing read refuses (viewer, archived, billing off) still gets the page, minus that panel.
5. Support session: no profile page, no menu link, and notification reads don't reach unmasked data.

---

### Task 1: `ObjectStore.delete`
**Goal:** a delete on every store, plus a gate that only avatar code calls it.
**Files:** modify `packages/storage/src/{store,memory,fs,r2,contract}.ts` and their tests; create `packages/tools/src/tools/store-delete-gate.test.ts`. Fix any other `ObjectStore` implementers `tsc` finds.
**Interfaces:** `delete(key: string): Promise<void>`; doc comment: "Only avatars use this; evidence is never deleted."
**Behaviour:** a missing key resolves quietly. R2 uses `DeleteObjectCommand` (mirror `r2.ts` client use). fs refuses the same unsafe keys `put` does.
**Tests:** contract: `delete removes an object`, `delete of a missing key resolves`; r2 unit test asserts the command and key. Gate test scans non-test `.ts` under `packages/` and `apps/` for `\b\w*[sS]tore\.delete\(` and expects only `packages/tools/src/tools/my-profile.ts` (the gate passes vacuously until Task 2; keep the allow-list anyway).
**Done when:** `pnpm --filter @cs/storage exec vitest run` passes (skip the live R2 file if it needs creds); `tsc` clean in storage, tools.

### Task 2: Personal profile tools
**Goal:** the five tools in spec § Interfaces.
**Files:** create `packages/tools/src/tools/my-profile.ts`, `my-profile.test.ts`; modify the registry where `setMyNotificationPrefTool` is registered, `isolation/fixtures.ts`, `access-marks.test.ts`, `billing-guard.ts` (`remove_my_avatar` only), `packages/demo/src/coverage.ts` + `coverage.test.ts` as needed.
**Follow pattern:** `settings.ts` (`set_my_notification_pref`) for shape and exposure; `client-details.ts:upload_client_logo` for PNG signature + sha256 checks and content-addressed put. Better Auth's user table: mirror how `access/team.ts` reads it.
**Behaviour:**
- All call `requireSignedIn(ctx)`; guests refused. Reads `supportHidden: true`. Same MCP/Ask exposure as `set_my_notification_pref` (mirror its registration; don't widen).
- `AVATAR_PREFIX = '/files/avatar/'`. `avatarUrl` = `image` when it starts with the prefix, else null. Export `avatarUrlOf(image: string | null): string | null` from `@cs/tools` for the viewer.
- Stored `image` = `/files/avatar/<userId>/<sha256>.png` (a relative path; key `avatars/<userId>/<sha256>.png`). Never derive a delete key from anything except a value matching `^/files/avatar/<ctx.userId>/[0-9a-f]{64}\.png$`.
- Upload: validate → put (treat `object_exists` as stored) → update user → delete the previous own object if different. Remove: set `image` null, then delete. A failed delete is logged and does not fail the call (orphans are harmless; the pointer is the truth). Missing store → `ToolError('internal', 'Avatar storage is not configured')`.
- `update_my_profile`: zod `trim().min(1).max(80)` and refine `/^[^\u0000-\u001f\u007f]+$/` with message `Enter a name without line breaks.`
- `get_my_notification_settings` wraps `myNotificationSettings(deps.service, ctx.userId)`.
**Tests:** `get_my_profile hides a foreign Google URL`; `update_my_profile trims and saves`, `rejects blank and control chars`; `upload stores and returns the path`; `upload rejects non-PNG and a checksum mismatch`; `re-upload deletes the old object, same sha keeps it`; `an image pointing at another user's path is never deleted`; `upload over a Google URL deletes nothing`; `remove clears and deletes`; `a failed delete still succeeds`; guest + support refused; paused agency: update/upload refused, remove allowed; isolation fixtures pass.
**Done when:** `pnpm --filter @cs/tools exec vitest run my-profile store-delete-gate access-marks enforcement isolation` and `pnpm --filter @cs/demo exec vitest run coverage` pass.

### Task 3: Avatar pipeline, file route, viewer, menu
**Goal:** upload + serving + showing in the top bar.
**Files:** create `apps/web/src/server/avatar.ts` + test, `apps/web/src/app/(app)/settings/profile/avatar/route.ts` + test, `apps/web/src/app/files/avatar/[userId]/[file]/route.ts` + test, `apps/web/src/components/user-avatar.tsx`; modify `server/viewer.ts`, `server/current-viewer.ts`, `components/shell/avatar-menu.tsx` + test, `scripts/e2e-affected-rules.ts`.
**Interfaces:** `AVATAR_MAX_BYTES = 4 * 1024 * 1024`; `type AvatarError = 'too_large' | 'unsupported_type' | 'undecodable'`; `normalizeAvatar(bytes: Uint8Array): Promise<{ png: Uint8Array; sha256: string } | { error: AvatarError }>`; `<UserAvatar name email avatarUrl size />` (circle; initials fallback moved from `avatar-menu.tsx`; `alt=""`, decorative next to the name).
**Decided copy:** `too_large` "Photo must be 4 MB or smaller."; `unsupported_type` "Use a PNG, JPEG or WebP image."; `undecodable` "We couldn't read this image."
**Behaviour:**
- `normalizeAvatar`: reuse `sniffType` from `logo.ts`; SVG and unknown ⇒ `unsupported_type` (HEIC falls here). `sharp(bytes, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate().resize(256, 256, { fit: 'cover', position: 'centre' }).png({ compressionLevel: 9 })`. An animated WebP keeps its first frame.
- POST route mirrors `branding/logo/route.ts` (same-origin, capped read, 404s; extract `sameOrigin`/`readCapped` to `server/upload.ts` and use it from both). Allowed: `viewer.kind === 'user'`. Calls `upload_my_avatar`. Success `{ avatarUrl }`.
- GET file route: `viewer = getViewer()`; only `user`/`support` kinds whose `userId === params.userId`; regexes as the client logo route, `userId` per Better Auth's id shape (`^[\w-]{1,64}$`, check `auth.user` ids); `cache-control: private, max-age=31536000, immutable`; `nosniff`. Everything else 404.
- Viewer: session gains `image`; `avatarUrl: avatarUrlOf(image)` on `user`, `support`, optional in test fixtures only if tsc demands it. No new DB stage (`check` profile test if it counts).
- Menu: trigger shows `UserAvatar`; "Profile" → `/settings/profile` replaces the notifications item for `kind === 'user'`.
**Tests:** `avatar.test`: `crops a 400x200 to 256x256 PNG`, `applies EXIF orientation` (build a tall image with `withMetadata({ orientation: 6 })` and assert the dark half's side), `strips metadata`, `refuses SVG, text, 4 MB + 1`, `corrupt JPEG = undecodable`. File route: owner 200 + headers; other user, guest, signed-out-like null 404; bad params never call the store. POST route: cross-origin 404, guest 404, too large 400 with copy. Menu: link + image vs initials; support viewer has no Profile link.
**Done when:** those focused tests + `src/client-boundary` + `read-only-guard` pass; `tsc` clean in web.

### Task 4: The page: details + notifications
**Goal:** `/settings/profile`, old URL redirects, help moves.
**Files:** create `(app)/settings/profile/page.tsx`, `details-form.tsx`, `avatar-control.tsx`, `actions.ts`, tests; `(app)/settings/notifications/notification-lists.tsx`; `docs/help/pages/account.settings.profile.{agency,client}.md`. Modify `(app)/settings/notifications/page.tsx` (redirect only), `actions.ts` (`revalidatePath('/settings/profile')`), `help/copy/account.ts`, `help/coverage.test.ts`, `(app)/help-account.test.tsx`, `app/page-titles.test.ts`, `components/shell/nav-context.ts` + tests, `nav-items` + `sidebar-nav` tests, `read-only-guard.test.ts` lists, `packages/demo/src/coverage.ts` + README, `scripts/e2e-affected-rules.ts`. Delete `docs/help/pages/account.settings.notifications.{agency,client}.md` (content folds into the new guides; keep `account.settings.notifications.*` tip copy). `grep -rn "settings/notifications\|account.settings.notifications"` must leave only the redirect, the action/component imports and tip keys.
**Interfaces:** `metadata.title = 'Profile'`; `HELP_KEY = 'page:account.settings.profile'`; `PAGE_COPY['account.settings.profile']`; `updateNameAction(prev, fd): Promise<FormResult>`; `removeAvatarAction(): Promise<FormResult>`.
**Behaviour:**
- `requireContext()`; `viewer.kind !== 'user'` ⇒ `notFound()`. Read `get_my_profile` + `get_my_notification_settings` with `callTool`; guides as today (`helpGuides(ctx, 'agency')`, the scope comment moves too).
- `PageHeader` title "Profile", breadcrumb `[{ label: 'Profile' }]`.
- "Your details" `Section` (`max-w-[640px]`): `AvatarControl` (84 px `UserAvatar`, "Upload photo" button + hidden file input `accept="image/png,image/jpeg,image/webp"`, "Remove" with `ConfirmDialog` when an avatar exists, inline `ErrorNote`/status surviving revalidation, `router.refresh()` after success so the top bar updates; follow the branding logo control); `DetailsForm` name input + read-only email with hint "This is the address you sign in with." and `SaveBar`, `onReset` prevented (React 19 reset gotcha).
- `<section id="notifications" className="scroll-mt-20">` holds `NotificationLists` (moved markup incl. `TipRow`, empty state).
- Old page: `redirect('/settings/profile#notifications')`, no header (drop from help coverage and page titles).
**Decided copy:** description "Your name, photo and notifications."; remove dialog title "Remove your photo?", body "Your initials show instead.", confirm "Remove photo"; hint under the upload "PNG, JPEG or WebP, up to 4 MB."; success "Saved."
**Tests:** page: guest + support 404; renders name, read-only email, notification list; `/settings/notifications` redirects; form: save calls action and shows Saved., blank shows error; avatar control: upload success refreshes, 400 shows server copy, hidden in read-only. Help coverage + titles + `no RM name` leak test green.
**Done when:** focused tests in `src/app/(app)/settings`, `src/help`, `src/components/shell`, `src/app/page-titles`, `src/components/read-only-guard`, `scripts` config, and demo coverage pass.

### Task 5: Client summaries
**Goal:** "Your business" panels.
**Files:** create `(app)/settings/profile/client-summaries.tsx` + test, `lib/client-plan-status.ts`; modify `(app)/c/[clientId]/settings/billing/page.tsx` (use the extracted helper, no behaviour change), `settings/profile/page.tsx`, `help/copy/account.ts`, guides, demo coverage (route entry as `ownerLoneStar`).
**Interfaces:** `<ClientSummaries ctx clientId billingEnabled />` server component; `clientPlanStatus(b: MyBilling): { status: PlanStatus; detail: string | null }` moved verbatim from the billing page (with `MyBilling`, re-exported there so tests keep working).
**Behaviour:**
- Render only when `ctx.role` is `client_owner`/`client_viewer` and `clientId` is set. Matrix in spec § 5. Determine `billingEnabled` as `app-shell.tsx` does for `showsClientBilling` (reuse its source, don't re-derive).
- Reads via `tryCallTool` so a refusal drops one panel only: `get_client_profile`, `get_my_usage`, `get_my_billing`. If nothing is left, render no section.
- `Section title="Your business"` with hairline rows (design system: no cards), each: heading, one fact line, one link:
  - Business profile: business name + `ServicesAreaSummary`-level fact as "{n} services" when known; link "View business profile" → `/c/<id>/settings/profile`.
  - Usage: `formatCreditsOf(used, limit)` + `SpendBadge`; link "View usage" → `/c/<id>/settings/usage`.
  - Billing: status chip via `CLIENT_PLAN_STATUS`, next charge `formatMoney`/`formatDate` in viewer tz when present, else `detail`; link "View billing" → `/c/<id>/settings/billing`.
- No controls; nothing here needs `WriteGuard`.
**Tests:** owner sees 3 panels with correct links; viewer only Business; owner with billing off has no Billing; `briefs_only` client (no `dashboard`) has no Business panel; `get_my_usage` refusing leaves the rest; agency role renders nothing; no `dollar`/`$` in the Usage panel, no "Rival Monday" anywhere; billing page tests still pass.
**Done when:** focused tests pass; demo `coverage` passes.

### Task 6: E2E + docs
**Goal:** one browser path, docs ready for merge.
**Files:** create `apps/web/e2e/profile.spec.ts`; modify `scripts/e2e-affected-rules.ts` (`@profile-page` tag in `KNOWN_TAGS`), `apps/web/CLAUDE.md` (avatar + notifications gotcha, one line), `docs/work/user-profile.md`.
**Tests (reuse stored sessions; no new magic link):** `agency admin: opens Profile from the menu, renames, uploads a PNG, sees the image in the top bar, removes it`; `client owner: sees the three summaries and follows Usage`; `/settings/notifications lands on #notifications`.
**Work file:** Status, Interfaces, Decisions (spec, agent's calls), New backlog: `contact.name` not synced on rename; avatar objects not removed when a user is purged; `/c/<id>/settings/profile` reachable by guests by direct URL (read from code; confirm); Owner verification steps; Copy to sign.
**Done when:** `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` passes; spec run per `apps/web/CLAUDE.md` § Running one spec at final review.
