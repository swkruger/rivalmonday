# Phase 15c-2a — Platform, agency and account page fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Lean plan format (root `CLAUDE.md`): interfaces and behaviour are binding; implementers write the code. Steps use `- [ ]`.

**Goal:** Every platform, agency and account/public page uses the 15c-1 pieces (chips + labels, `lib/format`, `ConfirmDialog`, `SaveBar`, in-page `Suspense` + `PageSkeleton`, labelled controls), grep gates keep it that way, and the 2a features ship: agencies search, leads/reviews paging, billing tabs, alert-queue client filter + cap notice, webhook delete + test, invite resend + `team_invite` email, sign-up/sign-in email resend, intake preview.
**Architecture:** New reads/writes are registered `@cs/tools` tools (web via `callTool`/`runTool`); pages are swept area by area, each area task adding its folders to the gate list (ratchet). One small migration (sign-up resend counter). Sends that have no client (team invite) go direct, like lead mail (11c R1).
**Spec:** `docs/superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md` (D1–D8, §4–§6, §8 for 2a). Parent: `docs/superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md` §2 (C1–C11), §3, §4. Brief: `docs/work/phase-15c2.md` §1–§4. Findings: `docs/research/2026-10-18-phase-15-ux-audit.md` §2.1, §2.2, §2.5; `git show 9ddfae3c:docs/work/phase-15c.md` §1.

## Global constraints
- Brand tokens only (`packages/ui/src/styles.css`); no new hex in components. Max width 1560px.
- Dates: "Oct 21" in the current year, "Oct 21, 2025" otherwise; no ISO dates/weeks in UI. Agency/platform/account pages use `await viewerTimeZone()`; a time shows a zone label; date-only (`date` column) values use `tz: 'UTC'`.
- Miles in UI, km stored; tool descriptions state the unit.
- Web reads = registered tools (`callTool`); writes = `runTool`; refusals → 404, never 403. Every new write control sits in `WriteGuard`/`useReadOnly()`.
- Every irreversible or billing action → `ConfirmDialog` (`@cs/ui`). Status → `StatusChip` + `labelFor(<MAP>, v)` from `@/lib/labels`.
- Every sweep task applies the spec §4.1 checklist to each file it owns (labels + `aria-describedby`, no tip inside `CardTitle` — move it beside the title, empty-state copy, `SaveBar` on multi-field settings forms), not only the bullets listed.
- No route-level `loading.tsx`; slow sections use `<Suspense fallback={<PageSkeleton/>}>` after access checks.
- Every `PageHeader` page has a help key + guide; client roles never get agency/operator help. Nothing client-facing or on a white-label surface names Rival Monday.
- Action results that must survive `revalidatePath` are hoisted to an always-mounted component (`apps/web/CLAUDE.md` UI patterns).
- All new/changed user-facing copy goes into `docs/archive/phase-15c2-copy-signoff.md` § "15c-2a" (owner signs off).
- New tools: `access` mark, `access-marks.test.ts` snapshot, a row in `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; any output key matching `/email/i` in `supportMask`; web-only (no `channels`).
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of `apps/web`, `packages/{tools,engine,db,ui,email,core}` first. Focused tests: `pnpm --filter <pkg> exec vitest run <pattern>` (engine: `npx vitest run <pattern>` from the package dir); reviewers: `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected`.
- LF only; never stage `.env`, `.claude/`, `App/`, `.superpowers/`; commits end with the Co-Authored-By line from root `CLAUDE.md`.

## Decisions
Spec D1–D8 bind (2a uses D1, D2, D4–D7). 15c spec C3, C4, C7, C8, C9 (n/a), C10. Builder calls made while planning (marked **[B]**; owner may overrule at approval):
- **B1 `team_invite` is sent directly, not via the outbox.** `notification.client_id` is `NOT NULL` and `notification_recipient_check` needs a contact or webhook; an agency invitee has neither. Precedent: 11c R1 (lead mail). The tool sends after commit through `deps.leadEmail`'s transport/`appUrl`/`fromAddress` (the one direct-send config `ToolDeps` has; no new dep, no new `NotificationKind`). A failed send never undoes the invitation; the action says so (copy below). Client roles keep `client_invite` via `notify` (spec §6).
- **B2 Counting by audit rows** (resend 3/24 h, webhook test 5/10 min): `audit_log` has no target column, so count rows with `agency_id = ctx.agencyId AND tool = <name> AND input_hash = hashInput(<exact parsed input>) AND outcome = 'ok' AND created_at > now() − window`. `hashInput` (`@cs/core/server`) is deterministic over the parsed input, so `{ invitationId }` / `{ webhookId }` match.
- **B3 Invite "Sent {date}" = `expiresAt − INVITATION_TTL_DAYS`** (create and resend both set `expires_at = now + TTL`); no new column.
- **B4 Sign-up resend counter = public table `email_resend`** (service-role only), not `auth.email_resend`: Better Auth's `rateLimit.customRules` are keyed by IP + path, not by address, and schema `auth` is Better Auth's (drift test `auth-schema.test.ts`). It stores `sha256(lower(email))`, never the address. T0 re-confirms; if a per-key Better Auth hook exists, T14 drops the migration.
- **B5 `rm_pending_email` payload** `{ e: email, f: 'signin' | 'signup', n: next, iat }`. Sign-in requests its link client-side (`authClient.signIn.magicLink`), so the form calls a server action `rememberPendingEmail` after a successful request; sign-up sets it inside `startSignup` on every non-Google path (refused too, like `rm_signup`). The resend action re-sends via `auth().api.signInMagicLink` with the same callbacks; `sendMagicLink`'s `hasSignInRight` check keeps unknown addresses silent.
- **B6 Paging extras:** `prevCursorOf(offset, limit)` helper; agencies, leads and reviews outputs gain `prevCursor`; leads and reviews gain `total` (the card titles show a count).
- **B7 `list_alert_queue` output gains `clients: { id, name, count }[]`** (every client with queue rows, under RLS) so the select is complete when the list is capped.
- **B8 Readable text on agency primary:** `@cs/ui` `readableTextOn(hex)` = `#FFFFFF` when white's WCAG contrast on `hex` ≥ 2.6 (keeps the decided default #47A8E7 white at 2.62), else ink `#0B2540`. `themeVars` sets `--color-primary-foreground`; `buttonHtml` uses it.
- **B9 Webhook test copy/transport:** engine gets `postWebhook(kind, url, msg, { fetch?, timeoutMs })` shared by the sender (10 s, unchanged) and the test (5 s). Message title "Test message from {agency display name}", body "Briefs and alerts from {agency display name} will appear in this channel.", no link. A 3xx → `{ ok: false, status, error: 'http' }`.
- **B10 Usage page:** the "inline forms → dialog" item is dropped — phase-7b1 deletes `limits-form.tsx`/`actions.ts` (platform-owned limits). Only the zero-client empty state stays (T9), placed on whichever page version is on the branch after rebase.
- **B11 Alert dismiss** = `ConfirmDialog` (tone danger) with the reason `<textarea>` in `body` (rendered inside its form); the refusal line lives in `AlertList`, cleared on close (fixes 5b-1 "refusal text persists").
- **B12 Privacy link:** no privacy page exists. `/start` (platform kind) and `/sign-up` link to `https://rivalmonday.app/privacy` (owner confirms the URL before launch — sign-off item); agency intake pages show none (no agency privacy URL in branding → BACKLOG).
- **B13 Guide path** is flat like every other guide: `docs/help/pages/agency.settings.intake.preview.agency.md` (spec §6 said `docs/help/pages/agency/`).
- **B14 Labels:** `MEMBERSHIP_ROLE.agency_admin` → "Agency admin"; new maps `AGENCY_NOTICE_KIND` (from `AGENCY_KINDS`), `HEALTH_STATUS`, `AGENCY_HEALTH`, `TOPIC_PROPOSAL_STATUS` (T16), `INVOICE_STATUS` — added by the task that first needs each.
- **B15 Ask operator JSON** (`action`, `trace`) moves into `<details><summary>Technical details</summary>`; roles/status render as labels + chips.
- **B16 Gates ratchet:** gates run over `GATED_PATHS`; each area task appends its folders; T17 asserts the full 2a list (T2).
- **B17 Decision reviews show no client/agency**: they are on global competitor changes; cards show competitor, `sourceLabel(source)`, change-type label, `formatRelative` age.

