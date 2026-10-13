# phase-8b — Read-only support sessions ("view as agency")

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-8b   **Base:** phase-8 @ 213abd2 (stacked; main @ 5aedcb6)
**Plan/spec:** spec `docs/superpowers/specs/2026-10-12-phase-8b-support-sessions-design.md` (g1–g11); plan `docs/superpowers/plans/2026-10-12-phase-8b-support-sessions.md` (S1–S4, Tasks 0–9). Tool classification: `docs/work/phase-8b-tool-access.md`.

## Status (overwrite)
**8b complete 2026-10-13**, ready for `/rm-merge` **after phase-8 merges**. Tasks 0–9 each passed task review; final whole-branch review (opus) "Ready to merge" (no Critical/Important); one fix wave (29af486) + scoped re-review + controller fix (support email name fallback). Final `test:affected --base main`: all green except the known `@cs/engine` `score-stage.test.ts` date time-bomb (fails on main too). `e2e:affected --base main`: 52/53, only the known `smoke.spec.ts:41` flake (passes alone); `@support` 8/8.

## Next (overwrite)
1. Owner: verify + `/rm-merge phase-8` first.
2. Then in this worktree: `git rebase main` (main moved: `1a5b084` ask-card question box, `c7f695e` ask `turn.ts` — no semantic conflict expected: `AskCard` returns null in a session, `turn.ts` guard is first statement); re-run `@ask` `@overview` `@support`; owner verification below; `/rm-merge phase-8b`.

## Interfaces this branch adds or changes
- **Registry (`@cs/core`):** `ToolDefinition.access: 'read'|'write'` (required), `supportMask?`, `supportHidden?: true`; `ToolErrorCode` + `read_only_session`, `conflict`; `AccessContext.support?: { sessionId; platformUserId }`; `AuditEvent.role` widened with `'platform_support'`, `AuditEvent.supportSessionId?`. Under `ctx.support`: non-web → `permission_denied`; `supportHidden` → `not_found` (+ hidden in list/describe); `write` → `read_only_session` before parsing; output masked; audited as `platform_support` (skip-web does not skip). `maskEmail`, `maskEmailsIn`, `maskSupportFields` in `core/src/mask.ts`.
- **Migrations 0049/0050** (next free: **0051**): `support_session` (service-role only, RLS forced, FK `auth."user"` cascade), `agency.notify_support_access` (default false), `audit_log.support_session_id`.
- **Tools:** `start_support_session` (staff+, write, skip-web + target-agency audit), `end_support_session`, `list_support_sessions` (agency_admin, supportHidden, `notifyEnabled`), `set_support_access_notify`, `list_agency_support_sessions` (platform viewer+). Activity kind `support_session_started`. Session service `@cs/tools` `platform/support.ts` (`startSession`, `endSession`, `endOpenSessionFor`, `resolveSession({endStale})`, `platformRoleForUser`).
- **Web:** cookie `rm_support` (`server/support-cookie.ts`, HKDF from `authSecret`); `getViewer()` kind `support`; `requireOperatorContext()`; routes `GET /support/end`, `POST /support/exit`; **`/platform` pages moved to `app/(platform)/platform/**`** (own layout; 9a plan paths must follow); shared `components/shell/app-shell.tsx`, `shell-theme.tsx`, `support-banner.tsx`; `components/read-only.tsx` (`ReadOnlyProvider`, `useReadOnly`, `WriteGuard`); `/agency/settings/platform-access`; `server/support-email.ts`; email template `support-session-started`. No new env vars. E2E tag `@support`.

## Decisions (owner go-ahead + controller rulings; full list in the SDD ledger)
1. Stacked on phase-8 (owner go-ahead 2026-10-13).
2. Operators still need an agency membership to reach `/platform` (R7) — member-less env owners can't open sessions.
3. `/platform/**`, start, Exit, sign-out use the operator's own ctx (R3); `/agency`, `/c` use the support ctx.
4. Render never writes; only `GET /support/end` ends expired/revoked rows and clears the cookie, and only for the failing `sid` (R4, R14).
5. Email sent directly (best-effort, no retry) from the start action; no outbox (R6).
6. In a session: never-rendered PDFs refused (R8); inbox 404 + mark-read refused (R9, R15); search skips paid embeds (R13); Ask-review toggle omitted on client profile.
7. Masking also masks emails inside names (`maskEmailsIn`); email-keyed fields fail closed (R17).

## New backlog (target → item)
- Owner → support email says "Reply to this email" but `replyTo` is null (replies go to `EMAIL_FROM`); needs a reply-to address/env var.
- Polish → member-less platform operators (env-only owners) can't reach `/platform` or open sessions.
- Polish → direct service reads in sessions (`listTeam`, `listClientRecipients`, `getAgencyBranding`, `listWebhooks`, `/go`, evidence/PDF bytes) aren't session-audited themselves (the page's tool reads are); `end_support_session` audit lands in the operator's home agency.
- Polish → `support_session` cascade-delete not tested; ok-at-59-min resolve case untested.
- Polish → operator console list shows raw platform user name (agency list falls back to "Rival Monday support").
- Polish → a >64-char non-RFC local part is only partly masked.

## Owner verification steps
After `pnpm demo:reset`, as the demo operator (staff/owner):
1. `/platform/agencies/<demo agency>` → "View as agency" → reason → banner on `/agency` and a `/c/<id>` page; no add/edit/approve buttons; team page shows `j•••@…` emails; `/platform` still shows your own branding.
2. Exit → back on the console with "Support session ended."
3. As the demo agency admin: `/agency/settings/platform-access` lists sessions (incl. two seeded); toggle the email opt-in, start another session as operator, check the email arrives (Postmark test account).
4. A viewer-role platform admin sees no "View as agency".
