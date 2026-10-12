# Phase 8b — Read-only support sessions ("view as agency") (design)

**Status:** owner-approved design, 2026-10-12. **Branch:** `phase-8b`. **Brief:** `docs/work/phase-8b.md`.
Builds on 8a (`phase-8`: `2026-10-12-phase-8a-platform-console-design.md`, d1–d9), which must be merged first. New decisions and interfaces only; root `CLAUDE.md` § Decisions bind.

## Goal
Platform owners and staff can open any agency's real `/agency` pages and its client workspaces in a time-boxed, reasoned, audited, strictly read-only support session. Agencies can see every session and opt in to an email when one starts.

## Decisions (owner-approved 2026-10-12)
- **g1 Scope = "view as agency" incl. client workspaces** (8a brief Q2 option c). Replaces 8a d7's "names and statuses only" limit **inside support sessions only**; 8a console pages are unchanged.
- **g2 Support session:** reason required (5–300 chars), one agency, 60 minutes, fixed banner, Exit; no extension (new session = new reason).
- **g3 Who:** platform `owner` and `staff`; `viewer` cannot start sessions.
- **g4 Data:** what an agency admin sees, except — contact/recipient/member **emails masked** (`j•••@acme.com`); **Ask threads not visible** (6b e5 author-only; `/platform/ask` rules unchanged); API token values never shown (already true); downloads (PDFs, CSV) allowed and audited. Reviewer data shown as the agency sees it (already hashed per §4.5).
- **g5 Agency visibility:** "Platform access" list for agency admins + per-agency opt-in email (`notify_support_access`, **default off**).
- **g6 One phase.** Tool read/write marking is the foundation (first tasks).
- **g7 Web only.** Sessions never apply to MCP/API channels.
- **g8 Client workspaces as the agency admin sees them** (agency branding); no "as the client sees it" preview.
- **g9 Session rules:** one open session per platform user, browser-wide (cookie); expiry → next request ends it with "Your support session ended." and returns to the console; Exit ends early; starting a new session ends the previous (`replaced`).
- **g10 Writes:** every `write` tool refuses (`read_only_session`); write controls hidden using the same marks; slipped-through actions show "Read-only support session — changes are disabled."
- **g11 Naming:** 9a billing state `read_only` ≠ support session; code uses `supportSession` / `ctx.support`. Sessions work on suspended agencies.

## Tool access marking
- `packages/core/src/tools.ts` tool definition gains **required** `access: 'read' | 'write'` (type-level required; `defineTool` without it fails to compile).
- Classification rule: anything that inserts/updates/deletes tenant data or external state = `write`, including "reads" with side effects (mark seen, `touchPat`-style updates, enqueue jobs, send email). Reads whose only side effect is an audit row = `read`.
- Optional `supportMask?: readonly string[]` — dot-paths of email fields in the tool's output (e.g. `'rows[].email'`) masked under a support context.
- Registry test enumerates all tools: every tool has `access`; the full `write` list is snapshot-tested so additions are reviewed.

## Data model (service role only; next free migrations)
```sql
CREATE TABLE support_session (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  agency_id        uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 300),
  started_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  ended_at         timestamptz,
  end_reason       text CHECK (end_reason IN ('exit','expired','replaced','revoked'))
);
CREATE UNIQUE INDEX support_session_open_uq ON support_session (platform_user_id) WHERE ended_at IS NULL;
CREATE INDEX support_session_agency_idx ON support_session (agency_id, started_at DESC);
ALTER TABLE support_session ENABLE ROW LEVEL SECURITY; ALTER TABLE support_session FORCE ROW LEVEL SECURITY;
REVOKE ALL ON support_session FROM app_user;   -- service-role grants mirror membership

ALTER TABLE agency ADD COLUMN notify_support_access boolean NOT NULL DEFAULT false;   -- no app_user column grant
ALTER TABLE audit_log ADD COLUMN support_session_id uuid;                              -- nullable, no FK (audit survives)
```

## Session resolution (security-sensitive; binding)
- Cookie `rm_support` = `<sessionId>.<hmac>`; HMAC-SHA256 over `sessionId` with `BETTER_AUTH_SECRET`-derived key (`hkdf(secret, 'rm-support-session')`); `httpOnly`, `secure` (non-local), `sameSite=lax`, `path=/`, `maxAge` = remaining seconds.
- Every request with the cookie: verify HMAC (constant-time) → load row → require `ended_at IS NULL`, `expires_at > now()`, `platform_user_id = signed-in user`, and `platformRole(user) ∈ {owner, staff}` (8a `platformRole`). Expired → set `ended_at`, `end_reason='expired'`, clear cookie, redirect `/platform/agencies/<id>?ended=1`. Role lost → `end_reason='revoked'`, same redirect to `/platform`. Any other failure → ignore cookie (clear it), continue as normal viewer.
- `getViewer()` gains kind `support`: `{ kind: 'support'; userId; email; session: { id; agencyId; agencyName; reason; expiresAt } }`. `requireContext()` builds:
```ts
buildAccessContext({ agencyId: s.agencyId, userId, role: 'agency_admin', clientScope: 'all', features: ALL_FEATURES })
  // + support: { sessionId: s.id, platformUserId: userId }
```
- `AccessContext` gains optional readonly `support?: { sessionId: string; platformUserId: string }`.
- While a session is open, `/platform/*` routes still work (operator stays operator); `/agency/*` and `/c/*` use the support context; no membership row is created.

