# User Profile page: design

**Owner request:** "Add a User Profile page, User can see its profile, notification settings, upload avatar, client see Business profile, Usage and Billing Summaries."
**Decisions:** the owner said "Just go" when offered questions, so these are the agent's calls from the kickoff brief (`docs/work/user-profile.md` § 6), not owner choices. Marked (owner may overrule).

## Decisions (agent's calls, owner may overrule)
1. **One branch**, no migration. `auth."user".image` exists and `app_service` can update it (0035).
2. **One URL for all signed-in users: `/settings/profile`**, title "Profile". Summaries follow the current membership (`ctx`). Avatar menu: "Profile" replaces "Notification settings".
3. **Page order:** Your details → Your business (client roles only) → Notifications (`#notifications`).
4. **Notifications move onto the page.** `/settings/notifications` becomes a redirect to `/settings/profile#notifications`, and the read becomes a registered tool (closes the BACKLOG point that it reads via a service fn in support).
5. **Summaries are read-only panels with a link to the full page.** No editing, no limit controls, no dollars; credits only.
   | Role | Business profile | Usage | Billing |
   |---|---|---|---|
   | `client_owner` | if `dashboard` | yes | if `showsClientBilling` |
   | `client_viewer` | if `dashboard` | no | no |
   | agency roles | no | no | no |
   Same limits the tools enforce today. A panel whose read refuses is left out; it never 404s the page. Nothing names Rival Monday.
6. **Editable:** name + avatar. Email is shown read-only (it is the sign-in key).
7. **Avatar:** session-gated `GET /files/avatar/<userId>/<sha256>.png`, viewable only by that user. PNG, 256 x 256 centre crop, EXIF orientation applied, metadata stripped. Input PNG, JPEG or WebP, **max 4 MB** (the brief said 512 KB; phone photos are larger, and Vercel caps bodies at 4.5 MB). **No SVG.**
8. **Removal really deletes the object:** `ObjectStore.delete`, used only for `avatars/` keys ("evidence never deleted" stays true and is gated by a test). Replacing an avatar deletes the old object too.
9. **An existing Google URL in `user.image` is ignored:** only values starting `/files/avatar/` count as an avatar; others show initials and are overwritten on first upload.
10. **Guests get no profile page; support sessions get 404** (operator's own account is not edited in someone's session). `kind !== 'user'` → 404.
11. **Avatar shows** in the top-bar menu trigger and on the profile page only. Support viewers see their own avatar in the top bar.
12. **Paused agency:** `update_my_profile` and `upload_my_avatar` refused as usual; `remove_my_avatar` allowed (privacy), added to `PAUSED_WRITE_ALLOW_LIST`.
13. **Renaming** updates `auth.user.name` only. `contact.name` (what the agency manages and emails use) is unchanged; filed in backlog.

## Interfaces
Tools (`packages/tools/src/tools/my-profile.ts`, `permission: 'read'`, `requireSignedIn`, registered like `set_my_notification_pref`):
```ts
get_my_profile: {} => { name: string; email: string; avatarUrl: string | null }       // access read, supportHidden
get_my_notification_settings: {} => { lists: Awaited<ReturnType<typeof myNotificationSettings>> } // access read, supportHidden
update_my_profile: { name: string /* trim, 1..80, no control chars */ } => { ok: true } // write
upload_my_avatar: { png: base64 (<= 512 KB decoded), sha256: 64 hex } => { avatarUrl: string } // write
remove_my_avatar: {} => { ok: true }                                                    // write
```
Web: `normalizeAvatar(bytes): Promise<{ png; sha256 } | { error: AvatarError }>` in `apps/web/src/server/avatar.ts`; `POST /settings/profile/avatar` (multipart `file`, mirrors the logo route); `GET /files/avatar/[userId]/[file]`. `Viewer` user/support kinds gain `avatarUrl: string | null`.
Storage: `ObjectStore.delete(key: string): Promise<void>` (a missing key is not an error). Key `avatars/<userId>/<sha256>.png`.

## Non-goals
Email change, account deletion, avatars in team list / inbox / emails, per-agency favicons, new usage or billing data.
