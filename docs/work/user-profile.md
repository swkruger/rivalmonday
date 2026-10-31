# user-profile — personal profile page, avatar, client summaries

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/user-profile   **Base:** main @ fd1f2af1
**Plan/spec:** none yet

## Status (overwrite)
Brief written; no code.

## Next (overwrite)
Owner answers § 6, then `superpowers:brainstorming`.

## Interfaces this branch adds or changes
None yet. Next free migration **0097** (verified); `auth.user.image` already exists.

## Assumes from other branches
None.

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

## Owner verification steps
None yet.

## Brief

### 1. Scope
**Not a roadmap phase**; no avatar/profile/account item in roadmap or BACKLOG. Build: a page with the user's profile, notification settings and avatar upload; client roles also get Business profile, Usage, Billing summaries. Core spec §3 (roles), §5.2 item 11 (notification preferences).

### 2. Already built — reuse, don't rebuild
**Personal settings:** only `(app)/settings/notifications/` (`page`, `contact-form`, `pref-switch`, `actions`): per-contact kinds × in-app/email, time zone, quiet hours. `viewer.kind === 'user'`; support and guests 404. Linked only from `components/shell/avatar-menu.tsx`. Reads `myNotificationSettings` (service fn, **not a tool**); writes `set_my_notification_pref`, `update_my_contact`. `/settings/*` is non-contextual (`contextOf` falls back to `rm_nav_ctx`; help uses agency scope; guides `account.settings.notifications.{agency,client}`).

**User:** `auth."user"` has `name`, `email`, `image`. **Nothing reads or writes `image`; no name/email edit exists.** Better Auth's Google provider maps `picture` to `image`, so Google sign-ups likely hold a Google URL (data unchecked). `Viewer` has `name`/`email` from the session (`current-viewer.ts:39`), so adding `image` costs no DB stage. `contact` has its own `name`/`email`/tz/quiet hours; a user can have several.

**Upload to mirror:** `server/logo.ts` `normalizeLogo` (sniffed type, 512 KB, unsafe-SVG refusal, ≤ 512 px PNG, sha256); `agency/settings/branding/logo/route.ts` (same-origin, capped read, 404s) → `upload_agency_logo`; `upload_client_logo` (`deps.evidenceStore`, content-addressed). `files/logo/**` is **public** (`proxy.ts`) because logos go in emails. **`ObjectStore` has no delete**, so removal only unlinks. SSRF guard applies only if we fetch a URL. Render: `AvatarMenu` shows initials; `@cs/ui` has no `Avatar` (`FridayAvatar` is separate; `BusinessAvatar` is square). D-25: people = circles.

**Client data today** (from code, not run):
| | Owner | Viewer | Guest | Agency |
|---|---|---|---|---|
| `get_client_profile` page | `dashboard` only, read-only | same | no nav; direct URL passes page guard | edit |
| `get_my_usage` | credits | `not_found` | `not_found` | + Ask count |
| `get_my_billing` | yes; tab while billing on | `not_found` | `not_found` | `not_found` |

`get_client_details` (phone, address, logo, owner) and `get_usage`/`get_billing_summary` are agency-only. Reuse: `c/[clientId]/settings/{profile,usage,billing}/page.tsx`, `ServicesAreaSummary`, `SpendBadge`, `formatCreditsOf`, `lib/spend-copy.ts`, `showsClientBilling`. Copy names the agency (`resolveBranding`), never Rival Monday; credits only (1 USD = 100), no dollars; only staff set limits, so no limit controls for clients.

**Who:** `client_owner`/`client_viewer` = signed-in members. Guests (`/l/`, `rm_guest`, `userId` `contact:<id>`) have no account or avatar menu; `requireSignedIn` refuses personal writes. Operators: `/platform`. Support: read-only, needs `WriteGuard`/`useReadOnly` (`read-only-guard.test.ts`). Tools use the current membership's ctx; `canAccessClient` fails for a user's other client.

### 3. Binding decisions (don't re-open)
Design system v1 (L4 form, 640px, 36 px controls). Settings locations per Phase 15; `PageHeader` + help key + guides (`docs/help/pages/`, `help/copy/`). Reads = registered tools, writes via `runTool`, refusals 404, out-of-scope client `not_found`. New tool ⇒ `ISOLATION_FIXTURES` + `access-marks.test.ts`; new table ⇒ `TABLE_CLASS`. New route ⇒ `e2e-affected-rules.ts` rule. Copy in `pnpm copy:review`. `PAUSED_WRITE_ALLOW_LIST` governs writes while paused.