## File structure
- **tools:** modify `packages/tools/src/{paging.ts,settings.ts,access/team.ts,index.ts}`, `packages/tools/src/tools/{platform-console,platform-leads,model-ops,alert-queue,settings,agency-settings-reads,schemas}.ts`, `access-marks.test.ts`; create `packages/tools/src/access/team-invite-email.ts` (+ test).
- **engine:** `packages/engine/src/delivery/webhooks.ts` (+ test), `packages/engine/src/model-ops/resolve.ts` (`listOpenReviews` offset).
- **email:** create `packages/email/src/templates/team-invite.tsx` (+ `team-invite.test.ts`); modify `types.ts`, `render.ts`, `index.ts`.
- **db:** `packages/db/src/schema/access.ts` (`emailResend`), migration `<next>_email_resend.sql` (+ `--custom` RLS migration), `packages/db/src/access.test.ts`.
- **ui:** `packages/ui/src/theme.ts` (+ test), `packages/ui/src/components/status-chip.test.tsx`.
- **core:** `packages/core/src/geo.ts` or the existing distance/geo module (`KM_PER_MILE`), `packages/core/src/index.ts`.
- **web lib:** `apps/web/src/lib/{labels.ts,page-gates.ts,page-gates.test.ts}`, `lib/format/{date,distance}.ts`; `components/shell/tz-cookie.tsx`; `server/{tools,env,pending-email}.ts` (+ tests).
- **web pages:** every file under `app/(platform)/platform/**`, `app/(app)/agency/**`, `app/(app)/{inbox,settings,onboarding,kb,paused}/**`, `app/{sign-up,sign-in,start,join,link-expired,link-other-account,no-access,u,oauth,onboarding}/**`; components `components/{agency,runbook,kb,billing}/**`, `components/{ai-connections,support-sessions-table}.tsx`, `components/shell/**`. New route `app/(app)/agency/settings/intake/preview/page.tsx`.
- **help:** `apps/web/src/help/copy/{agency,platform,account}.ts`, `help/reach.ts` if listed; `docs/help/pages/agency.settings.intake.preview.agency.md`.
- **e2e:** `apps/web/e2e/agency-settings.spec.ts` (new), `e2e/intake.spec.ts`, `scripts/e2e-affected-rules.ts`; `turbo.json` (`WEBHOOK_FAKE_SEND`).
- **docs:** `docs/archive/phase-15c2-copy-signoff.md` (§ 15c-2a), `docs/work/phase-15c2.md`.

## Dependencies on in-flight work (re-check in T0)
- **phase-7b1** (executing; claims migrations 0085–0087): rewrites `agency/settings/usage/*` (deletes `limits-form.tsx`, `actions.ts`), `agency/page.tsx`, `platform/{health,costs,agencies/[id]}/*`, `(platform)/layout.tsx`, `lib/format/money.ts` (`formatCredits`), `components/spend-badge.tsx`, `components/shell/{app-shell,nav-items}`, `help/copy/*`, `e2e-affected-rules.ts`. Second to merge rebases; T8/T9/T6 re-read those files after any rebase. Its note "15c2's cap notice must use `SpendLevel`" does not apply: our notice is the 200-row alert-queue cap, not a spend cap.
- **phase-15b3b** (planning): renames `/platform/themes` → `/platform/topics`, `theme-queue.tsx`, help key `page:platform.themes`. T16 is last; if 15b-3b merged, rebase first and edit the renamed files.
- **phase-15c3** (unstarted): reuses `resendInvitation(ctx, deps, invitationId, now)` (T11) and our `ConfirmDialog` adoption on `/platform/agencies/[id]`; owns the "coming soon" line. Don't touch `billingAccess`/`agencyServiceable`.
- **13a** (unbuilt): `/start*`, `start/landing.tsx` `IntakeLanding` (we add `preview`), error pages. Second to merge rebases.
- **phase-15c2 part 2b** (same branch, later): owns `c/[clientId]/**` and the remaining components; its last task runs the gates over all of `src`. Its Ask migration takes the number after ours.
- **Migrations:** next free number at execution time (7b1 holds 0085–0087 on its branch); 2a adds one only if T0 keeps B4.

## Review focus
1. **Abuse of the resend/test endpoints:** a 4th invite resend in 24 h, a 6th webhook test in 10 min, a 6th sign-up resend in an hour (with mixed-case addresses) are refused with the decided copy, and refused calls don't count toward the window. Tests: T11 `resend refuses the 4th within 24h and ignores refused rows`, T10 `test_webhook rate-limits the 6th`, T14 `counts per lower-cased address`.
2. **Account enumeration:** sign-up/sign-in resend shows the same copy, status and cookie for an unknown address as for a real one; a tampered/expired `rm_pending_email` never reaches `signInMagicLink`. Tests: T14 `tampered cookie is refused`, `expired cookie is refused`, `unknown address gets the same result`.
3. **Webhook test can't be turned into a request forge:** a URL that fails `webhookUrlProblem` (incl. one changed in the DB to `http://` or another host), a 3xx redirect, and a slow endpoint all return the right `error` without following anything. Tests: T10 `blocked URL never fetches`, `redirect is a failure`, `5 s timeout`.
4. **White-label leaks in new surfaces:** `team_invite` for a white-label agency and the intake preview never say "Rival Monday"; the preview disables lookup/submit and renders no Turnstile. Tests: T11 `team_invite email has no Rival Monday for a branded agency`, T12 `preview disables submit and renders no Turnstile`, plus `white-label-leak.test.tsx` row.
5. **Zone and paging edges:** a first visit without `rm_tz` renders "UTC"-labelled times and never refreshes; `formatRelative` beyond 30 days uses the passed zone; Previous from page 2 returns to the first page and keeps `?q=`/`?sort=`. Tests: T1 `TzCookie never calls router.refresh`, `formatRelative >30 days uses tz`; T3 `prev link keeps q and sort`.

---

### Task 0: Pre-flight
- [ ] `git fetch`; `git rebase main` in the worktree; `pnpm install` (background); create/point test DB `cs_phase_15c2_test` (local cluster, `bash scripts/local-test-db.sh env`), `E2E_PORT` unique; run `pnpm --filter @cs/worker exec vitest run src/boss.test.ts` once.
- [ ] Re-check Dependencies: `git branch --no-merged main`; `git diff --stat main...phase-7b1` and `main...phase-15b3b`; did either merge? If 7b1 merged: re-read the usage page, health, agencies/[id], portfolio before T6/T8/T9.
- [ ] Conflict-scan: every path in this plan exists (`git ls-files` per Files line); `rg -n "list_platform_agencies|list_pool_leads|list_decision_reviews|list_alert_queue" apps/web/src` call sites; `rg -c "<Badge" apps/web/src/app/(platform) apps/web/src/app/(app)/agency`.
- [ ] Confirm Better Auth rate-limit storage: `rateLimit: { storage: 'database', window: 60, max: 100 }` in `server/auth-options.ts`; check the installed `better-auth` `customRules` key type (IP+path only?) → keep or drop B4 / T14 migration.
- [ ] Confirm the outbox kind enumeration: `CLIENT_KINDS`/`AGENCY_KINDS` (`packages/db/src/schema/delivery.ts`) and the absence of a kind CHECK on `notification.kind` → B1 needs no kind (direct send). Confirm `notification.client_id NOT NULL`.
- [ ] Record findings under this task; commit `docs(phase-15c2): 15c-2a pre-flight`.