## Registry enforcement (`packages/core/src/tools.ts`)
In `invoke` (and `list`/`describe` visibility), when `ctx.support` is set:
1. `opts.channel !== 'web'` → `permission_denied`.
2. `tool.access === 'write'` → `ToolError('read_only_session', 'Read-only support session — changes are disabled.')` (new error code).
3. Ask thread tools (phase-6 `ask_*`) → treated as hidden → `not_found`.
4. Output passes through `maskSupportFields(output, tool.supportMask)` (`maskEmail`: keep first char of local part + `•••` + `@domain`).
5. Audit row: `role = 'platform_support'`, `support_session_id = ctx.support.sessionId`, `user_id = platformUserId`.

## Tools
- `start_support_session({ agencyId, reason })` → `{ sessionId, expiresAt }` — platform owner/staff (`requirePlatformOperator(…, 'staff')`), `write` (platform scope, not tenant), ends any open session (`replaced`), audits into target agency's `audit_log` (`tool='start_support_session'`), queues email if `notify_support_access`. Server action sets the cookie.
- `end_support_session()` — the session's own user; idempotent; `end_reason='exit'`.
- `list_support_sessions({ cursor?, limit? })` — `agency_admin` of the agency (not available inside a support session's own context — `not_found`), rows `{ startedAt, endedAt, platformUserName, reason, durationMinutes, endReason }`.
- `set_support_access_notify({ enabled })` — `agency_admin`, `write`.
- `list_agency_support_sessions({ agencyId })` — platform viewer+, for the console.

## UI
- `/platform/agencies/[id]`: "View as agency" (owner/staff only) → dialog "Why are you opening this agency? (shown to the agency)", required reason, buttons "Start read-only session" / "Cancel"; recent sessions list. `?ended=1` toast "Support session ended."
- Support banner (all `/agency/*`, `/c/*` pages while in session; accent `#F5A524`, text `#3B2300`, fixed top): "Viewing **{agencyName}** as platform · read only · {reason} · {n} min left · **Exit**". Countdown client-side; server authoritative.
- Write controls hidden: the app layout provides a `readOnly` flag (`ctx.support` set) through a React context; every write control (buttons, forms, menus that call a server action backed by a `write` tool) checks it. Server-side refusal (g10) remains the guarantee. `read_only_session` errors render the g10 copy inline.
- Ask module in session: "Ask conversations are private to their authors."
- Nav shows "Back to platform".
- `/agency/settings/platform-access` (agency admin; others 404): sessions list + toggle "Email me when Rival Monday support opens a session".
- 8a activity feed: new kind `support_session_started` (`agencyName`, no reason text).

## Email
`support-session-started` (Rival Monday branding, agency admins, only when `notify_support_access`): subject "Rival Monday support opened a read-only session"; body "{platformAdminName} opened a read-only session on {date}. Reason: {reason}. They can't change anything. Questions? Reply to this email."

## Testing
- Registry: every tool has `access`; `write` list snapshot; every `write` tool refuses under support ctx; Ask tools `not_found`; non-web channel refused; masking per `supportMask`, none outside sessions.
- Session security: forged/tampered HMAC ignored; another user's session id ignored; expired → ended + redirect; platform role revoked mid-session → `revoked`; viewer can't start; second start → first `replaced`; cookie cleared on every end path.
- Audit: every call in session writes `platform_support` + session id; start writes agency audit + email only when opted in.
- E2E `@support`: staff starts session with reason → portfolio + a client workspace render, no write buttons, banner on each page; forced write action refused with copy; Exit → console toast; agency admin sees the session under Platform access; viewer-role admin has no "View as agency".

## Dependencies on in-flight work
- **phase-8 (8a) merged** (hard): `platformRole`, `requirePlatformOperator(min)`, `/platform/agencies/[id]`, activity feed, `recordPlatformAudit`.
- **phase-6 merged** (hard): registry `CallOptions.channel`, Ask tool names, `audit_log.channel`.
- **phase-9** (if merged first): billing tools get `access` marks; billing page visible in sessions (g4); 9a `read_only` naming (g11).

## Out of scope
Agency approval of sessions, client-view preview, MCP/API sessions, session extension, support ticketing, any write action by platform staff inside agencies.