### 4. Backlog to fold in
- [ ] 7a2/7c minors: T6 no quarterly PDF overwrite test; T7 no `support_view_pdf` subject kind, files audit tested only for evidence, notification settings page in support (consider `notFound()` like `/inbox`); T8 bounced contact looks inactive (`INACTIVE_OK_KINDS`; add `bounced_at`) — *from 7a*
- [ ] 7a2/7c: `contact_bounced:<id>` dedupe is permanent (key by MessageID); sign-out/`/support/exit` end a session with no audit row; inbox + notification-settings pages read via service fns in support (unmasked?); platform overview sums keep archived agencies' daily-stat rows — *from 7a*
- [ ] Client billing page: add an agency contact link ("contact {agency}"); `get_my_billing` returns no contact — *phase-15c2b2*
- [ ] Forms: a stale error stays after Discard on SaveBar forms (alert rules, delivery, profile, features; also the `settings/notifications/contact-form.tsx` pattern they copy) — *phase-15c2b2*
- [ ] Webhook/notification toggle actions (`agency/webhooks/actions.ts`, `settings/notifications/actions.ts`) ignore the `runTool` result — surface the error like `AutoSendSwitch` — *from 5b-2 Minor 4*
- [ ] 5a minors: last-admin revocation deadlock → raw 500; pending invitations left on member removal; N+1 in `myNotificationSettings`; `files.ts` duplicates `isHiddenToolError`; branding fetched twice per request; test gaps (T3–T19) — *from 5a per-task*
- [ ] Isolation suite gaps: shared `global_public` rows and `auth` schema outside the write fingerprint; viewer "other user's row" cases; `reinsertAs` accepts "permission denied" without an INSERT-privilege check; dedupe `requireOwnClient`/`requireVisibleClient` — *phase-7c1*
- [ ] Per-user digest hour; translating emails; "send now" for alerts — *from 4b*

Only the named parts relate. The support 404 already exists (`page.tsx:26`). Also touching: BACKLOG lines 134 (`TipRow` labels) and 162 (`contact` email).

### 5. In-flight workstreams
`git branch --no-merged main`: none. Main's uncommitted work touches `proxy.ts` (`PUBLIC` line), `e2e-affected-rules.ts`, `apps/web/CLAUDE.md`: a public avatar route or a new rule may conflict textually. No other overlap.

### 6. Open questions for the owner
1. **Sub-phases?** (a) One branch; (b) profile + avatar, then summaries. **Rec (a)**: mostly reuse, about 4 small tools.
2. **URL?** (a) `/settings/profile` for all; (b) `/c/<id>/settings/account` for clients. **Rec (a)**; summaries follow the current membership.
3. **Summaries?** (a) Read-only panels linking to full pages; (b) links only; (c) move full pages in. **Rec (a)**.
4. **Notifications?** (a) Link + summary; (b) move in, redirect old URL, add a read tool. **Rec (b)**.
5. **Client viewers?** (a) Business profile only, as tools enforce; (b) open usage. **Rec (a)**. Owners keep credits (7b1).
6. **`briefs_only` clients?** (a) Hide Business profile, as today; (b) show a basic summary. **Rec (a)**.
7. **Avatar storage?** (a) Session-gated `/files/avatar/...` + `ObjectStore.delete`; (b) same, unlink only; (c) public like logos. **Rec (a)**: personal data, not in emails. Limits: 512 KB, no SVG, square.
8. **Editable?** (a) Name + avatar; (b) also email; (c) avatar only. **Rec (a)**: email is the sign-in key.
9. **Google image?** (a) Ignore, initials until upload; (b) hot-link; (c) copy via SSRF guard. **Rec (a)**.
10. **Guests?** (a) No profile; (b) read-only contact page. **Rec (a)**; check the direct-URL gap.
11. **Avatar shows?** (a) Top bar + profile; (b) also team, inbox. **Rec (a)**.
12. **Support, paused?** (a) Support 404, paused writes refused; (b) read-only view. **Rec (a)**.