### Task 1: Cross-cutting backlog
**Goal:** Spec §4.2 last bullet group + D6.
**Files:** modify `packages/core/src/index.ts` + the module holding geo/units (create `packages/core/src/units.ts` if none fits; + `units.test.ts`), `packages/ui/src/theme.ts` (+ `theme.test.ts`), `packages/ui/src/index.ts`, `apps/web/src/lib/format/{distance,date}.ts` (+ tests), `packages/tools/src/intake/preview.ts`, `packages/ui/src/components/status-chip.test.tsx`, `apps/web/src/components/charts/line-chart.test.tsx`, `apps/web/src/components/page-skeleton.test.tsx`, `apps/web/src/dev-panel/spawn-lines.test.ts` (only if its `process.cwd()` is a scan root), `apps/web/src/components/shell/tz-cookie.tsx` (+ test); call sites with `{ unit: 'cents', cents: true }`: `agency/settings/billing/page.tsx`, `platform/agencies/[id]/billing-panel.tsx`, `platform/billing/{page,codes,connect-panel,plan-editor}.tsx`, `c/[clientId]/settings/billing/page.tsx` (one-line exception to D1's split: cross-cutting).
**Interfaces:**
```ts
// @cs/core
export const KM_PER_MILE = 1.609344;
// apps/web/src/lib/format/date.ts
export function formatRelative(v: string | Date, now?: Date, o?: { tz?: string }): string; // > 30 days → formatDate(v, { tz: o?.tz ?? 'UTC', now })
// packages/ui/src/theme.ts (B8; used by T9 branding and T12)
export function contrastRatio(a: string, b: string): number;                // WCAG 2.x, hex in
export function readableTextOn(bg: string): '#FFFFFF' | '#0B2540';          // white if contrastRatio('#FFFFFF', bg) >= 2.6, else ink
// themeVars(...) += '--color-primary-foreground': readableTextOn(primary)
```
**Behaviour:**
- `lib/format/distance.ts` re-exports `KM_PER_MILE` from `@cs/core`; `tools/intake/preview.ts` imports it (delete the local const).
- Cents billing: drop `cents: true` where `unit: 'cents'` shows a price/invoice/MRR, so "$299" (cents only when non-zero). Spend/cost (`usd` unit) callers keep `cents: true`.
- Chip sync test: parse `packages/ui/src/styles.css` (path via `__dirname`) for `--chip-<tone>-{bg,text}` and assert each equals `CHIP_COLOURS[tone]` (case-insensitive).
- Scan-root tests use `join(__dirname, …)`, never `process.cwd()`.
- D6: `TzCookie` writes the cookie only; no `useRouter`, no refresh. Times rendered with `viewerTimeZone()` = 'UTC' then show the "UTC" label (already `formatDateTime` `zoneLabel`).
- Every client-page caller of `formatRelative` already passing a zone keeps working (third arg optional); 2a callers pass `{ tz }`.
**Tests (TDD):** `KM_PER_MILE is 1.609344` (core); `formatRelative beyond 30 days uses the zone: 2026-08-01T03:00Z in America/Chicago is Jul 31`; `formatRelative without tz still UTC`; `chip CSS tokens equal CHIP_COLOURS`; `TzCookie writes rm_tz and never calls router.refresh` (mock `next/navigation`, assert not imported/called); `billing amounts render $299 not $299.00` (one page test, e.g. `plan-editor`); `readableTextOn keeps white on #47A8E7`; `readableTextOn picks ink on #F5D90A`; `themeVars sets --color-primary-foreground`.
**Done when:** `pnpm --filter @cs/core exec vitest run units`, `pnpm --filter @cs/ui exec vitest run status-chip theme`, `pnpm --filter @cs/web exec vitest run format tz-cookie line-chart page-skeleton plan-editor`, `pnpm --filter @cs/tools exec vitest run intake/preview`, `pnpm typecheck`.

### Task 2: Grep gates (ratchet)
**Goal:** Spec §5 gates 1–4 with planted-violation fixtures, enforced per path list that area tasks extend.
**Files:** create `apps/web/src/lib/page-gates.ts`, `apps/web/src/lib/page-gates.test.ts`.
**Interfaces:**
```ts
export interface GateHit { file: string; line: number; gate: 'badge' | 'date' | 'enum' | 'km'; text: string }
export function scanSource(file: string, src: string): GateHit[];          // pure: gates 1-3 (+4 on JSX text)
export function scanHelpText(file: string, src: string): GateHit[];        // gate 4 for help/copy/*.ts and docs/help/pages/*.md
export const BADGE_ALLOW: Record<string, string>;                          // relative path → reason (non-status Badge use)
export const ENUM_FIELDS: readonly string[];                               // ['status','billingState','state','toState','fromState','kind','role','health','source','channel']
export const AREAS_2A: readonly string[];                                  // every 2a folder (File structure "web pages" + components list), relative to apps/web/src
export const GATED_PATHS: string[];                                        // starts [] ; each area task appends its folders
```
**Behaviour:**
- Root = `join(__dirname, '..')` (`apps/web/src`); scan `*.ts`/`*.tsx` under each `GATED_PATHS` entry, skipping `*.test.*` and `lib/format/**`.
- Gate 1: a line with `<Badge` in a file not in `BADGE_ALLOW`.
- Gate 2: `.slice(0, 10)`/`.slice(0,10)`, `toLocaleDateString(`, `toLocaleTimeString(`, `toLocaleString(`, `toISOString()` in a `.tsx` file.
- Gate 3: JSX text child `{<expr>.<field>}` where `<field>` ∈ `ENUM_FIELDS` (regex `\{\s*[\w.?!\[\]]*\.(${fields})\s*\}` not preceded by `=`, i.e. not an attribute value).
- Gate 4: `\bkm\b` (case-insensitive) in JSX text or string literals of `.tsx` files, and anywhere in help copy / guides (these are enforced from T2: already clean).
- Escape: `format-gate: <reason>` on the same or previous line (`// …` or `{/* … */}`); empty reason doesn't count.
- The enforced test prints `file:line gate text` for every hit and fails on any; a second, always-passing `report` test logs hit counts for `AREAS_2A` paths not yet in `GATED_PATHS` (progress view for the implementer).
- Area tasks append their folders to `GATED_PATHS` and fix every hit in them (no blanket escapes; each escape names its reason).
**Tests (TDD):** fixtures are in-memory strings: `badge gate flags <Badge in a page`, `badge allow-list passes a listed file`, `date gate flags .slice(0, 10) and toLocaleDateString`, `date gate respects format-gate escape with reason`, `escape without reason still flags`, `enum gate flags {row.status} but not status={row.status}`, `km gate flags "within 5 km" text but not radiusKm identifiers`, `help km gate scans copy and guides`, `gated paths are clean`, `AREAS_2A ⊆ existing folders`.
**Done when:** `pnpm --filter @cs/web exec vitest run page-gates` green.

### Task 3: Agencies search + paging
**Goal:** `list_platform_agencies.query` and the agencies page search + Previous/Next (spec §6).
**Files:** modify `packages/tools/src/paging.ts` (+ `paging.test.ts`), `packages/tools/src/tools/platform-console.ts` (+ test), `app/(platform)/platform/agencies/{page,agency-table}.tsx` (+ tests), `apps/web/src/help/copy/platform.ts` (search label/empty copy).
**Interfaces:**
```ts
export function prevCursorOf(offset: number, limit: number): string | null;   // offset 0 → null, else encodeCursor(max(0, offset − limit))
// list_platform_agencies input += query: z.string().max(100).optional(); output += prevCursor: z.string().nullable()
export async function liveAgencies(deps, now, agencyId?: string, o?: { nameLike?: string }): Promise<LiveAgency[]>;
```
**Behaviour:**
- `query` trimmed; length < 2 → ignored (not refused). Else `a.name ILIKE '%' || $q || '%' ESCAPE '\'` with `\`, `%`, `_` escaped in JS first; applied in `liveAgencies` SQL.
- Page: GET form (`<form role="search">`, `<label for="agency-q">Search agencies</label>`), `?q=`, `?sort=`, `?dir=`, `?cursor=`; drop `limit: 100` (web default page size `LIST_WEB_DEFAULT`); `PrevNext` with hrefs built by one helper that keeps `q`/`sort`/`dir`. Empty result with a query → "No agencies match “{q}”." (sign-off).
- `agency-table.tsx`: `formatDate`/`formatRelative` with viewer tz (backlog line 44), `StatusChip` + `BILLING_STATE`, health via new `AGENCY_HEALTH` map (B14); sortable headers get `aria-sort` and a visible sort arrow.
- Append `app/(platform)/platform/agencies` (excluding `[id]`, done in T6) to `GATED_PATHS`.
- Follow pattern: `paging.ts` `pageResult`; search form = any existing GET filter (`agency/leads/page.tsx` tabs) for param handling.
**Tests (TDD):** `query under 2 chars is ignored`; `query escapes % and _ (name "50%_off" matches "%_", "Acme" does not)`; `query matches case-insensitively`; `prevCursorOf(0)=null, prevCursorOf(50,50)=cursor(0)`; page test `prev link keeps q and sort`; `no results copy shows the query`.
**Done when:** `pnpm --filter @cs/tools exec vitest run paging platform-console`, `pnpm --filter @cs/web exec vitest run agencies page-gates`.

### Task 4: Leads + reviews paging and page fixes
**Goal:** Cursor paging (25, max 100) on `list_pool_leads` and `list_decision_reviews`; their pages swept.
**Files:** modify `packages/tools/src/tools/{platform-leads,model-ops}.ts` (+ tests, `paged-lists.test.ts`), `packages/engine/src/model-ops/resolve.ts` (+ test), `app/(platform)/platform/leads/{page,assign-form}.tsx`, `app/(platform)/platform/reviews/{page,review-queue}.tsx` (+ tests), `help/copy/platform.ts`.
**Interfaces:**
```ts
// both inputs: z.object({ cursor: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() })   // web default 25
// list_pool_leads output += nextCursor, prevCursor: string|null, total: number   (agencies + recentAssignments unchanged, not paged)
// list_decision_reviews output = { items, nextCursor, prevCursor, total }
export async function listOpenReviews(db: Db, limit = 50, offset = 0): Promise<OpenReview[]>;   // + countOpenReviews(db): Promise<number> using openReviewsWhere
```
**Behaviour:**
- `pageOf(input, meta, 25)`, fetch `limit + 1`, `pageResult`; `total` via `count()` with the same WHERE (`openReviewsWhere` for reviews — nav badge parity). Order stays (leads newest first + id tie-break; reviews oldest first + id).
- Skipped review items (F8 `continue`) don't shift paging: offset is over DB rows; a page may show fewer than 25.
- Leads page: title "Pool ({total})"; "Verified" column shows `verifiedAt` or "—" (no silent fallback to created); assign select shows vertical names (`verticalOptions`/catalog label), not slugs; success line after assign, hoisted (survives revalidate); dates `formatDate` viewer tz. Reviews: `StatusChip`-free card header with competitor, `sourceLabel`, change-type label (`changeTypeOptions`), age (`formatRelative`, tz); count in heading; `PrevNext` with `?cursor=`.
- Append `app/(platform)/platform/{leads,reviews}` to `GATED_PATHS`.
**Tests (TDD):** `pool leads page 2 starts after 25 and prevCursor returns to 0`; `limit over 100 refused`; `total counts all verified unassigned leads`; `decision reviews page by offset, total = open count`; `listOpenReviews offset skips rows`; page tests `verified column shows — when not verified`, `assign success message survives revalidate`.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-leads model-ops paged-lists`, engine `npx vitest run model-ops`, `pnpm --filter @cs/web exec vitest run platform/leads platform/reviews page-gates`.

### Task 5: `/platform/billing` tabs + confirms + dates
**Goal:** Tabs Overview · Plans · Discount codes · Sign-up & invites · Stripe Connect via `TabsLink` `?tab=` (spec §6); confirms; ISO dates gone.
**Files:** modify `app/(platform)/platform/billing/{page,plan-editor,codes,invite-links,signups-panel,connect-panel}.tsx` (+ tests), `app/(platform)/platform/costs/_components/cost-items-table.tsx` (backlog: dates only), `help/copy/platform.ts`, `docs/help/pages/platform.billing.operator.md` (tab names).
**Interfaces:**
```ts
const TABS = ['overview', 'plans', 'codes', 'signups', 'connect'] as const;   // labels: Overview, Plans, Discount codes, Sign-up & invites, Stripe Connect
export function billingTab(raw: string | string[] | undefined): (typeof TABS)[number];   // unknown → 'overview'
```
**Behaviour:**
- `TabsLinkList`/`TabsLink` (existing segmented look, no restyle); hrefs keep `days` for the sign-up funnel. Fetch only the active tab's tools (overview = `get_billing_overview` + StatCards + agencies-by-state chips).
- Sign-up & invites = `SignupsPanel` + `InviteLinks` (invite links still gated by `canInvite`).
- `ConfirmDialog` on: Pause/Resume sign-ups, Publish plan version, Revoke discount code, Revoke invite link, Connect actions that change Stripe state. Titles/bodies in the sign-off doc (e.g. "Pause new sign-ups?" / "New agencies can't sign up until you resume. Invite links still work." — confirm the invite-link claim in `signups-panel` before writing it).
- Dates: `plan-editor` `createdAt.slice(0,10)` → `formatDate(viewer tz)`; codes/invite links expiry/created → `formatDate`; `cost-items-table` `startsOn`/`endsOn` (date-only) → `formatDate(…, { tz: 'UTC' })`, "ongoing" stays.
- The agency-UUID comma list (audit M 15b) is not changed (no new data).
- Append `app/(platform)/platform/billing` and the costs file's folder only if clean (costs stays Polish otherwise; T6 appends costs).
**Tests (TDD):** `unknown tab falls back to overview`; `each tab renders only its section` (mock callTool, assert calls); `tab links keep days`; `publish plan needs a confirm` (click → dialog → action called once); `plan created date is not ISO`; `cost item dates render "Oct 1 → ongoing"`.
**Done when:** `pnpm --filter @cs/web exec vitest run platform/billing cost-items page-gates`.

### Task 6: Other platform pages sweep
**Goal:** §4.1 on every remaining platform page.
**Files:** `app/(platform)/platform/{page.tsx,_components/*,agencies/[id]/*,ask/page.tsx,ask/[threadId]/page.tsx,health/page.tsx,health/_components/health-tables.tsx,verticals/*,runbook/*,help/page.tsx,knowledge/**,costs/**}`, `components/support-sessions-table.tsx`, `components/runbook/*` (shared with T9 agency runbook: do it here), `lib/labels.ts` (+ test).
**Behaviour:**
- Overview: chart axes use `formatWeekOf`/month labels (no ISO week, no "2026-10"); `RangeToggle` sits on the charts card, not by the h1; `activity-feed` times `formatDateTime(viewer tz, zoneLabel)`.
- Agency detail: billing-panel ISO dates (`created.slice`, `events.createdAt.slice`) → `formatDate`; raw `fromState → toState · reason` → `labelFor(BILLING_STATE)` chips + reason label map (sentence case fallback); invoice status chip (`INVOICE_STATUS`); `ConfirmDialog` on pilot, cap and discount actions (`billing-actions.ts` forms). Leave the "coming soon" line (15c-3). Support dialog untouched (15b).
- `billing-state-pill.tsx`, `health-pill.tsx`: replace with `StatusChip` + maps (delete the files if unused after).
- Ask list: flag chips → `StatusChip` (removed: warning, error: danger, refused: warning, quota: info) with labels; times `formatRelative`/`formatDateTime`. Thread: role/status via `labelFor(ASK_MESSAGE_STATUS)` + role label ("You"/assistant name/"Tool"); timestamps per message; JSON in `<details>` (B15).
- Health: local hex `STATUS` → `StatusChip` + `HEALTH_STATUS` (`ok` success "Working", `warn` warning "Slow", `down` danger "Down" — confirm values against `platform-health.ts` output).
- Verticals, runbook, knowledge, costs, help: only what the gates and §4.1 require (chips, dates, confirms on irreversible approve/merge/reset, labels); knowledge 6c/costs 8c items stay Polish.
- `support-sessions-table.tsx`: `formatDateTime(tz, zoneLabel)`.
- Runbook item cards: trigger via `changeTypeOptions()` label (not `trigger.replace`); Reset / Off → `ConfirmDialog`; `<Badge>` → `StatusChip` or allow-list with reason.
- Append `app/(platform)/platform` (everything except `themes`) to `GATED_PATHS`; append `components/runbook`, `components/support-sessions-table.tsx`.
**Tests (TDD):** `labels: every HEALTH_STATUS / INVOICE_STATUS value labelled`; `agency detail billing events show labels not raw enums`; `pilot action requires confirm`; `ask thread shows message time and hides JSON until expanded`; `health table uses StatusChip (no hex class)`; `runbook trigger shows "Price change" for price_change`.
**Done when:** `pnpm --filter @cs/web exec vitest run platform labels runbook page-gates`.

### Task 7: Alert queue client filter + cap notice
**Goal:** `list_alert_queue { clientId? }` + `capped` + B7; page select, notice, age; dismiss via `ConfirmDialog` (B11).
**Files:** modify `packages/tools/src/tools/alert-queue.ts` (+ test), `packages/tools/src/tools/schemas.ts`, `app/(app)/agency/alerts/{page,alert-controls,actions}.tsx|ts` (+ tests), `help/copy/agency.ts`.
**Interfaces:**
```ts
input: z.object({ clientId: z.string().uuid().optional() })
output: z.object({ items: z.array(AlertQueueRow), capped: z.boolean(), clients: z.array(z.object({ id: uuid, name: z.string(), count: z.number().int() })) })
export const ALERT_QUEUE_CAP = 200;
```
**Behaviour:**
- Fetch `ALERT_QUEUE_CAP + 1` rows; `capped = rows.length > 200`; return 200. `clientId` adds `eq(alert.clientId, clientId)` (RLS still scopes; an invisible id → empty list, not an error). `clients` = group-by over `alertQueueWhere()` under the same tenant tx, name-sorted.
- Page: GET `<select name="client">` labelled "Client" ("All clients" default), auto-submit button "Show"; notice "Showing the oldest 200 — filter by client to see more" (spec copy) when `capped`; each row shows age "Waiting 3 days" (`formatRelative`) and expiry hint (alerts expire after 7 days) — copy for sign-off; status `StatusChip` + `ALERT_STATUS`; `assistantName` from branding instead of hard-coded "Friday".
- Dismiss: `ConfirmDialog` tone danger, title "Dismiss this alert?", body "Nothing is sent to the client." + labelled reason textarea (required, ≤ 500), confirm "Dismiss"; refusal line in `AlertList`, cleared when the dialog closes.
- Badge count (`countAlertsAwaitingReview`) unchanged.
- Append `app/(app)/agency/alerts` to `GATED_PATHS`.
**Tests (TDD):** `capped is true with 201 queued alerts and items has 200`; `clientId filters`; `clients lists every client with queue rows even when capped`; `invisible clientId returns empty`; page `shows cap notice only when capped`; `select keeps the chosen client`; `dismiss needs a reason and a confirm`; `refusal text clears on reopen`.
**Done when:** `pnpm --filter @cs/tools exec vitest run alert-queue nav-counts`, `pnpm --filter @cs/web exec vitest run agency/alerts page-gates`.

### Task 8: Agency pages sweep (part 1: Portfolio, Approvals, Prospects, Leads, clients/new)
**Goal:** §4.1 on the agency work pages.
**Files:** `app/(app)/agency/{page.tsx,approvals/**,prospects/**,leads/**,clients/new/**,help/page.tsx}`, `components/billing/client-billing-controls.tsx` (+ test), `components/agency/onboarding-checklist.tsx`, `components/{pressure-badge,setup-badge,spend-badge}.tsx` only if gates hit.
**Behaviour:**
- Portfolio: KPI tiles → `StatCard` (h1 → h2 order; linked tiles look clickable: hover + arrow); "Approve week of {ISO}" → `formatWeekOf(deliveryDate, { tz: 'UTC' })` (date-only); billing Pause/Resume in `ClientBillingControls` behind `ConfirmDialog` ("Pause billing for {client}?" … sign-off) — this also covers the client profile page that shares it.
- Approvals list: `Badge variant="secondary"` statuses → `StatusChip` + a `BRIEF_STATUS` map (add to labels: generating info, ready warning "Ready for review", approved success, sent success, failed danger); "Week of" column → `formatWeekOf`; empty copy distinguishes "nothing waiting" from "nothing this week" (use existing `COPY.empty` keys or add); last `<TableHead>` gets `<span className="sr-only">Actions</span>`; assistant name from branding.
- Approval detail: title "week of …" → `formatWeekOf`; "Mon 07:00" → the client's zone ("Monday 7:00 AM CT", via `formatDateTime` of the next send instant in `client.timezone`, or the plain words with zone label); rating buttons `aria-pressed`; confidence border also has a text cue (if 15b didn't add one).
- Prospects: raw lowercase status → `StatusChip` + `CLIENT_STATUS`/`REPORT_STATUS`. Leads: `lead-card` `toLocale*` → `formatDate`/`formatRelative` viewer tz, `Badge` → `StatusChip` + `LEAD_STATUS`.
- Append `app/(app)/agency/{page.tsx,approvals,prospects,leads,clients,help}` and `components/billing/client-billing-controls.tsx`, `components/agency` to `GATED_PATHS`.
**Tests (TDD):** `portfolio approve link says "Week of Oct 12"`; `billing pause needs confirm` (`client-billing-controls.test.tsx`); `approvals statuses are chips with labels`; `last header cell has an accessible name`; `rating buttons expose aria-pressed`; `send time names the client zone`.
**Done when:** `pnpm --filter @cs/web exec vitest run agency/page portfolio approvals prospects leads client-billing-controls page-gates`.

