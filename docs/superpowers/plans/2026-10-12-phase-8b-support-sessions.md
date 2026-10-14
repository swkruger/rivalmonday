# Phase 8b — Read-only support sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Lean plan format** (root `CLAUDE.md`): interfaces binding; full code only for SQL, security-sensitive logic and decided copy.

**Goal:** Platform owners/staff open any agency's `/agency` pages and client workspaces in a reasoned, 60-minute, audited, strictly read-only support session; agencies see every session and may opt in to an email.

**Architecture:** Every registry tool gets a required `access: 'read'|'write'` mark; a signed `rm_support` cookie points at a `support_session` row; `getViewer()` resolves a `support` viewer and `requireContext()` builds a synthetic agency-admin `AccessContext` with `support` set; the registry refuses writes, non-web channels and Ask tools under that context, masks declared email fields and audits as `platform_support`; the UI hides write controls via a `readOnly` React context and shows a fixed banner.

**Tech Stack:** TypeScript, `@cs/core` registry, Drizzle/Postgres (RLS), Next.js App Router (server actions, cookies), Node `crypto` (HKDF, HMAC, `timingSafeEqual`), `@cs/email`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-phase-8b-support-sessions-design.md` (g1–g11). Read it fully before Task 1; § Session resolution and § Registry enforcement are binding.

## Global constraints
- Read `docs/gotchas-cross-cutting.md` and touched packages' `CLAUDE.md` first.
- Support context is **never** granted write: server-side refusal is the guarantee; UI hiding is cosmetic.
- No membership rows created for platform users. Never trust the cookie without the DB row + signed-in user match + live platform role (`owner|staff`).
- Web channel only. Ask threads invisible in sessions.
- Masking format: first char of local part + `•••` + `@domain` (e.g. `j•••@acme.com`); applied only when `ctx.support` is set.
- New table service-role only (RLS forced, no policies, no `app_user` grants). Migrations: next free number at execution time.
- Copy is binding (spec § UI, § Email; error "Read-only support session — changes are disabled.").
- Commits end with the Co-Authored-By line from root `CLAUDE.md`; LF only.

## Decisions (plan-local)
- **S1** Tool marking is done package by package in Task 2 with a classification table committed at `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md` (tool → access → one-line reason) that the reviewer signs off; ambiguous = `write`.
- **S2** Cookie helpers live in `apps/web/src/server/support-cookie.ts` (`signSupportCookie(sessionId)`, `verifySupportCookie(value): string | null`); session service in `packages/tools/src/platform/support.ts` (DB logic, testable without Next).
- **S3** `readOnly` UI flag: `ReadOnlyProvider` / `useReadOnly()` in `apps/web/src/components/read-only.tsx`; a `WriteGuard` wrapper component hides children when read-only. Task 8 wraps every write control found by grepping server-action imports in page components.
- **S4** Platform users without memberships: `getViewer()` returns `support` when a valid session exists, else the existing `member-less` (still `/no-access` for agency routes; `/platform/*` must not require a membership — verify in Task 0 against 8a's code).

## File structure
- `packages/core/src/tools.ts` (`access`, `supportMask`, `ToolErrorCode` + `'read_only_session'`, enforcement), `packages/core/src/access.ts` (`support?`), `packages/core/src/mask.ts` (new).
- All tool files under `packages/tools/src/tools/*.ts` (+ phase-6/8a/9 tools present at execution) — `access` marks.
- `packages/db/src/schema/support.ts` (new), `tenancy.ts` (`notifySupportAccess`), `ledger.ts` (`supportSessionId`), audit sink; migrations.
- `packages/tools/src/platform/support.ts`, `packages/tools/src/tools/support.ts` (+ tests), `all.ts`.
- `apps/web/src/server/{support-cookie.ts,viewer.ts,current-viewer.ts}`; `app/(app)/layout.tsx`; `components/read-only.tsx`, `components/shell/support-banner.tsx`; `app/(app)/platform/agencies/[id]/{support-dialog.tsx,actions.ts}`; `app/(app)/agency/settings/platform-access/page.tsx`; `app/(app)/support/exit/route.ts`.
- `packages/email/src/templates/support-session-started.tsx`.
- `apps/web/e2e/support.spec.ts`; `packages/demo/src/coverage.ts`.

## Dependencies on in-flight work
- **phase-8 (8a) merged** (hard): `platformRole`, `requirePlatformOperator(deps, ctx, min)`, `/platform/agencies/[id]`, activity feed kinds, `recordPlatformAudit`.
- **phase-6 merged** (hard): registry `CallOptions.channel`, Ask tool names (`ask_*`), `audit_log.channel`.
- **phase-9** if merged first: its tools need `access` marks in Task 2; billing page visible in sessions.

## Review focus
1. A support context reaching a write path that bypasses the registry (direct service calls from pages/actions, e.g. `listTeam`, `getAgencyBranding`, server actions calling service functions) — every such path must refuse or be read-only.
2. Session cookie replayed after Exit, after expiry, by another signed-in user, or after the platform role is revoked — all must fall back to normal viewer and clear the cookie.
3. Background/side-effect reads (marking alerts seen, last-viewed timestamps, notification read state) triggered just by rendering pages in a session must not write.
4. Masking misses: any email field rendered on agency/client pages in a session (team page, recipients, contacts, invitations, audit views).
5. Expiry mid-request or mid-navigation: no half-rendered page with stale context; redirect cleanly with the toast.

---

### Task 0: Pre-flight
- [ ] `git rebase main` (phase-6 + phase-8 merged; phase-9 if merged). Re-check dependencies; confirm how `/platform/*` resolves context for member-less operators (S4); update paths.
- [ ] Inventory every page/action that calls a service function directly instead of a registry tool (`grep -rn "from '@cs/tools'" apps/web/src/app` for non-tool imports, e.g. `listTeam`, `getAgencyBranding`, `unreadCount`) → list in `docs/work/phase-8b.md` for Tasks 6/8 (Review focus 1, 3).
- **Done when:** `pnpm test:affected` green.

### Task 1: `access` field, error code, masking helper
**Goal:** registry type changes + `maskEmail`/`maskSupportFields`.
**Files:** `packages/core/src/tools.ts`, `packages/core/src/mask.ts` (+ tests), `packages/core/src/access.ts`.
**Interfaces:** `access: 'read' | 'write'` (required in `Tool`), `supportMask?: readonly string[]`; `ToolErrorCode` adds `'read_only_session'`; `AccessContext.support?: { readonly sessionId: string; readonly platformUserId: string }` (+ `AccessContextInput`); `maskEmail(email: string): string`; `maskSupportFields<T>(output: T, paths: readonly string[]): T` (dot paths, `[]` for arrays; non-string/absent → untouched; returns a copy).
**Tests:** maskEmail cases (`john@acme.com` → `j•••@acme.com`, single-char local, no `@` → `•••`); path masking for nested arrays; original not mutated.
**Done when:** `pnpm --filter @cs/core exec vitest run mask tools` passes (existing tool definitions will fail typecheck until Task 2 — Task 1 and Task 2 land together in one reviewer pass if needed; implementer may temporarily default `access` in a test-only helper but not in prod types).

### Task 2: Mark every tool
**Goal:** every tool has `access`; email fields declared in `supportMask`; classification table (S1).
**Files:** every `packages/tools/src/tools/*.ts` (and phase-6/8a/9 tools present), `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`, `packages/tools/src/tools/access-marks.test.ts`.
**Behaviour:** spec § Tool access marking rule. Known `write` examples: anything named `create_*`, `update_*`, `set_*`, `add_*`, `revoke_*`, `invite_*`, `approve_*`, `dismiss_*`, `run_*`, `convert_*`, `deactivate_*`, `mark_*`, rating/feedback tools, `start_support_session`. Reads with hidden writes (check bodies) → `write`. `supportMask` on tools returning contact/recipient/member/invitation emails.
**Tests:** every registered tool has `access`; snapshot of sorted `write` tool names; every tool whose output schema has a key matching `/email/i` declares it in `supportMask` (schema walk).
**Done when:** `pnpm --filter @cs/tools exec vitest run access-marks` passes and `pnpm typecheck` is clean.

### Task 3: Schema + migrations
**Goal:** spec § Data model.
**Files:** `packages/db/src/schema/support.ts`, `tenancy.ts`, `ledger.ts`, audit sink (write `supportSessionId`), migrations (SQL from spec verbatim; grants mirror `membership`).
**Tests:** `app_user` can't read `support_session` or update `agency.notify_support_access`; partial unique index (two open sessions for one user rejected; ended + open allowed); reason length check.
**Done when:** `pnpm --filter @cs/db exec vitest run support` passes.

### Task 4: Session service + cookie
**Goal:** start/end/resolve logic and signed cookie.
**Files:** `packages/tools/src/platform/support.ts` (+ test), `apps/web/src/server/support-cookie.ts` (+ test).
**Interfaces:**
```ts
// packages/tools/src/platform/support.ts
export type OpenSupportSession = { id: string; platformUserId: string; agencyId: string; agencyName: string; reason: string; expiresAt: Date };
export async function startSession(service: ServiceDb, a: { platformUserId: string; agencyId: string; reason: string; now?: Date }): Promise<OpenSupportSession>; // ends open session as 'replaced' in same tx; expires = now + 60 min
export async function endSession(service: ServiceDb, id: string, reason: 'exit'|'expired'|'replaced'|'revoked', now?: Date): Promise<void>; // idempotent
export type ResolveResult = { kind: 'ok'; session: OpenSupportSession } | { kind: 'expired'; agencyId: string } | { kind: 'revoked' } | { kind: 'invalid' };
export async function resolveSession(deps: Pick<ToolDeps,'service'|'platformAdmins'>, a: { sessionId: string; userId: string; now?: Date }): Promise<ResolveResult>;
```
Cookie (security-sensitive, full code):
```ts
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
const key = () => Buffer.from(hkdfSync('sha256', serverEnv().BETTER_AUTH_SECRET, '', 'rm-support-session', 32));
const mac = (id: string) => createHmac('sha256', key()).update(id).digest('base64url');
export function signSupportCookie(sessionId: string): string { return `${sessionId}.${mac(sessionId)}`; }
export function verifySupportCookie(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf('.'); if (i <= 0) return null;
  const id = value.slice(0, i), given = Buffer.from(value.slice(i + 1)), want = Buffer.from(mac(id));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}
```
**Behaviour:** `resolveSession`: row missing / `ended_at` set / user mismatch → `invalid`; `expires_at ≤ now` → `endSession('expired')`, `expired`; `platformRole ∉ {owner,staff}` → `endSession('revoked')`, `revoked`.
**Tests:** start replaces; end idempotent; resolve matrix (Review focus 2); cookie: round trip, tampered mac, tampered id, missing dot, non-uuid id.
**Done when:** `pnpm --filter @cs/tools exec vitest run support` and `pnpm --filter @cs/web exec vitest run support-cookie` pass.

### Task 5: Viewer + context
**Goal:** `support` viewer kind and synthetic `AccessContext`.
**Files:** `apps/web/src/server/viewer.ts`, `current-viewer.ts` (+ tests), cookie read via `cookies()`.
**Interfaces:** `Viewer` adds `{ kind: 'support'; userId: string; email: string; session: OpenSupportSession }`. `requireContext()` for `support` → `buildAccessContext({ agencyId, userId, role: 'agency_admin', clientScope: 'all', features: ALL_FEATURES, support: { sessionId, platformUserId: userId } })`.
**Behaviour:** order: signed-in user → valid cookie → `resolveSession` → `support`; `expired` → clear cookie + `redirect('/platform/agencies/<id>?ended=1')`; `revoked` → clear + `redirect('/platform')`; `invalid` → clear cookie, fall through to normal resolution. `/platform/*` routes keep operator behaviour regardless (S4). Per-request `cache` as today.
**Tests:** each branch; normal users unaffected when no cookie; invalid cookie for a normal member still yields their own membership context.
**Done when:** `pnpm --filter @cs/web exec vitest run viewer` passes.

### Task 6: Registry enforcement + direct-call paths
**Goal:** spec § Registry enforcement; close Task 0's direct service-call paths.
**Files:** `packages/core/src/tools.ts` (+ tests), audit sink (`role='platform_support'`, `support_session_id`, `user_id=platformUserId`), each page/action from Task 0's inventory.
**Behaviour:** in `invoke`, `list`, `describe` with `ctx.support`: non-web → `permission_denied`; `access==='write'` → `read_only_session` with spec message; tools whose name starts with `ask_` → hidden (`not_found`); output → `maskSupportFields`. Direct service reads in pages (e.g. team, branding) apply `maskEmail` when `ctx.support`; direct service writes (server actions) check `ctx.support` first and throw `read_only_session`. Side-effect reads (Review focus 3: e.g. mark-seen, `unreadCount` updates) skip writes when `ctx.support`.
**Tests:** write refused for a sample of each write category; Ask hidden; channel refusal; masking applied/not applied; audit row fields; each inventoried direct path (one test each).
**Done when:** `pnpm test:affected` green.

### Task 7: Support tools + email
**Goal:** spec § Tools + § Email.
**Files:** `packages/tools/src/tools/support.ts` (+ test), `all.ts`; `packages/email/src/templates/support-session-started.tsx` (+ test) with delivery wiring (follow `agency-notice.tsx`).
**Interfaces:** `start_support_session({ agencyId: uuid, reason: string(5..300, trimmed) })` → `{ sessionId, expiresAt }`; `end_support_session()`; `list_support_sessions({ cursor?, limit? ≤ 50 })`; `set_support_access_notify({ enabled: boolean })`; `list_agency_support_sessions({ agencyId })`. Access marks: start/end/set = `write`, lists = `read`.
**Behaviour:** roles per spec; `list_support_sessions` hidden (`not_found`) inside a support context; start audits into target agency `audit_log` (`tool='start_support_session'`), adds 8a activity kind `support_session_started` (no reason), queues email only when `notify_support_access`; unknown agency → `not_found`.
**Tests:** viewer role refused start; start → audit + activity; email only when opted in; list rows shape; set toggle by agency_admin only.
**Done when:** `pnpm --filter @cs/tools exec vitest run support` and `pnpm --filter @cs/email exec vitest run support-session` pass.

### Task 8: UI
**Goal:** dialog, banner, read-only hiding, exit, agency page.
**Files:** `apps/web/src/components/read-only.tsx` (S3), `components/shell/support-banner.tsx` (+ test), `app/(app)/layout.tsx` (provider + banner), `platform/agencies/[id]/{support-dialog.tsx,actions.ts}` (start action sets cookie `rm_support`, `httpOnly`, `secure` unless localhost, `sameSite: 'lax'`, `path: '/'`, `maxAge` = seconds to expiry, then `redirect('/agency')`), `app/(app)/support/exit/route.ts` (POST: `end_support_session`, clear cookie, redirect `/platform/agencies/<id>?ended=1`), `agency/settings/platform-access/page.tsx` (+ toggle action), Ask module empty state, nav "Back to platform", toast on `?ended=1`; wrap write controls (inventory: grep server-action imports in `app/(app)/agency/**` and `app/(app)/c/**`) in `WriteGuard`.
**Behaviour/copy:** spec § UI verbatim. Banner countdown `setInterval` 30 s, client-only; at 0 shows "Session ended — reload" and links to exit. "View as agency" hidden for viewer role.
**Tests:** banner renders reason, minutes, Exit; `WriteGuard` hides children when read-only; dialog requires 5+ chars; platform-access page lists sessions and toggle.
**Done when:** `pnpm --filter @cs/web exec vitest run support read-only platform-access` passes; typecheck clean.

### Task 9: Demo, coverage, E2E
**Goal:** E2E `@support` per spec § Testing; coverage registration.
**Files:** `apps/web/e2e/support.spec.ts`, `e2e/seed.ts` (platform staff + viewer users via `platform_admin` rows), `packages/demo/src/coverage.ts` (`/agency/settings/platform-access`), demo seed: two past sessions for the demo agency.
**Behaviour:** staff starts a session with a reason → `/agency` portfolio and one `/c/<id>` page render, banner visible, no write buttons; forcing a write via a direct server-action POST → refusal copy; Exit → console toast; agency admin sees the session under Platform access; viewer-role admin has no "View as agency"; tampered cookie ignored.
**Done when:** `pnpm --filter @cs/web e2e:affected` and `pnpm --filter @cs/demo exec vitest run coverage` pass.
