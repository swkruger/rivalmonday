# user-profile — personal profile page, avatar, client summaries

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/user-profile   **Base:** main @ fd1f2af1
**Plan/spec:** `docs/superpowers/plans/2026-10-31-user-profile.md`, `docs/superpowers/specs/2026-10-31-user-profile-design.md`

## Status (overwrite)
All six plan tasks are built and committed: tools, storage `delete`, avatar upload and file routes, `/settings/profile`, client summaries, E2E spec `apps/web/e2e/profile.spec.ts` (tag `@profile-page`; not yet run, the final review runs E2E once). No migration. Owner asked "Just go", so every decision below is the agent's call.

## Next (overwrite)
Final review, then `/rm-wrap-up`; merge only with the owner's go-ahead.

## Interfaces this branch adds or changes
- Page `/settings/profile` (all signed-in users; guests and support get 404). `/settings/notifications` redirects to `/settings/profile#notifications`. Avatar menu item "Profile" replaces "Notification settings".
- Routes: `POST /settings/profile/avatar` (multipart `file`); `GET /files/avatar/<userId>/<sha256>.png` (session-gated, owner only; not public like logos).
- Tools (`packages/tools/src/tools/my-profile.ts`): `get_my_profile`, `get_my_notification_settings`, `update_my_profile`, `upload_my_avatar`, `remove_my_avatar` (the last is in `PAUSED_WRITE_ALLOW_LIST`).
- `ObjectStore.delete(key)` (storage package; only `avatars/` keys may be deleted, gated by a test). `Viewer` user/support kinds gain `avatarUrl`. `normalizeAvatar` in `apps/web/src/server/avatar.ts`.
- `e2e-affected-rules.ts`: tag `@profile-page`. Help key `page:account.settings.profile` replaces `...notifications`; guides renamed to `account.settings.profile.{agency,client}.md`.

## Assumes from other branches
None.

## Decisions (agent's calls; owner may overrule)
1. One branch, one URL for every role; summaries follow the current membership.
2. Editable: name and photo. Email is read-only (it is the sign-in key).
3. Photo: PNG/JPEG/WebP up to 4 MB (not 512 KB; phone photos are bigger), no SVG, stored as a 256 px square PNG, private.
4. Removing or replacing a photo deletes the object. A Google `user.image` URL is ignored (initials show).
5. Summaries are read-only panels linking to the full pages (owner: Business profile, Usage, Billing while on; viewer: Business profile). Usage is in credits only; the Billing panel shows the client's own charge in dollars, as the Billing page does.
6. Avatar appears in the top bar and on the profile page only. Paused agency: remove is allowed, upload and rename are refused.

## New backlog (target → item)
- Polish → `contact.name` is not synced when a user renames themselves (agency lists and emails keep the old name).
- Polish → Avatar objects are not removed when a user is purged.
- Polish → `/c/<id>/settings/profile` is reachable by guests by direct URL (read from code: the page only checks the `dashboard` feature; not run). Confirm and 404 guests.
- Polish → The profile E2E shows the Billing summary only if billing is already on; add a seeded client with billing on to assert it every run.
- Polish → `user-avatar.tsx:16`: a missing object renders an empty circle, not initials.
- Polish → Logo route: same page-mode POST flaw as the avatar route had (a stale support cookie gets a 307 to a GET-only route, so a 405); use `getViewerForClient(null)`.
- Polish → A user viewing `/c/B` who opens Profile sees summaries for the cookie membership.
- Polish → Suspended agency users can't reach Remove (the page redirects), so the privacy intent of "remove stays allowed" holds only for read-only agencies.
- Polish → No rate limit on `POST /settings/profile/avatar` (same as the logo route).

## At merge
- After deploy run `pnpm kb:seed` (precedent `docs/OPS.md`, 15b-3b): until it runs Profile has no Guide button and the old `page:account.settings.notifications` row stays.
- The notification-settings points in BACKLOG lines 52-53 close: the read in support is now a registered `supportHidden` tool and the page 404s in support (the other points on those lines stay open).

## Owner verification steps
1. Agency user: sign in, click the round avatar top right, choose Profile. Change Name, press Save, reload: the name stays. Click Upload photo, pick a JPEG or PNG: the top-bar circle shows the photo. Click Remove, then Remove photo: initials return.
2. Same page: scroll to Notifications, flip an In-app switch, reload, confirm it stuck. Open `/settings/notifications` by hand: it lands on the Notifications section.
3. Client owner: sign in, avatar menu, Profile. A "Your business" section shows Business profile, Usage (credits only, no dollars) and Billing (only while billing is on). Click View usage: the Usage page opens. Nothing says Rival Monday.
4. Client viewer: same page shows only Business profile (no Usage, no Billing).
5. Phone photo: on a phone, open Profile, tap Upload photo, take or choose a portrait photo straight from the camera (several MB, HEIC is refused with a message): it shows upright and square.

## Copy to sign
Run `pnpm copy:review`: Profile page description and tips (`help/copy/account.ts`), avatar error lines (`AVATAR_ERROR_COPY`), the Remove-photo dialog, "Your business" summary labels, and guides `account.settings.profile.agency.md` / `.client.md`. Also: re-sign the tip copy (18 sign-offs under `…account.settings.notifications…` are orphaned by the key rename; text unchanged), the fallback `That photo couldn't be uploaded…` lines, and the refused-name lines (`Enter your name.`, `Enter a name without line breaks.`, `Use 80 characters or fewer.`). Also the "Your photo" group label and the "Notifications" heading.