### Task 9: Agency pages sweep (part 2: settings + onboarding)
**Goal:** §4.1 on `/agency/settings/*` (except Team/webhooks/intake features, T10–T12) and onboarding.
**Files:** `app/(app)/agency/settings/{page,layout}.tsx`, `settings/{ai,billing/**,branding/**,platform-access/**,runbook/**,usage/**}`, `components/agency/branding-editor.tsx`, `components/ai-connections.tsx` (+ test), `app/(app)/onboarding/**`, `app/onboarding/start/**`.
**Behaviour:**
- Billing: local state labels (`read_only: 'Paused'`) → `BILLING_STATE` ("Read-only"); local `Badge` variants → `StatusChip`; "includes 3 clients" vs "Seats: 2 of 3" uses one word ("clients") consistently; blank-vs-0 setup-fee rule as `aria-describedby` help text in `client-billing/defaults-form.tsx`; disconnect dialog → `ConfirmDialog` (danger); multi-field defaults form → `SaveBar`.
- Branding: hex `Input` in `ColorField` gets `id`/`htmlFor` labels; contrast line under the primary colour ("Buttons will use dark text so they stay readable." when `readableTextOn` (T1) returns ink — sign-off); "or" between URL and Upload; `SaveBar`.
- AI connections (`components/ai-connections.tsx`, shared with client page): ISO date line 28 → `formatDate(tz prop)`; caller passes the zone.
- Runbook (agency): uses `components/runbook` (done in T6); page-level confirms on reset.
- Billing guide: if `docs/help/pages/agency.settings.billing.agency.md` names a "Not available" status the page no longer shows, align guide and page (15b-2 item; the client billing guide is 2b's).
- Usage: zero-client empty state (`EmptyState` + copy) on the page version present after rebase (B10); no other changes (7b1 owns).
- Platform-access `notify-switch.tsx` and any toggle: `runTool` result checked; on failure revert (`useOptimistic`) and show `FormError` inline (5b-2).
- Onboarding: `steps/plan.tsx` passes `now` to `formatDate` (backlog), "Step n of 4" in `stepper.tsx` if absent, required fields marked (`aria-required` + "Required" text), team role default "Account manager", last button "Save and finish" (copy sign-off), plan step shows price + seat line from the plan row.
- Append the folders above to `GATED_PATHS`.
**Tests (TDD):** `billing shows Read-only, not Paused, for read_only`; `branding colour inputs are labelled`; `notify switch reverts and shows the error when runTool fails`; `usage shows the empty state with zero clients`; `plan step formatDate gets now` (fake timers, year boundary); `team step defaults to Account manager`.
**Done when:** `pnpm --filter @cs/web exec vitest run agency/settings onboarding ai-connections branding page-gates`.

### Task 10: Webhooks — delete, test, labels, inline errors
**Goal:** `delete_webhook`, `test_webhook` (spec §6, B9), kind labels, toggle errors, confirms.
**Files:** modify `packages/engine/src/delivery/webhooks.ts` (+ test), `packages/engine/src/index.ts`; `packages/tools/src/settings.ts`, `packages/tools/src/tools/settings.ts` (+ `settings.test.ts`), `packages/tools/src/deps.ts`, `access-marks.test.ts`, 8b doc; `apps/web/src/server/{tools,env}.ts` (+ `env.test.ts`), `apps/web/playwright.config.ts` (`WEBHOOK_FAKE_SEND: '1'` in the web server env), `turbo.json`; `app/(app)/agency/settings/slack-teams/{page,webhook-controls,actions}.tsx|ts` (+ tests), `lib/labels.ts`; create `apps/web/e2e/agency-settings.spec.ts`; `scripts/e2e-affected-rules.ts` (`@settings` tag).
**Interfaces:**
```ts
// engine
export type WebhookPostResult = { ok: true; status: number } | { ok: false; status?: number; error: 'timeout' | 'blocked' | 'http' | 'network' };
export async function postWebhook(kind: 'slack' | 'teams', url: string, msg: { title: string; body: string; link: string | null }, o: { fetch?: typeof fetch; timeoutMs: number }): Promise<WebhookPostResult>;
// tools
delete_webhook: input { webhookId: uuid } → { deleted: true }; access 'write'; permission 'agency'; admin only (requireAdmin)
test_webhook:   input { webhookId: uuid } → { ok: boolean; status?: number; error?: 'timeout'|'blocked'|'http'|'network' }; access 'write' (sends); admin only
ToolDeps += webhookFetch?: typeof fetch;   // E2E fake when WEBHOOK_FAKE_SEND=1
export const WEBHOOK_TEST_LIMIT = { max: 5, windowMinutes: 10 };
// web labels
export const AGENCY_NOTICE_KIND: LabelMap<(typeof AGENCY_KINDS)[number]>;   // labels from today's AGENCY_KIND_OPTIONS
```
**Behaviour:**
- `postWebhook`: `webhookUrlProblem(kind, url)` → `blocked` without fetching; POST JSON (`slackPayload`/`teamsPayload`), `redirect: 'manual'`, `AbortSignal.timeout(timeoutMs)`; 2xx ok; 3xx/4xx/5xx → `http` + status; abort → `timeout`; other throw → `network`. `createWebhookSender` uses it with 10 s and keeps its Permanent/transient error mapping.
- `test_webhook`: load the agency's row (`agency_id = ctx.agencyId`, else `not_found`); rate limit per B2 (5/10 min) → `ToolError('rate_limited', 'You can send another test in a few minutes.', { userFacing: true })`; message per B9 with `loadBranding(...).displayName`; 5 s; no `notification` row; inactive webhooks can be tested.
- `delete_webhook`: `DELETE … WHERE id AND agency_id RETURNING`; 0 rows → `not_found`; notifications cascade (FK).
- `WEBHOOK_FAKE_SEND=1` (refused when `VERCEL_ENV=production`, like `ASK_FAKE_AI`): `webhookFetch` returns `200` for `hooks.slack.com` and a never-resolving promise for `*.webhook.office.com` paths containing `/slow` (so E2E sees the timeout copy) — keep the fake in `server/tools.ts`; add to `turbo.json` `globalPassThroughEnv`.
- Page rows (mockup): kind `StatusChip` (neutral, `WEBHOOK_KIND`), on/off chip, kinds list via `AGENCY_NOTICE_KIND` labels (no raw slugs; `AGENCY_KIND_OPTIONS` derived from the map), "Send test" button, Delete (`ConfirmDialog` danger: "Delete this webhook?" / "Briefs and alerts stop going to this {Slack channel|Teams channel}. You can add it again later." / "Delete"). Inline result line per row (hoisted): "Test sent — Slack answered 200." / "Test failed — Teams didn't answer within 5 seconds." plus "blocked": "Test failed — this address isn't a Slack or Teams webhook." and "http": "Test failed — {Kind} answered {status}." (sign-off).
- Toggle (`WebhookToggle`) checks the `runTool` result, reverts and shows `FormError` (5a T18, 5b-2). `PrefSwitch` fix lives in T13.
- Append `app/(app)/agency/settings/slack-teams` to `GATED_PATHS`.
**Tests (TDD):** engine `postWebhook blocked URL never fetches`, `slack payload shape`, `teams payload shape`, `redirect is a failure (status 302, error http)`, `5 s timeout → timeout`, `network error → network`; tools `test_webhook rate-limits the 6th within 10 min`, `refused calls don't count`, `test of another agency's webhook is not_found`, `writes no notification row`, `delete_webhook cascades notifications and refuses account managers`; `access-marks snapshot`; web `env refuses WEBHOOK_FAKE_SEND in production`, `toggle reverts on failure`, `kinds render labels`; E2E `@settings` `send test shows Slack answered 200` and `delete asks for confirmation`.
**Done when:** engine `npx vitest run delivery/webhooks`, `pnpm --filter @cs/tools exec vitest run settings access-marks`, `pnpm --filter @cs/web exec vitest run slack-teams env page-gates`, `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`.

### Task 11: Invite resend + `team_invite` email
**Goal:** `resend_invitation`, `resendInvitation` service fn (15c-3 reuses it), `team_invite` email (D7, B1–B3), Team page rows.
**Files:** modify `packages/tools/src/access/team.ts` (+ `team.test.ts`), create `packages/tools/src/access/team-invite-email.ts` (+ test), modify `packages/tools/src/tools/{settings,agency-settings-reads}.ts` (+ tests), `access/client-invite.ts` (export a `sendClientInvite(tx, deps, …)` used by both invite and resend), `packages/tools/src/index.ts`, `access-marks.test.ts`, 8b doc; email: create `packages/email/src/templates/team-invite.tsx` (pragma lines), modify `types.ts`, `render.ts`, `index.ts`, create `team-invite.test.ts`; web: `app/(app)/agency/settings/team/{page,invite-form,actions}.tsx|ts` (+ tests), `lib/labels.ts` (B14), `help/copy/agency.ts`; `app/white-label-leak.test.tsx` (team_invite row).
**Interfaces:**
```ts
export const RESEND_LIMIT = { max: 3, windowHours: 24 };
export async function resendInvitation(ctx: AccessContext, deps: ToolDeps, invitationId: string, now?: Date): Promise<{ sentAt: Date; expiresAt: Date; emailSent: boolean }>;
export async function sendTeamInviteEmail(deps: ToolDeps, i: { agencyId: string; to: string; role: 'agency_admin' | 'account_manager'; inviterUserId: string; expiresAt: Date }): Promise<boolean>; // false = not configured or send failed (logged by id only)
resend_invitation: input { invitationId: uuid } → { sentAt: string; expiresAt: string; emailSent: boolean }; access 'write'; permission 'agency'
// get_team invitations[] += sentAt: string (B3)
// email
export interface TeamInviteProps { branding: Branding; inviterName: string; agencyName: string; roleLabel: string; expiryDate: string; signInUrl: string }
```
**Behaviour:**
- `resendInvitation`: load pending invitation (agency, not accepted/revoked, `expires_at > now`) and `canManage` → else `not_found`; count prior ok `resend_invitation` audit rows (B2, 24 h) ≥ 3 → `ToolError('rate_limited', 'You can resend this invite again tomorrow.', { userFacing: true })`; `UPDATE invitation SET expires_at = now + INVITATION_TTL_DAYS`; agency role → `sendTeamInviteEmail` after commit; client role → `notify` `client_invite` in the same tx with dedupe `client-invite:${id}:resend:${n}` (n = prior count + 1), contact found by (agency, client, lower(email)).
- `invite_member` (agency roles) calls `sendTeamInviteEmail` after `inviteMember` commits; result `emailSent` reaches the action. Action copy: sent → "Invitation sent to {email}."; not sent → "Invitation created, but the email couldn't be sent. Ask them to sign in at {appUrl}/sign-in with this email." (sign-off).
- Email copy (spec §6, decided): subject "{inviterName} invited you to {agencyName}"; body "{inviterName} has invited you to join {agencyName} as {roleLabel}. Sign in with this email address to accept. This invite expires on {expiryDate}."; button "Sign in" → `${appUrl}/sign-in?email=<enc>&next=/agency`. Branding = `loadBranding(agency)`; white-label agencies never show Rival Monday (layout already brands). `inviterName` = user name or email; `expiryDate` = "Nov 6, 2026" (`Intl`, `timeZone: 'UTC'`, year always). Never log address/URL.
- Team page (mockup): invite rows "Sent {date} · expires {date}" (`formatDate` viewer tz), Resend + Revoke buttons with per-row `aria-label` ("Resend invite to {email}"), inline result line hoisted to an always-mounted wrapper ("Invite sent again." / refusal copy); Revoke + Remove → `ConfirmDialog`; role labels via `MEMBERSHIP_ROLE` (delete local `ROLE_LABELS`/`formatDate`, backlog `team/page.tsx:29`); "Seat" tip untouched (15b).
- Append `app/(app)/agency/settings/team` to `GATED_PATHS`.
**Tests (TDD):** `resend resets expires_at to now + 14 days`; `resend refuses the 4th within 24h and ignores refused rows`; `client role resend writes a new outbox row each time (dedupe differs)`; `agency role resend sends team_invite`; `account manager cannot resend an agency invite (not_found)`; `inviteMember for agency_admin sends team_invite`; `send failure still creates the invitation and returns emailSent false`; email `subject and body match the decided copy`; `team_invite email has no Rival Monday for a branded agency`; `get_team sentAt = expiresAt − 14 d`; page `resend result survives revalidate`; `access-marks snapshot`.
**Done when:** `pnpm --filter @cs/tools exec vitest run team client-invite settings agency-settings-reads access-marks`, `pnpm --filter @cs/email exec vitest run team-invite jsx-pragma render`, `pnpm --filter @cs/web exec vitest run settings/team white-label-leak page-gates`.

### Task 12: Intake preview + readable button text
**Goal:** `/agency/settings/intake/preview` (spec §6 + 15c §4), B8 contrast fix.
**Files:** `app/start/{landing,intake-form}.tsx` (+ tests); create `app/(app)/agency/settings/intake/preview/page.tsx` (+ `page.test.tsx`); modify `app/(app)/agency/settings/intake/page.tsx`, `components/agency/intake-link-card.tsx` (+ test), `help/copy/agency.ts` (`PAGE_COPY['agency.settings.intake.preview']`), `help/reach.ts` (if pages are listed), create `docs/help/pages/agency.settings.intake.preview.agency.md`; `scripts/e2e-affected-rules.ts`; `e2e/intake.spec.ts`.
**Interfaces:**
```ts
export function IntakeLanding(p: { brand: IntakeBrand; slug: string | null; refCode: string | null; siteKey: string | null; preview?: boolean }): JSX.Element;
// route: /agency/settings/intake/preview — agency_admin only (else notFound), not in support session (as intake page); help key 'page:agency.settings.intake.preview'
```
**Behaviour:**
- Preview page: `requireContext`, admin + `viewer.kind === 'user'` else `notFound()`; reads `get_intake_link` (tool) and `themeForViewer(viewer)` → `agencyBrand(theme.branding)`; renders inside the settings shell with `PageHeader` (title "Intake preview", breadcrumb Agency settings › Intake link › Preview), a dashed primary-blue frame whose bar reads "Preview — this is what visitors see", plus "Link is off · visitors can't open it yet" when disabled (spec copy). Works regardless of the link being enabled.
- `preview`: `IntakeForm` gets `preview` → lookup and submit buttons `disabled` with `aria-disabled` and a note "Disabled in preview"; Turnstile not rendered (`siteKey` ignored); no server action is reachable from the form (`action` undefined).
- Intake page links "Preview your page" → the route.
- `buttonHtml` uses `readableTextOn(background)` (T1) for `color`; IntakeShell's buttons pick it up via `themeVars`.
- E2E rule: `agency/settings/intake/preview` → `@leads` (intake tag in use; check `intake.spec.ts`'s tags) ; spec `preview renders with submit disabled`.
- Guide (sign-off): what the preview shows, that it's not live, how to turn the link on.
- Append `app/(app)/agency/settings/intake`, `app/start` to `GATED_PATHS` (start's page fixes are T13; append after T13 if hits remain).
**Tests (TDD):** `buttonHtml uses dark text on a light primary`; `preview disables submit and renders no Turnstile`; `preview shows the link-off line when disabled`; `preview 404s for account managers`; `help coverage includes page:agency.settings.intake.preview`.
**Done when:** `pnpm --filter @cs/web exec vitest run intake start help/coverage page-gates`, `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`.

### Task 13: Account and public pages sweep
**Goal:** §4.1 on Inbox, notifications, sign-up/sign-in, `/start*` and the remaining public pages.
**Files:** `app/(app)/inbox/{page,actions}.tsx|ts`, `packages/tools/src/inbox.ts` (only if client name isn't in the row), `app/(app)/settings/notifications/{page,contact-form,pref-switch,actions}.tsx|ts`, `app/sign-up/{page,sign-up-form}.tsx`, `app/sign-in/*.tsx`, `app/start/{page,intake-form,landing}.tsx`, `app/start/v/[leadId]/{page,poller}.tsx`, `app/(app)/{kb,paused}/**`, `app/{join,link-expired,link-other-account,no-access,u,oauth}/**` (gate fixes only).
**Behaviour:**
- Inbox: `<h1>` via `PageHeader` if missing; times `formatDateTime(viewer tz, zoneLabel)` (drop the local `toLocaleString`); unread = bold **plus** a visible "New" chip (info) and `aria-label` suffix; client name per row for agency users (from the inbox row; add `clientName` to the inbox read if absent).
- Notifications: per-card unique ids (`${contactId}-timezone` etc.); `PrefSwitch` keeps `isPending`, reverts on failure and shows `FormError` (5a T17); quiet-hours save shows "Saved." / error inline; `SaveBar` if the form has > 1 field.
- Sign-up: "Already have an account? Sign in" link; terms/privacy line (B12); check-email echo is T14.
- `/start`: after results, focus moves to the stage-2 heading (`tabIndex={-1}` + `focus()` on reveal); consent label links privacy (B12, platform kind only); `/start/v/[leadId]`: miles via `formatMiles` (not `kmToMiles().toFixed`), a CTA ("What happens next" + link back to the agency site or `/start`, copy sign-off); "within one business day" promise replaced by neutral wording (sign-off).
- Append every folder above to `GATED_PATHS`.
**Tests (TDD):** `inbox shows zone label and a New chip for unread`; `inbox shows client name for agency rows`; `notifications ids are unique across cards`; `pref switch reverts and shows the error on failure`; `start moves focus to stage 2`; `lead view shows miles via formatMiles`; `sign-up links to sign in`.
**Done when:** `pnpm --filter @cs/web exec vitest run inbox notifications sign-up start page-gates`.

### Task 14: Sign-in / sign-up email resend
**Goal:** "Resend email" on both check-email variants (spec §6, B4, B5).
**Files:** create migration via `pnpm --filter @cs/db generate --name=email_resend` + `--custom --name=email_resend_rls`; modify `packages/db/src/schema/access.ts`, `packages/db/src/index.ts` (export), `packages/db/src/access.test.ts`; create `apps/web/src/server/pending-email.ts` (+ `pending-email.test.ts`), create `apps/web/src/app/sign-in/check-email/{actions.ts,resend-button.tsx}` (+ tests); modify `app/sign-in/check-email/page.tsx`, `app/sign-in/sign-in-form.tsx`, `app/sign-up/actions.ts` (+ tests).
**Interfaces / full code (security-sensitive; imports `Db`, `emailResend` from `@cs/db`, `sql` from `drizzle-orm`):**
```sql
-- <next>_email_resend.sql (generated from the schema; shape must be)
CREATE TABLE "email_resend" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "email_hash" text NOT NULL, "sent_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE INDEX "email_resend_hash_sent_idx" ON "email_resend" USING btree ("email_hash","sent_at");
-- <next+1>_email_resend_rls.sql (custom): service-role only, as pending_signup (0066)
REVOKE ALL ON email_resend FROM app_user;
--> statement-breakpoint
ALTER TABLE email_resend ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE email_resend FORCE ROW LEVEL SECURITY;
```
```ts
// apps/web/src/server/pending-email.ts  (no 'server-only' import so tests run; never logs the address)
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const PENDING_EMAIL_COOKIE = 'rm_pending_email';
export const PENDING_EMAIL_TTL_SECONDS = 15 * 60;
export type PendingEmail = { email: string; flow: 'signin' | 'signup'; next: string };
const DOMAIN = 'rm-pending-email.v1';
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(`${DOMAIN}.${payload}`).digest();
export function signPendingEmail(secret: string, p: PendingEmail, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ e: p.email.trim().toLowerCase(), f: p.flow, n: p.next, iat: Math.floor(now.getTime() / 1000) })).toString('base64url');
  return `${payload}.${mac(secret, payload).toString('base64url')}`;
}
export function verifyPendingEmail(secret: string, value: string | undefined, now = new Date()): PendingEmail | null {
  if (!value) return null;
  const [payload, sig, extra] = value.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  const want = mac(secret, payload);
  if (want.length !== given.length || !timingSafeEqual(want, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; f?: unknown; n?: unknown; iat?: unknown };
    if (typeof c.e !== 'string' || c.e.length > 320 || (c.f !== 'signin' && c.f !== 'signup') || typeof c.n !== 'string' || typeof c.iat !== 'number') return null;
    if ((c.iat + PENDING_EMAIL_TTL_SECONDS) * 1000 <= now.getTime()) return null;
    return { email: c.e, flow: c.f, next: c.n };
  } catch {
    return null;
  }
}
export const emailHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
export const RESEND_PER_HOUR = 5;
/** Counts and records in one statement pair inside a transaction; true = allowed (and recorded). */
export async function takeResendSlot(service: Db, email: string, now = new Date()): Promise<boolean> {
  return service.transaction(async (tx) => {
    const h = emailHash(email);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${h}))`);
    const [{ n }] = [...(await tx.execute<{ n: number }>(sql`select count(*)::int as n from email_resend where email_hash = ${h} and sent_at > ${now.toISOString()}::timestamptz - interval '1 hour'`))];
    if (n >= RESEND_PER_HOUR) return false;
    await tx.insert(emailResend).values({ emailHash: h, sentAt: now });
    return true;
  });
}
```
```ts
// app/sign-in/check-email/actions.ts
export type ResendState = { status: 'idle' | 'sent' | 'expired'; message: string | null };
export async function resendEmailAction(prev: ResendState, fd: FormData): Promise<ResendState>;
```
**Behaviour:**
- Cookie: httpOnly, `SameSite=Lax`, `secure` in production, `path: '/'`, `maxAge` 15 min. Set by `rememberPendingEmail(email, next)` server action (sign-in form, after a successful `magicLink` call; `next` re-validated with `safeNext`) and by `startSignup` on every email path (refused included: same cookie, same timing — B5; the Google path doesn't set it).
- Resend action: `verifyPendingEmail` fails → `{ status: 'expired', message: null }` (the button becomes a link "Start again" → `/sign-in` or `/sign-up`); never reads an address from the form or URL. Else `takeResendSlot`; allowed → `signInMagicLink` with `callbackURL` = `next` (signin) or `/onboarding/start` (signup) and the same `errorCallbackURL`s as today; refused by the slot → same result as success. Response always `{ status: 'sent', message: 'If that address can sign in, a new email is on its way.' }`; 400 ms floor like `startSignup`. Errors logged by name only.
- Button (`resend-button.tsx`, client): "Resend email"; after any submit a 60 s countdown "Resend in {n} s" (disabled); initial render enabled; result line `role="status"`. Shown on both variants; Better Auth's IP limit still applies (it may refuse silently — same copy).
- The page also echoes nothing about the address (copy unchanged otherwise).
**Tests (TDD):** `sign/verify round-trips and lower-cases`; `tampered cookie is refused`; `expired cookie is refused (15 min)`; `wrong secret is refused`; `takeResendSlot allows 5 then refuses within an hour`; `counts per lower-cased address (Foo@x.com = foo@x.com)`; `slots older than an hour don't count`; action `unknown address gets the same result`; `missing cookie returns expired and never calls signInMagicLink`; `signup flow uses /onboarding/start`; `startSignup sets rm_pending_email for refused sign-ups too`; button `counts down 60 s after submit`; db `email_resend is RLS-forced and invisible to app_user`.
**Done when:** `pnpm --filter @cs/db exec vitest run access tenant`, `pnpm --filter @cs/web exec vitest run pending-email check-email sign-in sign-up auth-schema`, `pnpm typecheck`.

### Task 15: Investigate "destination stream closed early"
**Goal:** Spec §4.2 investigate item.
**Files:** none expected; possibly `apps/web/e2e/workspace.spec.ts`, `apps/web/playwright.config.ts`. `docs/BACKLOG.md` is not edited on the branch: record the outcome in `docs/work/phase-15c2.md` § New backlog.
- [ ] Run `pnpm --filter @cs/web exec playwright test e2e/workspace.spec.ts` (after `e2e:affected --full` build) 3× on the branch and 3× on a `main` checkout (its own test DB); capture server-log lines around the message with timestamps and the test running at that moment.
- [ ] If it maps to an aborted response (e.g. a navigation cancelling an RSC/SSE stream or a `files/*` download), confirm with the server stack and fix only if the cause is app code (e.g. an unawaited stream write); else record "infra/noise, cause: …" with evidence.
**Done when:** finding written in the work file (and the `apps/web/CLAUDE.md` E2E note updated if the cause is known); any fix has a test.

### Task 16 (last, C7/D2): `/platform/themes` + `theme-queue.tsx`
**Goal:** §4.1 on the topic proposal page.
**Files:** `app/(platform)/platform/themes/{page,theme-queue,actions}.tsx|ts` (+ tests), `lib/labels.ts` (`TOPIC_PROPOSAL_STATUS`). If 15b-3b has merged: rebase on `main` first and edit `app/(platform)/platform/topics/**` (renamed files) instead.
**Behaviour:** `Badge` → `StatusChip` + `TOPIC_PROPOSAL_STATUS` (proposed warning "Waiting for review", approved success, rejected neutral); ISO dates → `formatDate`/`formatRelative` viewer tz; Approve / Reject behind `ConfirmDialog` (irreversible; copy sign-off, user-facing word "topic"); result line hoisted. Append the folder to `GATED_PATHS` — after this `GATED_PATHS` ⊇ `AREAS_2A`.
**Tests (TDD):** `approve needs a confirm`; `status is a chip with a label`; `no ISO dates`; `gated paths cover AREAS_2A` (flip the report test to enforcing here).
**Done when:** `pnpm --filter @cs/web exec vitest run themes topics labels page-gates`.

### Task 17: Wrap (2a)
**Goal:** Copy sign-off, help coverage, work file.
**Files:** create/modify `docs/archive/phase-15c2-copy-signoff.md` (§ "15c-2a"), `docs/work/phase-15c2.md`, package `CLAUDE.md` gotchas (tools: `resendInvitation`, audit-row counting B2, direct `team_invite`; web: `rm_pending_email`, gates ratchet, `WEBHOOK_FAKE_SEND`; engine: `postWebhook`).
- [ ] Sign-off doc: every new/changed string from T3–T16 grouped by page, with file:line, incl. labels maps (B14), confirm titles/bodies, webhook results, team_invite email, resend copy, preview bar, privacy URL question (B12), onboarding button, alert age/expiry line.
- [ ] `pnpm --filter @cs/web exec vitest run help/coverage terminology white-label-leak copy page-gates` green; `GATED_PATHS` ⊇ `AREAS_2A`.
- [ ] Work file: Status/Next (→ 2b pre-flight), Interfaces added (tools, cookie, route, migration number), New backlog (agency privacy URL; any Polish left), Owner verification steps (webhook test with a real Slack URL, invite resend email in `apps/web/.outbox`, intake preview with link off, sign-in resend countdown, billing tabs).
**Done when:** docs committed; final 2a whole-branch review (most capable model) with `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main`, then one fix wave.
