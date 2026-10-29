# Phase 17a — pilot waitlist, pilot switch and sample briefs (app side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rivalmonday.app accepts pilot sign-ups from the marketing site (`POST /api/waitlist`), confirms the email, exposes a public status/counters read (`GET /api/site-status`), lets operators invite agencies (single + bulk), assign businesses to agencies and build real sample briefs from `/platform/waitlist`, and serves a sample at a read-only `/sample/<token>` page. A `pilot_mode` switch closes open agency sign-up. `apps/site` is NOT in this plan (17b/17c).

**Architecture:** One platform-class table `waitlist_entry` (+ `brief.claims_checked`). Public entry points are **service functions** in `@cs/tools/src/waitlist/` called by route handlers (the 10/11c pattern: `startAgencySignup`, `submitIntake`, `getPublicPreview`); every operator read/write is a registered platform tool (`requirePlatformOperator` + `withPlatformAudit`) reached through `runTool`/`callTool`. Emails are sent directly after commit (11c R1 pattern, `sendLeadEmail`). The sample space is a real platform-owned agency (id in `platform_setting`) where the operator holds an `agency_admin` membership and runs the **normal** setup wizard.

**Tech Stack:** Next.js 16 App Router route handlers + pages, Drizzle/Postgres (Neon), zod, react-email (`@cs/email`), `@cs/ui` DS v1, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-phase-17-marketing-site-design.md` § 2 (row 17a), § 5 (popup contract), § 6.1–6.7, § 7.2 (`SITE_ORIGIN`, `SITE_ORIGIN_EXTRA` only). Brief: `docs/work/phase-17.md` § 2–3. Root `CLAUDE.md` § Decisions binding.

## Global Constraints
- Read `docs/gotchas-cross-cutting.md` and the `CLAUDE.md` of every package you touch (`packages/db`, `packages/tools`, `packages/email`, `packages/engine`, `apps/web`, `packages/ui`) before coding.
- Web writes via `runTool`, reads via `callTool`/tools; refusals 404. New tool ⇒ `ISOLATION_FIXTURES` entry, `access` mark (+ `WRITE_TOOLS` in `packages/tools/src/tools/access-marks.test.ts`, + `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md` row), output keys matching `/email/i` in `supportMask`, platform tools in `PLATFORM_TOOLS` (`packages/tools/src/billing-guard.ts`). New table ⇒ `TABLE_CLASS` + world rows. Web-only tools (no `channels`).
- Privacy: never log emails, IPs, tokens, business names; refusal logs = a bare reason word (mirror `[intake] refused <reason>`). Hash IPs with `hashIp(ip, webEnv().authSecret)`. Website/URL fields are stored as typed and **never fetched**.
- UI: DS v1 (`docs/design-system/09-ai-implementation-playbook.md`; L1 list for `/platform/waitlist`, L5 reading column for `/sample/<token>`); status text via `apps/web/src/lib/labels.ts`; dates via `@/lib/format` in the viewer's tz; every write control in `WriteGuard`; `bash scripts/design-lint.sh` stays 0; grep gates (`lib/page-gates.ts`) pass; new routes get a rule in `apps/web/scripts/e2e-affected-rules.ts`; no `loading.tsx`.
- User-facing copy marked **(owner signs)** is decided copy: use it verbatim; Task 12 collects it for sign-off.
- Migration: next free number at execution time (0096 today). Schema change ⇒ `pnpm --filter @cs/db generate --name=waitlist`, then append the hand-written RLS lines to that file (as `0094_ops_alert.sql`). Never edit applied migrations.
- New env vars `SITE_ORIGIN`, `SITE_ORIGIN_EXTRA` go in `turbo.json` `globalPassThroughEnv`; never touch the root `.env` (owner adds them).
- Tests: implementers run focused tests only (`pnpm --filter <pkg> exec vitest run <pattern>`; web: `apps/web/node_modules/.bin/vitest run <pattern>` if `exec` says not found). `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` run **once**, at the final review (`--base main`). One test run per DB at a time.
- Per task: `- [ ]` write the listed tests first and watch them fail → implement → focused tests green → commit. Isolation fixtures: `platform(...)` with the Task 1 world ids; a tool whose positive control needs state the world can't hold (`send_sample_brief`: an approved starting point; `platform_find_business`: the fake `setupLookup`, check the harness deps) uses `skipPositive` with that reason and is covered in its own test file.
- Commits: explicit paths (`git commit -- <paths>`), never amend, LF only; message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents: their own model).

## Decisions
Spec § 6 (O)/(C) items stand. Plan-level calls (recorded for the owner's plan approval):
- **P1 Public writes are service functions, not a "system actor" tool.** The spec says the submit "writes through a registered tool via `runTool` with a system actor"; the registry has no system actor and every public path today (`startAgencySignup`, `submitIntake`, `verifyIntake`, `getPublicPreview`) is a `@cs/tools` service function on the service role. 17a follows that: `submitWaitlistEntry`, `confirmWaitlistEmail`, `siteStatus`, `getSampleBrief`, `sampleEvidenceKey`. There is no `submit_waitlist_entry` tool.
- **P2 Extra columns:** `vertical_id` is `text` (FK `vertical.id` is a text slug, not a uuid); `vertical_other text` holds the "Other" type; `confirm_token_hash`/`confirm_expires_at` (7 days) back the confirm link; `sample_approved_at` (monthly limit count) and `sample_sent_at`. `sample_status` values: `requested | approved | sent | declined | failed` — **no stored `running`**: the waitlist page derives the stage (`setup → generating → review → ready_to_send`) from the sample client's starting point, because nothing in the setup pipeline would write `running`.
- **P3 Resubmits:** `unique (kind, email)`. An unconfirmed `new` row takes the new details and a fresh confirm token (email sent again); a confirmed or decided row only gets `updated_at` (an unverified party can never overwrite it) and no email. Response identical either way.
- **P4 Rate limits:** `intake_rate` keys `waitlist:ip:<hash>` ≤ 5/hour and `waitlist:all` ≤ 500/UTC day; over either = uniform `{ ok: true }`, nothing written.
- **P5 Turnstile:** the route verifies with the app's existing `TURNSTILE_SECRET_KEY`, so 17b's site must use the **same widget** (owner adds `rivalmonday.com` to its hostname list). Fails → `400 { ok:false, error:'check' }` (like `/sign-up`'s "complete the check").
- **P6 CORS:** exact-origin allowlist from `SITE_ORIGIN` + comma-separated `SITE_ORIGIN_EXTRA`; unset = no cross-origin caller (fail closed). `POST`/`OPTIONS` from any other `Origin` (or none) → 403. `GET /api/site-status` carries only platform aggregates and sends `Access-Control-Allow-Origin: *`.
- **P7 Settings UI lives on `/platform/billing`** next to the existing `SignupsPanel` — there is no separate "console settings page". `get_pilot_settings` (read) is added for it. `set_pilot_mode` / `set_sample_brief_limit` are owner-only (like `set_signups_paused`); waitlist actions are staff+, `list_waitlist` viewer+.
- **P8 Verifier tally = `brief.claims_checked integer` (nullable)** — model-written sentences put through the verifier per stored brief. The drops already exist: `brief.dropped.sentences` (the `brief_item` comment only means *which* sentences are not stored). `claimsDropped` = Σ `dropped.sentences` over briefs with `claims_checked IS NOT NULL`. Starting-point template facts are not "claims" (deterministic, counted in `dropped.items` as today).
- **P9 Counters** (`siteStatus`): `rivalSitesWatched` = distinct tracked competitors of serviceable clients now; `snapshotsThisWeek` = captures (`ok|unchanged`) in 7 d of competitors such clients track; `claimsChecked`/`claimsDropped` = briefs generated in 7 d. All exclude the sample agency and archived tenants. Each value is `null` below 10, else rounded down (2 significant digits, tens below 100). `counters: null` on a query error.
- **P10 Business assignment and sample approval need a place pick:** both dialogs search Google listings with a new platform tool `platform_find_business` (service-role `deps.setupLookup`, ledgered as platform cost, ≤ 50/operator/UTC day via `intake_rate`), mirroring `find_business` (`packages/tools/src/tools/setup.ts:26`). Assign inserts a `verified` pool `lead` (`ref: 'waitlist'`, `verified_at` = `email_confirmed_at`) and runs the `assign_lead` body (extracted as `assignPoolLeadTx`) in the same transaction, then `agency_new` mail.
- **P11 Sample space = membership, not a support session.** Support sessions are read-only (`ctx.support` refuses every write), so they cannot drive the wizard. `decide_sample_brief(approve)` creates (once) the agency "Rival Monday Samples" (`platform_setting` key `sample_agency_id`; exempt pilot via `ensureExemptPilot`; no `agency_onboarding` row ⇒ no wizard redirect/nudges), gives the approving operator an `agency_admin` membership + contact there, creates the sample client (`active`, from the picked listing + vertical) via `createClientCore`, and returns `/c/<clientId>/setup`. The operator then runs the normal wizard (area → competitors; discovery auto-runs) and approves the starting point in Approvals. The interface grows: `decide_sample_brief({ id, approve, lookup?, verticalId? })`.
- **P12 Sending is an explicit step:** `send_sample_brief({ id })` (new tool) — allowed once the starting point is `approved|sent` (approval already "sends" to zero contacts); signs the 30-day link, emails `sample_brief_ready`, sets `sent`, pauses the sample client (`paused_at`). Re-running it re-issues a link. The spec's "sent when the operator approves the brief" would need an engine hook in `approveBrief`; one button on the waitlist page is smaller.
- **P13 "Excluded from every recurring scheduler"** is met by the pause after sending: the starting point itself needs the normal schedulers (self GBP/reviews, rank scan, discovery, `listStartingPointDue`) while the sample is being built. Spike guard (`readSpikes`) and counters exclude the sample agency explicitly; client contacts are refused for it (`invite_client_owner`, `add_client_recipient`, client-role `invite_member`), so no client email can ever go out.
- **P14 Sample link** = HMAC token `<entryId>.<exp base36>.<mac>` with a purpose-derived key from `authSecret` (mirrors `intake/signed.ts`), valid while unexpired **and** the row is `sent`. Evidence on the page is served by `/sample/<token>/evidence/<id>` only for ids cited by that starting point's active items, kinds `screenshot|text` only.
- **P15 Sample cost estimate:** discovery cap $3 (Phase 12 decision, `SAMPLE_DISCOVERY_CAP_USD`) + `startingPointAvgUsd` = average ledger spend (`llm_call` + `vendor_call`, `client_id` = the client, `created_at ≤ brief.generated_at`) over the 20 newest approved/sent starting points; `null` = "No history yet".

## File structure
- **DB:** `packages/db/src/schema/waitlist.ts` (new), `packages/db/src/schema/{index,briefs}.ts`, `packages/db/migrations/0096_waitlist.sql` (+ meta), `packages/db/test/{table-classes,isolation-world}.ts`, `packages/db/src/waitlist-rls.test.ts` (new)
- **Tools:** `packages/tools/src/waitlist/{public,emails,site-status,sample-token,sample,settings,estimate}.ts` (+ tests), `packages/tools/src/tools/{platform-waitlist,platform-signups,platform-billing,platform-leads,nav-counts,setup,settings,all}.ts`, `packages/tools/src/access/signup.ts`, `packages/tools/src/spend-guard.ts`, `packages/tools/src/{deps,index,billing-guard}.ts`, `packages/tools/src/isolation/fixtures.ts`, `packages/tools/src/tools/access-marks.test.ts`
- **Engine:** `packages/engine/src/briefs/{verify,generate,starting-point}.ts`
- **Email:** `packages/email/src/templates/{waitlist-confirmation,sample-brief-ready}.tsx`, `packages/email/src/{render,types}.ts`, `packages/email/src/waitlist-email.test.ts`
- **Web:** `apps/web/src/app/api/{waitlist,site-status}/route.ts`, `apps/web/src/app/waitlist/{confirm/[token]/route.ts,confirmed/page.tsx}`, `apps/web/src/app/sample/[token]/{page.tsx,evidence/[evidenceId]/route.ts}`, `apps/web/src/app/(platform)/platform/waitlist/{page,actions,waitlist-table,place-lookup,assign-dialog,sample-dialog}.tsx|ts`, `apps/web/src/app/(platform)/platform/billing/{pilot-panel.tsx,actions.ts,page.tsx}`, `apps/web/src/app/sign-up/page.tsx`, `apps/web/src/proxy.ts`, `apps/web/src/server/{env,site-origin,nav,tools}.ts`, `apps/web/src/components/shell/{nav-items.ts,nav-link.tsx}`, `apps/web/src/components/{views/brief-view,evidence-chips}.tsx`, `apps/web/src/lib/labels.ts`, `apps/web/src/help/copy/platform.ts`, `docs/help/pages/platform.waitlist.operator.md`, `apps/web/scripts/e2e-affected-rules.ts`, `apps/web/e2e/{waitlist.spec.ts,seed.ts}`
- **Root/docs:** `turbo.json`, `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`, `docs/archive/phase-17a-copy-signoff.md` (new), `docs/work/phase-17.md`

## Dependencies on in-flight work
`git branch --no-merged main` = `phase-17` only (phase-16 merged @ 023a9f52). 13a (white-label, plan approved, unbuilt) touches `theme.ts`, `app-shell.tsx`, `auth-card.tsx`, host-aware error pages — 17a edits none of them (nav counts change `server/nav.ts`; the pilot `/sign-up` branch reuses `AuthCard` without modifying it). Task 0 re-checks.

## Review Focus
1. **Public routes leak nothing** — duplicate / rate-limited / refused / confirmed-resubmit all answer the same `200 { ok:true }` after ≥ 400 ms; Origin allowlist exact; Turnstile before any write; no email/IP/token in logs → Task 4 tests `uniform response…`, `cors…`, `no pii in logs`.
2. **Confirmation gate + no overwrite** — only `email_confirmed_at IS NOT NULL` rows can be invited, assigned or sample-approved; a resubmit never changes a confirmed/decided row → Task 3 `resubmit…`, Task 8 `skips unconfirmed`, Task 9 `refuses unconfirmed`, Task 10 `refuses unconfirmed`.
3. **Pilot switch** — `startAgencySignup` refuses open sign-ups while `pilot_mode` is on (logged `pilot`), token sign-ups unaffected; the page shows the pilot message and agrees with the service (pilot wins over paused) → Task 2 tests.
4. **Sample isolation** — token signed, expiring, row must be `sent`; page/evidence serve only that starting point's cited `screenshot|text` evidence, 404 otherwise; sample agency refuses client contacts and is excluded from spike guard and counters → Task 10 `sample agency refuses contacts`, `spike excludes sample`; Task 11 `token…`, `evidence not cited → 404`.
5. **Counters honest** — aggregates only (no ids/names), sample + archived excluded, floor/rounding exact, `claims_checked` counts only model sentences → Task 5 `tally…`, Task 6 `publicCount…`, `excludes sample`.

---

### Task 0: Pre-flight
**Goal:** confirm the base and re-check every assumption before code.
- [ ] `git fetch && git log --oneline -1 main` ; rebase `phase-17` on `main` if it moved; `git branch --no-merged main` (expect `phase-17` only). If a new branch touches `platform-leads.ts`, `platform-billing.ts`, `signup.ts`, `verify.ts`, `nav-items.ts`, `proxy.ts`, `brief-view.tsx`: conflict-scan and note it in the work file.
- [ ] Next free migration: `ls packages/db/migrations | tail -2` (expect `0095_*` → use 0096).
- [ ] Re-check signatures used below: `hitRate` (`packages/tools/src/intake/rate.ts`), `newToken`/`hashToken` (`intake/tokens.ts`), `hashIp` + `startAgencySignup` (`access/signup.ts`), `createInviteLinkTool` body (`tools/platform-billing.ts:289`), `assignLeadTool` body (`tools/platform-leads.ts`), `createClientCore` (`tools/onboarding.ts:67`), `platformAgencyCtx` (`platform/agency-ctx.ts`), `ensureExemptPilot` (`@cs/billing` `seed.ts`), `addContact` (`@cs/engine` `delivery/contacts.ts:87`), `briefDetail` (`tools/briefs.ts:52`), `verifyTurnstile` (`apps/web/src/server/turnstile.ts`), `sendAgencyInviteEmail` (`server/invite-email.ts`), `BriefView` props.
- [ ] Per-worktree test DB exists (`grep '^TEST_DATABASE_URL=' .env | cut -d= -f2- | sed 's/.*\///'` ends `_test`); local cluster running (`bash scripts/local-test-db.sh start`).
- **Done when:** notes (if any) appended to `docs/work/phase-17.md` § Status; nothing else committed.

### Task 1: `waitlist_entry` table, `brief.claims_checked`, isolation class
**Goal:** the table and column exist with platform-class RLS; isolation world seeds rows.
**Files:** create `packages/db/src/schema/waitlist.ts`, `packages/db/src/waitlist-rls.test.ts`; modify `packages/db/src/schema/index.ts`, `packages/db/src/schema/briefs.ts` (`claimsChecked: integer('claims_checked')` + doc comment), `packages/db/test/table-classes.ts` (`waitlist_entry: 'platform'`, update the "platform (11)" count), `packages/db/test/isolation-world.ts` (`seedPlatform` + `platformIds` type); generated `packages/db/migrations/0096_waitlist.sql` + `meta/`.

**Interfaces** (`packages/db/src/schema/waitlist.ts`, exported from the schema index):
```ts
export const WAITLIST_KINDS = ['agency', 'business'] as const;
export const WAITLIST_STATUSES = ['new', 'invited', 'assigned', 'declined'] as const;
export const SAMPLE_STATUSES = ['requested', 'approved', 'sent', 'declined', 'failed'] as const;
export const CLIENT_COUNT_BANDS = ['1-5', '6-15', '16-50', '50+'] as const;
export type WaitlistKind = (typeof WAITLIST_KINDS)[number]; // + WaitlistStatus, SampleStatus, ClientCountBand
export const waitlistEntry = pgTable('waitlist_entry', { /* columns as in the SQL below */ });
export type WaitlistEntryRow = typeof waitlistEntry.$inferSelect;
```
**Migration** (generate from the schema, then compare; append the RLS block by hand):
```sql
CREATE TABLE "waitlist_entry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'new' NOT NULL,
  "contact_name" text NOT NULL,
  "email" text NOT NULL,
  "org_name" text NOT NULL,
  "website" text,
  "location" text,
  "vertical_id" text,
  "vertical_other" text,
  "client_count_band" text,
  "sample_requested" boolean DEFAULT false NOT NULL,
  "sample_business_name" text,
  "sample_location" text,
  "sample_website" text,
  "sample_status" text,
  "sample_client_id" uuid,
  "sample_approved_at" timestamp with time zone,
  "sample_sent_at" timestamp with time zone,
  "invite_link_id" uuid,
  "lead_id" uuid,
  "source" text,
  "ip_hash" text NOT NULL,
  "confirm_token_hash" text,
  "confirm_expires_at" timestamp with time zone,
  "email_confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  "decided_by" text,
  CONSTRAINT "waitlist_entry_kind_check" CHECK (kind IN ('agency','business')),
  CONSTRAINT "waitlist_entry_status_check" CHECK (status IN ('new','invited','assigned','declined')),
  CONSTRAINT "waitlist_entry_sample_status_check" CHECK (sample_status IS NULL OR sample_status IN ('requested','approved','sent','declined','failed')),
  CONSTRAINT "waitlist_entry_sample_consistent" CHECK (sample_requested = (sample_status IS NOT NULL)),
  CONSTRAINT "waitlist_entry_agency_only" CHECK (kind = 'agency' OR (NOT sample_requested AND client_count_band IS NULL AND invite_link_id IS NULL)),
  CONSTRAINT "waitlist_entry_business_only" CHECK (kind = 'business' OR (vertical_id IS NULL AND vertical_other IS NULL AND lead_id IS NULL)),
  CONSTRAINT "waitlist_entry_band_check" CHECK (client_count_band IS NULL OR client_count_band IN ('1-5','6-15','16-50','50+')),
  CONSTRAINT "waitlist_entry_email_check" CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT "waitlist_entry_text_check" CHECK (char_length(contact_name) BETWEEN 1 AND 120 AND char_length(org_name) BETWEEN 1 AND 120
    AND coalesce(char_length(website), 0) <= 253 AND coalesce(char_length(location), 0) <= 120 AND coalesce(char_length(vertical_other), 0) <= 80
    AND coalesce(char_length(sample_business_name), 0) <= 120 AND coalesce(char_length(sample_location), 0) <= 120
    AND coalesce(char_length(sample_website), 0) <= 253 AND coalesce(char_length(source), 0) <= 200)
);
--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."vertical"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_sample_client_id_client_id_fk" FOREIGN KEY ("sample_client_id") REFERENCES "public"."client"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_invite_link_id_agency_invite_link_id_fk" FOREIGN KEY ("invite_link_id") REFERENCES "public"."agency_invite_link"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_kind_email_unique" ON "waitlist_entry" USING btree ("kind","email");--> statement-breakpoint
CREATE INDEX "waitlist_entry_kind_status_idx" ON "waitlist_entry" USING btree ("kind","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX "waitlist_entry_sample_idx" ON "waitlist_entry" USING btree ("sample_status","created_at" DESC) WHERE sample_requested;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_confirm_token_idx" ON "waitlist_entry" USING btree ("confirm_token_hash") WHERE confirm_token_hash IS NOT NULL;--> statement-breakpoint
ALTER TABLE "brief" ADD COLUMN "claims_checked" integer;--> statement-breakpoint
-- hand-written: platform class (forced RLS, no policy, no app_user privilege), like platform_cost_item (0051)
ALTER TABLE "waitlist_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist_entry" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "waitlist_entry" FROM app_user;
```
**Behaviour:** world rows in `seedPlatform` (service role, no tenant canaries): `waitlistAgency` (agency, confirmed, `new`), `waitlistAgencySample` (agency, confirmed, `sample_status 'requested'`, `sample_business_name 'World Sample HVAC'`), `waitlistBusiness` (business, confirmed, `vertical_id 'hvac_plumbing'`), `waitlistUnconfirmed` (agency, `email_confirmed_at` null). Add the four ids to `IsolationWorld['platformIds']`. **Follow pattern:** `0094_ops_alert.sql`, `seedPlatform` pool lead.

**Tests (TDD)** `waitlist-rls.test.ts`: `app_user select returns permission denied` (`errorText` matches /permission denied/); `unique (kind,email) rejects a duplicate`; `the same email may exist once per kind`; `email must be lower-case` (insert `A@x.com` fails check); `sample_consistent: requested without sample_status fails`; `business row cannot carry client_count_band`. `isolation-world.test.ts` and `rls-sweep.test.ts` pass unchanged otherwise.

**Done when:** `pnpm --filter @cs/db generate` prints "No schema changes"; `pnpm --filter @cs/db exec vitest run waitlist-rls isolation-world rls-sweep` green. Commit `feat(db): waitlist_entry table and brief.claims_checked (phase 17a)`.

### Task 2: Pilot settings, tools, sign-up gate, `/sign-up` pilot message, billing panel
**Goal:** `pilot_mode` and `sample_brief_monthly_limit` are readable/settable by operators; open sign-up closes while the pilot is on.
**Files:** create `packages/tools/src/waitlist/settings.ts` (+ `settings.test.ts`), `apps/web/src/app/(platform)/platform/billing/pilot-panel.tsx` (+ test); modify `packages/tools/src/tools/platform-signups.ts`, `packages/tools/src/access/signup.ts`, `packages/tools/src/index.ts`, `packages/tools/src/isolation/fixtures.ts`, `packages/tools/src/tools/access-marks.test.ts`, `apps/web/src/app/sign-up/page.tsx` (+ `page.test.tsx`), `apps/web/src/app/(platform)/platform/billing/{actions.ts,page.tsx}`, `apps/web/src/server/{env.ts,site-origin.ts}` (`siteOrigins`, `siteJoinUrl`), `turbo.json`.

**Interfaces:**
```ts
// waitlist/settings.ts
export const PILOT_MODE_KEY = 'pilot_mode';                       // value { on: boolean }; missing row = off
export const SAMPLE_LIMIT_KEY = 'sample_brief_monthly_limit';     // value { n: number }; missing row = 10
export const DEFAULT_SAMPLE_LIMIT = 10;
export const SAMPLE_AGENCY_KEY = 'sample_agency_id';             // value { agencyId }; written only by Task 10's ensureSampleAgency
export async function sampleAgencyId(db: Db): Promise<string | null>;
export async function pilotMode(db: Db): Promise<boolean>;
export async function sampleBriefMonthlyLimit(db: Db): Promise<number>;
// tools (platform-signups.ts, added to platformSignupsTools)
get_pilot_settings: read,  viewer; input {} → { pilotMode: boolean; sampleBriefMonthlyLimit: number }
set_pilot_mode:     write, owner;  input { on: z.boolean() } → { on: boolean }
set_sample_brief_limit: write, owner; input { n: z.number().int().min(0).max(100) } → { n: number }
// apps/web/src/server/env.ts WebEnv: siteOrigins: string[] (SITE_ORIGIN + SITE_ORIGIN_EXTRA, each kept only if new URL(x).origin === x)
// apps/web/src/server/site-origin.ts
export function allowedOrigin(origin: string | null, allowed: readonly string[]): string | null; // exact match or null
export function siteJoinUrl(env: Pick<WebEnv, 'siteOrigins'>): string; // `${siteOrigins[0] ?? 'https://rivalmonday.com'}/#join`
```
**Behaviour:**
- `startAgencySignup`: in the no-token branch, `if (await pilotMode(service)) return refuse('pilot');` **before** the `signups_paused` check. Token path unchanged.
- `/sign-up` page: `pilotMode` first (wins over paused), renders `AuthCard` with the pilot copy below; then the paused branch as today.
- `PilotPanel` on `/platform/billing` beside `SignupsPanel`: Switch "Pilot mode" (owner only, `WriteGuard`) + number field "Sample briefs per month" with Save; actions `setPilotModeAction`, `setSampleLimitAction` via `runTool`. Viewers/staff see values read-only. **Follow pattern:** `signups-panel.tsx`, `setSignupsPausedAction`, `setSignupsPausedTool`.
- `turbo.json` `globalPassThroughEnv` += `SITE_ORIGIN`, `SITE_ORIGIN_EXTRA`.

**Copy (owner signs)** — `/sign-up` pilot branch: title **"Rival Monday is in pilot"**; body **"We're opening places to agencies a few at a time. Join the waitlist and we'll email you an invite when yours is ready."**; link **"Join the waitlist"** → `siteJoinUrl(env)`; line **"Already have an invite? Open the link in your invite email."**; footer as the paused branch ("Already have an account? Sign in"). Panel: label "Pilot mode", hint **"On: open agency sign-up is closed and the site shows the waitlist. Invite links keep working."**; label "Sample briefs per month", hint **"Approvals beyond this number are refused until next month."**

**Tests (TDD):** `settings.test.ts`: `pilotMode missing row = false`, `limit default 10`. `signup.test.ts`: `pilot_mode on refuses open sign-up and logs "pilot"` (`sendLink:false`, no `pending_signup` row); `pilot_mode on still accepts a valid invite token`. Tools: `set_pilot_mode is owner-only` (staff → permission_denied), `writes platform_setting and one platform audit row`. `page.test.tsx`: `pilot on shows the pilot message and the join link`; `pilot and paused both on shows the pilot message`. `site-origin.test.ts`: `exact match only` (`https://rivalmonday.com.evil.com` → null; trailing slash in env dropped). `pilot-panel.test.tsx`: `switch hidden for non-owners`.
**Done when:** `pnpm --filter @cs/tools exec vitest run signup settings platform-signups access-marks isolation` and web `vitest run sign-up pilot-panel site-origin env` green. Commit `feat: pilot_mode switch and sample brief limit (phase 17a)`.

### Task 3: Waitlist submit, confirm and confirmation email
**Goal:** a validated, rate-limited, non-overwriting upsert with a confirm token; the confirmation email.
**Files:** create `packages/tools/src/waitlist/{public.ts,emails.ts}` (+ `public.test.ts`, `emails.test.ts`), `packages/email/src/templates/waitlist-confirmation.tsx`, `packages/email/src/waitlist-email.test.ts`; modify `packages/email/src/{render.ts,types.ts}`, `packages/tools/src/index.ts`.

**Interfaces (binding):**
```ts
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const req = (max: number) => z.string().trim().min(1).max(max);
const email = z.string().trim().max(254).email().transform((v) => v.toLowerCase());
const common = { contactName: req(120), email, orgName: req(120), source: opt(200), turnstileToken: z.string().min(1).max(2048) };
export const waitlistSubmitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agency'), ...common, website: opt(253), clientCountBand: z.enum(CLIENT_COUNT_BANDS),
    sample: z.object({ businessName: req(120), website: opt(253), location: opt(120) })
      .refine((s) => s.website || s.location, { message: 'website or location' }).optional() }),
  z.object({ kind: z.literal('business'), ...common, website: opt(253), location: opt(120),
    verticalId: z.string().trim().max(40).optional(), verticalOther: opt(80) })
    .refine((b) => b.website || b.location, { message: 'website or location' }),
]);
export type WaitlistSubmit = z.infer<typeof waitlistSubmitSchema>;
export const WAITLIST_LIMITS = { ipPerHour: 5, perDay: 500 } as const;
export const CONFIRM_TTL_MS = 7 * 86_400_000;
export async function submitWaitlistEntry(deps: Pick<ToolDeps, 'service'>, input: WaitlistSubmit & { ipHash: string }, now: Date)
  : Promise<{ send: { entryId: string; confirmRaw: string } | null }>;
export async function confirmWaitlistEmail(deps: Pick<ToolDeps, 'service'>, raw: string, now: Date): Promise<{ ok: true } | { expired: true }>;
// emails.ts
export type WaitlistEmailKind = 'confirmation' | 'sample_ready';
export async function sendWaitlistEmail(deps: LeadEmailDeps, entryId: string, kind: WaitlistEmailKind,
  extra: { confirmRaw?: string; sampleUrl?: string; expiresAt?: string }): Promise<void>; // throws on send failure
// @cs/email payloads
{ template: 'waitlist_confirmation'; props: { branding: Branding; kind: 'agency' | 'business'; contactName: string; orgName: string; confirmUrl: string; sampleBusinessName: string | null } }
```
**Behaviour (`submitWaitlistEntry`, service role):**
1. `hitRate(service, 'waitlist:ip:'+ipHash, 'hour', 5)` then `hitRate(service, 'waitlist:all', 'day', 500)`; either false → `console.info('[waitlist] refused rate')`, `{ send: null }`.
2. Vertical: keep `verticalId` only if `SELECT id FROM vertical WHERE id = $1 AND merged_into IS NULL` finds it, else null (the text is not moved).
3. Upsert (write exactly like this; `open` = the existing row is still unconfirmed and `new`):
```sql
INSERT INTO waitlist_entry AS w (kind, contact_name, email, org_name, website, location, vertical_id, vertical_other, client_count_band,
  sample_requested, sample_business_name, sample_location, sample_website, sample_status, source, ip_hash,
  confirm_token_hash, confirm_expires_at, created_at, updated_at)
VALUES (${kind}, ${contactName}, ${email}, ${orgName}, ${website}, ${location}, ${verticalId}, ${verticalOther}, ${band},
  ${!!sample}, ${sample?.businessName ?? null}, ${sample?.location ?? null}, ${sample?.website ?? null}, ${sample ? 'requested' : null},
  ${source}, ${ipHash}, ${token.hash}, ${expires}::timestamptz, ${at}::timestamptz, ${at}::timestamptz)
ON CONFLICT (kind, email) DO UPDATE SET
  contact_name = CASE WHEN w.email_confirmed_at IS NULL AND w.status = 'new' THEN EXCLUDED.contact_name ELSE w.contact_name END,
  -- same CASE for org_name, website, location, vertical_id, vertical_other, client_count_band, sample_requested,
  -- sample_business_name, sample_location, sample_website, sample_status, source, ip_hash, confirm_token_hash, confirm_expires_at
  updated_at = EXCLUDED.updated_at
RETURNING id, (confirm_token_hash = ${token.hash}) AS fresh
```
   `fresh` true → `{ send: { entryId, confirmRaw: token.raw } }`; false → log `refused confirmed`, `{ send: null }`. Never log email, org or IP hash.
4. `confirmWaitlistEmail`: `UPDATE waitlist_entry SET email_confirmed_at = coalesce(email_confirmed_at, $now), updated_at = $now WHERE confirm_token_hash = hashToken(raw) AND confirm_expires_at > $now RETURNING id` — reusable until expiry (mail scanners pre-open links; mirrors `verifyIntake`); no row → `{ expired: true }`.
5. `sendWaitlistEmail('confirmation')`: platform branding `resolveBranding('Rival Monday', null)`, from `"Rival Monday" <fromAddress>`, Reply-To `support@rivalmonday.app`, tag `waitlist_confirmation`, metadata `{ waitlist: id }`, scope `{ agencyId: null, clientId: null }`, URL `${appUrl}/waitlist/confirm/${raw}`. **Follow pattern:** `packages/tools/src/intake/emails.ts` (`sendLeadEmail`, `quoteName`), template `lead-verify.tsx` (JSX pragma lines!).

**Copy (owner signs)** — subject agency **"Confirm your place in the Rival Monday pilot"**, business **"Confirm your email for Rival Monday"**. Agency body: **"Hi {contactName}, thanks for asking to join the Rival Monday pilot for {orgName}. Please confirm this is your email address so we can send your invite."** button **"Confirm my email"**; if sample: **"You also asked for a real sample brief for {sampleBusinessName}. Once you've confirmed, we'll build it from public information and email you a link when it's ready."**; **"We open places a few at a time and will email you when yours is ready. The link works for 7 days. If you didn't ask for this, ignore this email and nothing happens."** Business body: **"Hi {contactName}, thanks for your interest in weekly competitor briefs for {orgName}. Please confirm this is your email address."** button **"Confirm my email"**; **"During the pilot we work through local marketing agencies. Once you've confirmed, we'll introduce you to one that serves businesses like yours, and they'll be in touch. The link works for 7 days. If you didn't ask for this, ignore this email."**

**Tests (TDD):** `public.test.ts`: `new agency entry stores lower-cased email and returns a send`; `sample request sets sample_status requested`; `resubmit of an unconfirmed row updates details and issues a new token`; `resubmit of a confirmed row changes nothing but updated_at and returns send null`; `resubmit of an invited row returns send null`; `sixth submit from one ip hash in an hour returns send null and writes nothing`; `unknown verticalId is stored null`; `confirm is idempotent until expiry`; `expired token → expired`; `no pii in logs` (spy `console.*`: no email/ip hash/org name). Schema: `business without website and location is invalid`; `agency sample needs website or location`. `waitlist-email.test.ts`: `agency variant mentions the sample only when requested`; `business variant names no agency`; subject strings exact.
**Done when:** `pnpm --filter @cs/tools exec vitest run waitlist` and `pnpm --filter @cs/email exec vitest run waitlist-email jsx-pragma render` green. Commit `feat(tools): waitlist submit, confirm and confirmation email (phase 17a)`.

### Task 4: `POST /api/waitlist`, confirm route and page, proxy
**Goal:** the public, CORS-limited, Turnstile-checked, uniform endpoint the 17b popup posts to (spec § 5 contract), plus the confirm link.
**Files:** create `apps/web/src/app/api/waitlist/route.ts` (+ `route.test.ts`), `apps/web/src/app/waitlist/confirm/[token]/route.ts` (+ test), `apps/web/src/app/waitlist/confirmed/page.tsx` (+ test); modify `apps/web/src/proxy.ts` (+ its test), `apps/web/scripts/e2e-affected-rules.ts`.

**Route (security-sensitive — write as given):**
```ts
export const dynamic = 'force-dynamic';
const MIN_MS = 400;
const MAX_BODY = 8_192;
const cors = (origin: string) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
const forbidden = () => new Response(null, { status: 403, headers: { Vary: 'Origin' } });

export async function OPTIONS(req: Request) {
  const origin = allowedOrigin(req.headers.get('origin'), webEnv().siteOrigins);
  return origin ? new Response(null, { status: 204, headers: cors(origin) }) : forbidden();
}

export async function POST(req: Request) {
  const started = Date.now();
  const env = webEnv();
  const origin = allowedOrigin(req.headers.get('origin'), env.siteOrigins);
  if (!origin) return forbidden();
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { ...cors(origin), 'Cache-Control': 'no-store' } });
  const floor = async () => { const wait = MIN_MS - (Date.now() - started); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); };
  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY) return reply(400, { ok: false, error: 'invalid' });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return reply(400, { ok: false, error: 'invalid' }); }
  const parsed = waitlistSubmitSchema.safeParse(body);
  if (!parsed.success) return reply(400, { ok: false, error: 'invalid' });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ok = await verifyTurnstile(parsed.data.turnstileToken, ip, { envName: activeEnvName(), turnstileSecretKey: env.turnstile?.secretKey });
  if (!ok) { await floor(); return reply(400, { ok: false, error: 'check' }); }
  const deps = toolDeps();
  try {
    const r = await submitWaitlistEntry(deps, { ...parsed.data, ipHash: hashIp(ip ?? 'unknown', env.authSecret) }, new Date());
    const send = r.send;
    if (send && deps.leadEmail) {
      const mail = { service: deps.service, ...deps.leadEmail };
      // After the response: send latency must not tell an accepted request from a refused one.
      after(async () => {
        try { await sendWaitlistEmail(mail, send.entryId, 'confirmation', { confirmRaw: send.confirmRaw }); }
        catch (e) { console.error(`[waitlist] confirmation email failed: ${e instanceof Error ? e.name : typeof e}`); }
      });
    }
  } catch (e) {
    console.error(`[waitlist] submit failed: ${e instanceof Error ? e.name : typeof e}`);
  }
  await floor();
  return reply(200, { ok: true });
}
```
**Behaviour:**
- Confirm route `GET /waitlist/confirm/[token]`: `confirmWaitlistEmail` → redirect `/waitlist/confirmed` (or `/waitlist/confirmed?expired=1`); `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. **Follow pattern:** `apps/web/src/app/start/verify/[token]/route.ts`.
- `/waitlist/confirmed`: `AuthCard` with `defaultBranding`, `robots: { index: false }`; no `PageHeader` (public, like `/start/verify`).
- `proxy.ts` `PUBLIC` += `/^\/api\/waitlist$/`, `/^\/api\/site-status$/`, `/^\/waitlist\//`, `/^\/sample\//`; `NO_REFERRER` += `/^\/(?:waitlist\/confirm|sample)\//`.
- e2e-affected rules: `app/api/waitlist/`, `app/waitlist/` → `['@waitlist']`; add `'@waitlist'` to `KNOWN_TAGS`.

**Copy (owner signs)** — confirmed: title **"You're confirmed"**, body **"Thanks — your email is confirmed and your place on the list is saved. We'll be in touch at this address, usually within a few working days."** Expired: title **"This link has expired"**, body **"Confirmation links work for 7 days, and only the newest one works. Sign up again on rivalmonday.com and we'll send you a fresh link."** (link text "rivalmonday.com" → `siteJoinUrl`).

**Tests (TDD)** `route.test.ts` (mock `submitWaitlistEntry`, `verifyTurnstile`, `after`, timers): `cors: OPTIONS from SITE_ORIGIN → 204 with exact ACAO`; `cors: POST without Origin or from another origin → 403 and nothing submitted`; `invalid json / schema → 400 invalid, nothing submitted`; `turnstile fail → 400 check, nothing submitted`; `uniform response: accepted, refused (send null) and submit throwing all → 200 {ok:true}` with identical headers; `takes at least 400 ms`; `confirmation email queued only when send is returned`; `no pii in logs`. Proxy test: the four paths pass without a session. Confirm route: `valid → /waitlist/confirmed, expired → ?expired=1, no-store + no-referrer`.
**Done when:** web `vitest run api/waitlist waitlist proxy` and `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` green. Commit `feat(web): public waitlist endpoint and email confirmation (phase 17a)`.

### Task 5: Verifier tally (`brief.claims_checked`)
**Goal:** every stored brief records how many model-written sentences the verifier checked.
**Files:** modify `packages/engine/src/briefs/{verify.ts,generate.ts,starting-point.ts}` (+ `verify.test.ts`, `generate.test.ts`, `starting-point.test.ts`).
**Interfaces:** `verifyText(...)` returns `{ kept: string; dropped: number; checked: number }` (`checked = sentences.length`); `VerifiedBrief` gains `checked: number` (Σ over every `verifyText` call in `verifyDraft`, summary included). `generateBrief` writes `claimsChecked: verified.checked` (0 when nothing was selected); `starting-point.ts` writes `claimsChecked` = Σ `sentences.length` of the why-it-matters pass **only when the pass completed** (same rule as `droppedSentences`; a failed pass counts 0), template facts excluded.
**Behaviour:** alert writer and recommendations (`alerts/write.ts`, `recommendations.ts`) ignore the new field (no storage). No change to `dropped` semantics or the AM fact-check display.
**Tests (TDD):** `tally: verifyText reports checked = all sentences, dropped = removed`; `tally: verifyDraft sums checked across fields and summary, including items that failed`; `tally: stored ready brief has claims_checked = verified.checked`; `tally: starting point counts why-sentences only and 0 after a failed writer pass`.
**Done when:** `cd packages/engine && npx vitest run briefs/verify briefs/generate briefs/starting-point` green. Commit `feat(engine): record checked claims per brief (phase 17a)`.

### Task 6: `GET /api/site-status`
**Goal:** pilot flag + honest public counters for the site.
**Files:** create `packages/tools/src/waitlist/site-status.ts` (+ test), `apps/web/src/app/api/site-status/route.ts` (+ test); modify `packages/tools/src/index.ts`, `apps/web/scripts/e2e-affected-rules.ts`.
**Interfaces:**
```ts
export const COUNTER_FLOOR = 10;
export interface SiteStatus { pilotMode: boolean; counters: { rivalSitesWatched: number | null; snapshotsThisWeek: number | null; claimsChecked: number | null; claimsDropped: number | null } | null }
export function publicCount(n: number): number | null {
  if (!Number.isFinite(n) || n < COUNTER_FLOOR) return null;
  const whole = Math.floor(n);
  if (whole < 100) return Math.floor(whole / 10) * 10;
  const step = 10 ** (String(whole).length - 2); // 2 significant digits, rounded down
  return Math.floor(whole / step) * step;
}
export async function siteStatus(service: Db, now: Date): Promise<SiteStatus>;
```
**Counter query** (one statement; `$since` = `now - 7 days` as `::timestamptz`; `<serviceable>` = `agencyServiceable(sql.raw('c.agency_id'))`):
```sql
WITH sample AS (SELECT (value->>'agencyId')::uuid AS id FROM platform_setting WHERE key = 'sample_agency_id'),
live AS (SELECT c.id FROM client c WHERE c.status = 'active' AND c.paused_at IS NULL AND c.archived_at IS NULL
           AND <serviceable> AND c.agency_id IS DISTINCT FROM (SELECT id FROM sample)),
recent AS (SELECT b.claims_checked, (b.dropped->>'sentences')::int AS dropped FROM brief b
           JOIN client c ON c.id = b.client_id AND c.archived_at IS NULL
           JOIN agency a ON a.id = b.agency_id AND a.archived_at IS NULL
           WHERE b.generated_at > $since AND b.claims_checked IS NOT NULL AND b.agency_id IS DISTINCT FROM (SELECT id FROM sample))
SELECT
  (SELECT count(DISTINCT cc.competitor_id) FROM client_competitor cc JOIN live l ON l.id = cc.client_id)::int AS rivals,
  (SELECT count(*) FROM capture cp WHERE cp.status IN ('ok','unchanged') AND cp.captured_at > $since
     AND EXISTS (SELECT 1 FROM client_competitor cc JOIN live l ON l.id = cc.client_id WHERE cc.competitor_id = cp.competitor_id))::int AS snapshots,
  (SELECT coalesce(sum(claims_checked), 0) FROM recent)::int AS checked,
  (SELECT coalesce(sum(dropped), 0) FROM recent)::int AS dropped
```
**Behaviour:** `pilotMode` read separately (never fails the response: error → `false` + log). Query error → `counters: null` + `console.error('[site-status] counters failed', name)`. Route: `GET` only, `dynamic = 'force-dynamic'`, headers `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`, `Access-Control-Allow-Origin: *` (P6), JSON body exactly `SiteStatus`.
**Tests (TDD):** `publicCount`: `9 → null, 10 → 10, 87 → 80, 100 → 100, 1234 → 1200, 98765 → 98000, NaN → null`. `siteStatus`: `counts tracked rivals of active clients once each`; `excludes paused, archived and prospect clients`; `excludes the sample agency` (seed `sample_agency_id`); `snapshots count only 7 days and only tracked competitors`; `claims sums only briefs with claims_checked and generated in 7 days`; `output has no ids or names` (keys exact). Route: `sets cache and ACAO headers`, `counters null when the query throws`.
**Done when:** `pnpm --filter @cs/tools exec vitest run site-status` and web `vitest run api/site-status` green. Commit `feat: public site status and counters (phase 17a)`.

### Task 7: `list_waitlist`, nav badge, `/platform/waitlist` page, help
**Goal:** operators see Agencies / Businesses / Sample requests with the "new" count in the nav.
**Files:** create `packages/tools/src/tools/platform-waitlist.ts` (+ test), `packages/tools/src/waitlist/estimate.ts` (+ test), `apps/web/src/app/(platform)/platform/waitlist/{page.tsx,waitlist-table.tsx}` (+ tests), `docs/help/pages/platform.waitlist.operator.md`; modify `packages/tools/src/tools/{all.ts,nav-counts.ts}`, `packages/tools/src/billing-guard.ts` (`PLATFORM_TOOLS` += `platformWaitlistTools`), `packages/tools/src/isolation/fixtures.ts`, `apps/web/src/server/nav.ts`, `apps/web/src/components/shell/{nav-items.ts,nav-link.tsx}` (icon `waitlist: ClipboardList`), `apps/web/src/lib/labels.ts`, `apps/web/src/help/copy/platform.ts`, `apps/web/scripts/e2e-affected-rules.ts`.
**Interfaces:**
```ts
// list_waitlist: read, viewer, audit 'skip-web', supportMask ['entries[].email']
input: z.object({ kind: z.enum(WAITLIST_KINDS).optional(), status: z.enum(WAITLIST_STATUSES).optional(), sample: z.boolean().optional(),
  q: z.string().trim().max(120).optional(), cursor: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() })
output: { entries: WaitlistEntryView[]; nextCursor; prevCursor; total: number;
  counts: { agencyNew: number; businessNew: number; sampleRequested: number };
  sampleMonth: { used: number; limit: number }; estimate: { discoveryCapUsd: number; startingPointAvgUsd: number | null; basedOn: number } }
WaitlistEntryView = { id, kind, status, contactName, email, orgName, website, location, verticalId, verticalOther, clientCountBand,
  emailConfirmed: boolean, source, createdAt: iso, decidedAt: iso | null,
  sample: { businessName, location, website, status: SampleStatus, clientId: uuid | null,
            stage: 'setup' | 'generating' | 'review' | 'ready_to_send' | 'sent' | null, sentAt: iso | null } | null }
export const waitlistNewWhere: SQL;  // status='new' AND email_confirmed_at IS NOT NULL (badge + counts share it)
// get_platform_nav_counts output += waitlist: n  (= confirmed new entries + sample_status 'requested' with confirmed email)
// estimate.ts
export const SAMPLE_DISCOVERY_CAP_USD = 3; // Phase 12: $3 per discovery run (root CLAUDE.md § Decisions)
export async function sampleCostEstimate(service: Db): Promise<{ discoveryCapUsd: number; startingPointAvgUsd: number | null; basedOn: number }>;
```
**Behaviour:**
- `sample: true` = rows with `sample_requested`; `q` = case-insensitive match on org name, contact name, email or sample business. Newest first, 25/page (`pageOf`/`pageResult`/`prevCursorOf`). `stage` derived from the sample client's `kind='starting_point'` brief: none → `setup`, `generating|failed` (attempts left) → `generating`, `ready` → `review`, `approved` → `ready_to_send`, status `sent` row → `sent`; null unless `sample_status = 'approved'|'sent'`.
- `sampleMonth.used` = rows with `sample_approved_at >= date_trunc('month', now() AT TIME ZONE 'UTC')`.
- Estimate SQL (P15): `SELECT avg(spend), count(*) FROM (SELECT b.client_id, (SELECT coalesce(sum(cost_usd),0) FROM llm_call WHERE client_id = b.client_id AND created_at <= b.generated_at) + (SELECT coalesce(sum(cost_usd),0) FROM vendor_call WHERE client_id = b.client_id AND created_at <= b.generated_at) AS spend FROM brief b WHERE b.kind = 'starting_point' AND b.status IN ('approved','sent') ORDER BY b.generated_at DESC LIMIT 20) t` (`::float8`, round to cents; count 0 → null).
- Page (L1, `PageHeader` title "Waitlist", breadcrumb Platform › Waitlist, `helpKey 'page:platform.waitlist'`): `TabsLink` tabs Agencies (`?tab=agencies`, default) / Businesses / Sample requests, each with its new count; search box; `Table` with a checkbox column (Agencies tab only), columns Name+org, Email (+ "Not confirmed" `Tag` when unconfirmed), Detail (band / type / sample business), Status (`StatusChip` from `WAITLIST_STATUS`/`SAMPLE_STATUS` labels), Joined (date), Actions (filled in by Tasks 8–11). Sample tab header line: "This month: {used} of {limit} sample briefs" + "Estimated cost per sample: discovery up to $3.00 + starting point about ${avg} (average of the last {n})" or "No history yet". Empty states via `EmptyState`. Nav: Customers section, after "Lead pool": `add('/platform/waitlist', 'Waitlist', 'waitlist', { count: counts.waitlist })`.
- Labels: `WAITLIST_STATUS` (`new` "New" info, `invited` "Invited" success, `assigned` "Assigned" success, `declined` "Declined" neutral), `SAMPLE_STATUS` (`requested` "Requested" warning, `approved` "In progress" info, `sent` "Sent" success, `declined` "Declined" neutral, `failed` "Stopped" danger), `SAMPLE_STAGE` (`setup` "Set up the client", `generating` "Brief being built", `review` "Brief ready to review", `ready_to_send` "Ready to send", `sent` "Sent").
- Help: `PAGE_COPY['platform.waitlist']` + tips `about` / `sample`; guide file with front matter `help_key: page:platform.waitlist`, `audience: operator`, `title: Waitlist`. **Follow pattern:** `platform/leads/page.tsx`, `docs/help/pages/platform.leads.operator.md`, `help/copy/platform.ts` `'platform.leads'`.

**Copy (owner signs)** — description **"People who joined the pilot waitlist from rivalmonday.com. Invite agencies, pass businesses to an agency and build sample briefs."**; tip *About the list* **"Only entries whose email address is confirmed can be invited, assigned or given a sample. Unconfirmed entries are shown so you can see demand."**; tip *Sample briefs* **"Approving a sample creates the business in the Rival Monday Samples agency and opens its setup. Run setup as usual, approve the starting point in Approvals, then press Send sample here."** Guide sections "What this page tells you / How to use it / Common questions" in the leads guide's style (Task 12 sign-off).

**Tests (TDD):** tool: `viewer may list, non-operator → not_found`; `filters by kind, status, sample and q`; `masks email in a support-audited context` (supportMask path present); `stage derived from the starting point`; `counts and badge agree` (`waitlistNewWhere` shared); `sampleMonth counts this UTC month only`. `estimate.test.ts`: `null with no history`, `average of last 20`. Web: `page renders tabs with counts and 404s for non-operators`; `nav shows Waitlist with badge for operators only` (`nav-items.test.ts`); `help coverage` passes (`help/coverage.test.ts`).
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-waitlist estimate nav-counts isolation access-marks` and web `vitest run waitlist nav-items help` green; `bash scripts/design-lint.sh` 0; `pnpm kb:seed` (if your local dev DB is set up) loads the guide. Commit `feat: platform waitlist page and list tool (phase 17a)`.

### Task 8: Agency invites (single + bulk) and decline
**Goal:** "Send pilot invite" / "Send trial invite" for selected confirmed agency rows, emailed per row; Decline.
**Files:** modify `packages/tools/src/tools/platform-billing.ts` (extract `insertInviteLink`), `packages/tools/src/tools/platform-waitlist.ts` (+ test), `packages/tools/src/isolation/fixtures.ts`, `packages/tools/src/tools/access-marks.test.ts`, `apps/web/src/app/(platform)/platform/waitlist/{actions.ts,waitlist-table.tsx}` (+ tests).
**Interfaces:**
```ts
// platform-billing.ts — the body of create_invite_link after operate(), unchanged behaviour, no audit of its own
export async function insertInviteLink(deps: ToolDeps, ctx: AccessContext, input: { offer: 'pilot' | 'trial'; pilotEndsAt?: string; emailLock?: string;
  maxUses: number; expiresInDays: number; note?: string; discountCodeId?: string }): Promise<{ id: string; url: string; token: string; expiresAt: Date }>;
// invite_waitlist_agencies: write, staff, supportMask ['results[].email']
input: z.object({ ids: z.array(z.string().uuid()).min(1).max(50), offer: z.enum(['pilot', 'trial']), pilotEndsAt: z.string().datetime().optional() })
output: { results: Array<{ id: string; outcome: 'invited' | 'skipped'; reason?: 'not_found' | 'not_agency' | 'not_new' | 'unconfirmed';
  email?: string; url?: string; expiresAt?: string }> }
// decline_waitlist_entry: write, staff; input { id: uuid } → { ok: true }
// web
export async function inviteAgenciesAction(prev: InviteResult, fd: FormData): Promise<InviteResult>;
type InviteResult = { ok: false; error: string } | { ok: true; message: string; failed: { orgName: string; url: string }[] } | null;
```
**Behaviour:**
- Pilot offer needs `pilotEndsAt`; validated once with `pilotLinkRefusal` before any row. Each row in one transaction per row (`FOR UPDATE`): kind `agency`, status `new`, confirmed → `insertInviteLink({ offer, pilotEndsAt, emailLock: email, maxUses: 1, expiresInDays: 14, note: 'waitlist' })`, then `status='invited', invite_link_id, decided_at, decided_by`. Others are skipped with their reason. Duplicate ids collapse. One `withPlatformAudit` row for the call.
- `decline_waitlist_entry`: only `status='new'` (any kind) → `declined` (+ `sample_status='declined'` if it was `requested`); else `ToolError('conflict', 'This entry was already handled.', { userFacing: true })`. No email (spec C).
- Web action: `runTool(ctx, 'invite_waitlist_agencies', …)`, then for each `invited` row `sendAgencyInviteEmail({ to: email, url, offer, pilotEndsAt, expiresAt })` sequentially; a failure collects `{ orgName, url }` (log failure class only). Message **"Invited {n}. Skipped {m} (not confirmed or already handled)."** plus, when any failed, **"These emails failed — copy each link and send it yourself:"** with the links. Result state hoisted to an always-mounted component (web gotcha: survives `revalidatePath`). **Follow pattern:** `createInviteLinkAction` (`platform/billing/actions.ts`).
- UI: `BulkBar` (from `@cs/ui`) appears with ≥ 1 checked row: date input "Pilot ends" + buttons **"Send pilot invite"** / **"Send trial invite"**; unconfirmed / non-new rows have no checkbox. Row action **Decline** via `ConfirmDialog` (+ row-keyed result line) for `new` rows. `WriteGuard` on all; hidden for viewers.
**Tests (TDD):** `insertInviteLink` keeps `create_invite_link` tests green; `skips unconfirmed, non-agency and non-new rows with reasons`; `creates one email-locked single-use link per row and marks invited`; `pilot without pilotEndsAt → invalid_input before any row`; `51 ids → invalid_input`; `staff only (viewer → permission_denied)`; `decline twice → conflict`. Web: `action emails each invited row and lists failed links`; `bulk bar only for confirmed new rows`.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-waitlist platform-billing isolation access-marks` and web `vitest run waitlist` green. Commit `feat: waitlist agency invites and decline (phase 17a)`.

### Task 9: Platform place lookup and business assignment
**Goal:** Assign a confirmed business to an agency with its picked Google listing; the agency gets the 11c "new lead" email.
**Files:** modify `packages/tools/src/tools/platform-leads.ts` (extract `assignPoolLeadTx`), `packages/tools/src/tools/platform-waitlist.ts` (+ test), `packages/tools/src/isolation/fixtures.ts`, `access-marks.test.ts`; create `apps/web/src/app/(platform)/platform/waitlist/{place-lookup.tsx,assign-dialog.tsx}` (+ tests); modify `actions.ts`, `waitlist-table.tsx`.
**Interfaces:**
```ts
// platform-leads.ts — assign_lead's transaction body, unchanged behaviour (twin check, decided_* reset)
export async function assignPoolLeadTx(tx: Tx, ctx: AccessContext, leadId: string, agencyId: string, now: Date): Promise<void>;
// platform_find_business: write (paid vendor call), staff, input { name: 1..120, location: 2..120 } →
//   { places: Array<SetupLookup & { possibleDuplicate: boolean; suggestedVerticalId: string | null }> } (≤ 5)
// assign_waitlist_business: write, staff
input: z.object({ id: z.string().uuid(), agencyId: z.string().uuid(), lookup: intakeLookupSchema })
output: { leadId: string }
```
**Behaviour:**
- `platform_find_business`: refuses under `ctx.support`; `hitRate(service, 'platform-lookup:'+ctx.userId, 'day', 50)` false → `ToolError('rate_limited', "You've reached today's limit of 50 business searches.", { userFacing: true })`; calls `deps.setupLookup(…, { agencyId: null, clientId: null })`; same filtering as `find_business` (`collapseSameListing`, `possibleDuplicates`, `preselectVertical`).
- `assign_waitlist_business` (one transaction): lock the entry (`kind='business'`, `status='new'`, confirmed, else `not_found`/`conflict` "Only confirmed new entries can be assigned."); reuse an existing pool lead with the same `lower(email)` + `lookup->>'placeId'` (`agency_id IS NULL`, status `unverified|verified`) or insert one: `source 'platform'`, `status 'verified'`, `ref 'waitlist'`, `contact_name`, `email`, `lookup`, `verified_at = email_confirmed_at`, `ip_hash`; then `assignPoolLeadTx(tx, ctx, leadId, agencyId, now)`; entry `status='assigned', lead_id, decided_*`. After commit `sendAfterCommit(deps, leadId, 'agency_new')`.
- `PlaceLookup` client component: name (prefilled with org name) + city/ZIP (prefilled with location) + Search → radio list of up to 5 places (title, address, "Possible duplicate" `Tag`); the picked place travels as JSON in a hidden field. Assign dialog: lookup + agency `Select` (default = the operator's home agency `ctx.agencyId` when present in the list) → `assignBusinessAction`. **Follow pattern:** `(onboarding)/agency/clients/new/find-step.tsx`, `platform/leads/assign-form.tsx`.
**Copy (owner signs):** dialog title **"Assign {orgName} to an agency"**, help **"Find the business's Google listing, then pick the agency. The agency is emailed and sees it under Leads."**; success **"Assigned to {agencyName}."**
**Tests (TDD):** `assignPoolLeadTx` keeps `assign_lead` tests green; `refuses unconfirmed`; `creates a verified pool lead and assigns it in one transaction` (no pool-visible row afterwards); `reuses an identical pool lead`; `agency twin → conflict, entry unchanged`; `sends agency_new after commit`; `platform_find_business is ledgered with agencyId null and capped at 50/day`. Web: `assign dialog posts the picked place and agency`.
**Done when:** `pnpm --filter @cs/tools exec vitest run platform-waitlist platform-leads isolation access-marks` and web `vitest run waitlist` green. Commit `feat: assign waitlisted businesses to agencies (phase 17a)`.

### Task 10: Sample space and `decide_sample_brief`
**Goal:** Approve creates the sample client in the Samples agency and opens its setup; Decline/Stop; the sample agency can never email a client and stays out of the spike guard.
**Files:** create `packages/tools/src/waitlist/sample.ts` (+ test), `apps/web/src/app/(platform)/platform/waitlist/sample-dialog.tsx` (+ test); modify `packages/tools/src/tools/platform-waitlist.ts`, `packages/tools/src/tools/setup.ts` (`invite_client_owner`), `packages/tools/src/tools/settings.ts` (`add_client_recipient`, `invite_member` client roles), `packages/tools/src/spend-guard.ts` (`readSpikes`), fixtures, access-marks, `actions.ts`, `waitlist-table.tsx`.
**Interfaces:**
```ts
// waitlist/sample.ts
export const SAMPLE_AGENCY_NAME = 'Rival Monday Samples';
export async function ensureSampleAgency(tx: Tx, deps: ToolDeps, actorId: string): Promise<string>;
export async function ensureOperatorMembership(tx: Tx, agencyId: string, userId: string): Promise<void>;
export async function isSampleAgency(db: Db, agencyId: string): Promise<boolean>; // via sampleAgencyId (waitlist/settings.ts)
export const SAMPLE_NO_CONTACTS = 'Sample businesses have no owner or recipients. Skip this step.';
// decide_sample_brief: write, staff
input: z.object({ id: z.string().uuid(), approve: z.boolean(), lookup: intakeLookupSchema.optional(), verticalId: z.string().max(40).optional() })
  .superRefine((v, c) => { if (v.approve && (!v.lookup || !v.verticalId)) c.addIssue({ code: 'custom', message: 'Pick the listing and business type.' }); })
output: { status: SampleStatus; clientId: string | null; setupUrl: string | null }
```
**Behaviour:**
- `ensureSampleAgency` (inside the caller's tx, idempotent under concurrency: `SELECT … FROM platform_setting WHERE key = 'sample_agency_id' FOR UPDATE`, else insert): `agency` `{ name: SAMPLE_AGENCY_NAME, branding: null }`, `ensureAgencyRunbook(tx, id, await catalogOf(deps).generic())`, `ensureExemptPilot(tx, id)` (widen its `db` parameter to accept a `Tx` if the types refuse), **no** `agency_onboarding` row, then the setting row (`updated_by` = actor). **Follow pattern:** `completePendingSignups` (`access/signup-complete.ts:83`).
- `ensureOperatorMembership`: if no `membership(userId, agencyId, client_id null)`: read the operator's email from `auth."user"`, `addContact(tx, { agencyId, clientId: null, role: 'agency_admin', email, name, clientScope: null, userId })`, insert `membership` role `agency_admin`, `created_by` = userId.
- Approve (one tx, `FOR UPDATE`): entry must be `kind='agency'`, confirmed, `sample_status='requested'` (else `not_found` / `conflict` "Only confirmed requests can be approved."); monthly count (`sample_approved_at` this UTC month) `>= sampleBriefMonthlyLimit` → `ToolError('conflict', "This month's sample limit ({n}) is used up. Raise it on Billing & plans or wait until next month.", { userFacing: true })`; `ensureSampleAgency` → `ensureOperatorMembership(tx, id, ctx.userId)` → `createClientCore(tx, deps, platformAgencyCtx(ctx, sampleId), { name: lookup.title.slice(0,120), verticalId, services: [], keywords: [], serviceArea: null, placeId: null, features: [], status: 'active', lookup })` → entry `sample_status='approved', sample_client_id, sample_approved_at, decided_*`. After commit: `afterCommit()`. Returns `setupUrl: '/c/<clientId>/setup'`.
- Reject: `requested` → `declined`; `approved` → `failed` and pause the sample client (`paused_at = now`, service role); `sent|declined|failed` → conflict.
- Contacts refused: `invite_client_owner`, `add_client_recipient`, and `invite_member` with a client role throw `ToolError('invalid_input', SAMPLE_NO_CONTACTS, { userFacing: true })` when `isSampleAgency(deps.service, ctx.agencyId)`.
- `readSpikes`: `sumLlm` adds `llm_call.agency_id IS DISTINCT FROM <sampleId>` and the client count `n` excludes the sample agency's clients, when a sample agency exists.
- UI (Sample requests tab, staff): row actions **Approve** (sample dialog: request details, the estimate line, `PlaceLookup` prefilled with sample business + location, business-type `Select` from `verticalOptions()` preselected by `suggestedVerticalId`, button **"Approve and open setup"**) → on success the browser navigates to `setupUrl`; **Decline** (`requested`) / **Stop** (`approved`) via `ConfirmDialog`; an `approved` row shows its stage and an **"Open setup"** link (`/c/<clientId>/setup`) while stage is `setup`, **"Review brief"** (`/agency/approvals`) while `review`.
**Copy (owner signs):** dialog title **"Build a sample brief for {sampleBusinessName}"**; body **"This creates the business in the Rival Monday Samples agency and opens its setup. Confirm the area and tick the rivals as usual, then approve the starting point in Approvals. Nothing is emailed to the business."**; Stop confirm **"Stop this sample? The business is paused and no link is sent."**
**Tests (TDD):** `sample.test.ts`: `ensureSampleAgency creates one agency once (two concurrent calls → one id)`; `sample agency is an exempt pilot with no onboarding row`; `membership created once for the operator with an agency contact`. Tool: `refuses unconfirmed`; `refuses over the monthly limit with the limit in the message`; `approve creates an active client with the lookup and returns the setup url`; `reject requested → declined; approved → failed and client paused`; `viewer → permission_denied`. `sample agency refuses contacts` (three tools). `spike excludes sample` (sample-agency llm spend does not raise `observedUsd`). Web: `approve navigates to the setup url`.
**Done when:** `pnpm --filter @cs/tools exec vitest run waitlist platform-waitlist spend-guard setup settings isolation access-marks` and web `vitest run waitlist` green. Commit `feat: sample brief space and approval (phase 17a)`.

### Task 11: Sample link, `send_sample_brief`, `/sample/<token>` page and evidence
**Goal:** the requester gets a 30-day read-only link to the starting point and its evidence; the sample client is paused.
**Files:** create `packages/tools/src/waitlist/sample-token.ts` (+ test), `packages/email/src/templates/sample-brief-ready.tsx`, `apps/web/src/app/sample/[token]/page.tsx` (+ test), `apps/web/src/app/sample/[token]/evidence/[evidenceId]/route.ts` (+ test); modify `packages/tools/src/waitlist/{sample.ts,emails.ts}`, `packages/tools/src/tools/platform-waitlist.ts`, `packages/tools/src/deps.ts` (`sampleLinkSecret?: string`), `apps/web/src/server/tools.ts` (wire `webEnv().authSecret`), `packages/email/src/{render,types}.ts`, `apps/web/src/components/{views/brief-view.tsx,evidence-chips.tsx}` (optional `evidenceHref?: (id: string) => string`), fixtures, access-marks, `waitlist-table.tsx`, `actions.ts`, e2e rules.
**Token (security-sensitive — write as given):**
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
export const SAMPLE_LINK_TTL_MS = 30 * 86_400_000;
const keyOf = (secret: string) => createHmac('sha256', secret).update('rm-sample-brief-v1', 'utf8').digest();
const macOf = (body: string, secret: string) => createHmac('sha256', keyOf(secret)).update(body, 'utf8').digest();
const TOKEN_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-z]{1,12})\.([A-Za-z0-9_-]{43})$/;
export function signSampleToken(entryId: string, expMs: number, secret: string): string {
  const body = `${entryId}.${expMs.toString(36)}`;
  return `${body}.${macOf(body, secret).toString('base64url')}`;
}
export function verifySampleToken(token: string, secret: string, now: Date): { entryId: string; expMs: number } | null {
  if (!secret || token.length > 120) return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const expMs = parseInt(m[2]!, 36);
  if (!Number.isSafeInteger(expMs) || expMs <= now.getTime()) return null;
  const want = macOf(`${m[1]}.${m[2]}`, secret);
  const got = Buffer.from(m[3]!, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want) ? { entryId: m[1]!, expMs } : null;
}
```
**Interfaces:**
```ts
// send_sample_brief: write, staff; input { id: uuid } → { url: string; expiresAt: string; emailed: boolean }   (supportMask none: no email key)
// waitlist/sample.ts (public reads, service role)
export async function getSampleBrief(deps: Pick<ToolDeps, 'service' | 'app'>, token: string, secret: string, now: Date)
  : Promise<{ brief: BriefDetail; businessName: string; timezone: string; expiresAt: string; refs: EvidenceRef[] } | null>;
export async function sampleEvidenceKey(service: Db, token: string, secret: string, evidenceId: string, now: Date)
  : Promise<{ objectKey: string; kind: 'screenshot' | 'text' } | null>;
// email payload
{ template: 'sample_brief_ready'; props: { branding: Branding; contactName: string; businessName: string; url: string; expiresAt: string } }
```
**Behaviour:**
- `send_sample_brief`: entry `sample_status IN ('approved','sent')`, sample client's starting point `status IN ('approved','sent')` (else `conflict` **"The starting point isn't approved yet. Approve it in Approvals first."**); no `deps.sampleLinkSecret`/`appUrl` → `internal` naming `APP_URL`/auth secret. In one tx: `sample_status='sent'`, `sample_sent_at=now`, client `paused_at = coalesce(paused_at, now)`. URL `${appUrl}/sample/${signSampleToken(id, now+TTL, secret)}`. After commit `sendWaitlistEmail(..., 'sample_ready', { sampleUrl, expiresAt })` inside try: failure → `emailed: false` (web shows **"Link created, but the email failed — copy the link below."** with the link, like invites).
- `getSampleBrief`: `verifySampleToken` → entry with `sample_status='sent'` and `sample_client_id` → the client's `starting_point` brief with status `approved|sent` → `briefDetail({ app: deps.app } as ToolDeps, readerCtx, briefId)` where `readerCtx = createAccessContext({ agencyId, userId: 'sample-link', role: 'client_viewer', clientScope: [clientId], features: [] })` is built **only inside this function** and never leaves it (client role ⇒ active items only, `upsellTag` null). `refs` = evidence → capture → competitor rows for the ids cited by the active items (`channelLabel(capture.source)`). Any miss → `null`.
- `sampleEvidenceKey`: same token/row/brief checks; `evidenceId` must be in the active items' `evidenceIds`; `evidence.kind` must be `screenshot|text` (`evidenceContentType`); else `null`.
- Page `/sample/[token]` (public, outside the app shell, `dynamic = 'force-dynamic'`, `metadata.robots = { index: false, follow: false }`): `null` → `notFound()`. L5 680 px reading column on canvas: `Wordmark`, eyebrow `Tag` "Sample brief", `h1`, intro line, `BriefView brief agency={false} surface="reading" titled={false} refs={…} evidenceHref={(id) => '/sample/'+token+'/evidence/'+id}`, footer note. No Ask, no nav, no links into the app.
- Evidence route: `sampleEvidenceKey` → `webStore(env).get(key)` → `200` with `content-type` from `evidenceContentType`, `x-content-type-options: nosniff`, `cache-control: private, no-store`, `content-disposition: inline`, `Referrer-Policy: no-referrer`; anything else `404 'Not found'`. **Follow pattern:** `serveEvidence` (`apps/web/src/server/files.ts:116`).
- Waitlist UI: `ready_to_send`/`sent` rows get **"Send sample"** / **"Send again"** (shows the link in the result line).
**Copy (owner signs)** — email subject **"Your sample brief for {businessName} is ready"**; body **"Hi {contactName}, here is the sample starting-point brief we built for {businessName} from public information."** button **"Open the sample brief"**; **"Every statement in it links to the evidence it came from. This is what a client gets in their first week, sent under your agency's name and branding. The link works until {expiresAt}. Questions, or ready to start? Just reply to this email."** Page: eyebrow **"Sample brief"**, h1 **"Starting point for {businessName}"**, intro **"Prepared by Rival Monday from public information. Every claim links to the evidence behind it."**, footer **"This is the first brief your clients would get, under your agency's brand. This link works until {date}."**
**Tests (TDD):** `sample-token.test.ts`: `round trip`; `token: tampered mac / entry id / expiry → null`; `token: expired → null`; `token: other secret → null`; `token: overlong or malformed → null`. `getSampleBrief`: `null unless the entry is sent`; `returns only active items, no upsell tag`; `null for a starting point that is not approved`. `sampleEvidenceKey`: `evidence not cited → null`; `html/vendor_json → null`. Tool: `send refuses before approval`; `send sets sent, pauses the client and returns a verifiable url`; `email failure → emailed false, state kept`. Web: `page 404s on a bad token`; `page renders the brief with sample evidence links and no app links`; `evidence route serves cited screenshot, 404 otherwise, headers exact`; email template subject/body test.
**Done when:** `pnpm --filter @cs/tools exec vitest run sample platform-waitlist isolation access-marks`, `pnpm --filter @cs/email exec vitest run waitlist-email jsx-pragma`, web `vitest run sample brief-view evidence-chips waitlist` green. Commit `feat: sample brief link and public sample page (phase 17a)`.

### Task 12: Copy sign-off, E2E, docs, owner steps
**Goal:** one file the owner signs; an E2E spec over the new pages; branch docs current.
**Files:** create `docs/archive/phase-17a-copy-signoff.md`, `apps/web/e2e/waitlist.spec.ts`; modify `apps/web/e2e/seed.ts` (confirmed agency + business rows, `pilot_mode` off by default), `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md` (rows for the 10 new tools), `docs/work/phase-17.md`.
**Behaviour:**
- Sign-off file: every string marked **(owner signs)** in Tasks 2–4, 7–11, grouped by surface (sign-up, confirmed page, emails ×3 variants, waitlist page + guide + tips, dialogs, sample page), each with its source path, plus "Reused 11c lead emails in the waitlist context" (`lead_new` to the agency: check it reads right for a business that came from the waitlist) — owner marks ✓/edit. **Follow pattern:** `docs/archive/phase-15c1-copy-signoff.md`.
- `waitlist.spec.ts` (tags `@waitlist`, `@platform`): operator opens `/platform/waitlist`, sees both seeded rows, selects the agency row and sends a trial invite (result line "Invited 1."); Businesses tab shows the business; `/sample/not-a-token` → 404; `/sign-up` with `pilot_mode` on (seeded per test, reset after) shows "Rival Monday is in pilot"; `POST /api/waitlist` from a disallowed origin → 403 (`request.post`). Reuse the operator storage state; no new magic-link sign-in.
- Work file: Interfaces (table, settings keys, routes, tools, env), Decisions P1–P15 summary, Owner verification steps (below), Next = final review.
- **Owner verification steps** (into the work file): (1) add `SITE_ORIGIN=https://rivalmonday.com` (+ preview origins in `SITE_ORIGIN_EXTRA`) on Vercel and in `.env` yourself; (2) add `rivalmonday.com` (+ `www`) to the Turnstile widget's hostnames; (3) `pnpm db:migrate`; turn Pilot mode on at `/platform/billing`, open `/sign-up` in a private window → pilot message; (4) `curl -X POST <app>/api/waitlist -H 'Origin: https://rivalmonday.com' -H 'content-type: application/json' -d '{…agency json with "turnstileToken":"x"…}'` in dev without Turnstile keys → `{"ok":true}`; open the confirmation email in `apps/web/.outbox/`, click Confirm → "You're confirmed"; (5) invite it from `/platform/waitlist` → invite email in the outbox; (6) submit a sample request, approve it with a real listing, run setup, approve the starting point, press Send sample, open the link in a private window; check evidence opens and nothing links into the app; (7) `curl <app>/api/site-status`.
**Final-review notes (not a task):** the whole-branch reviewer runs `pnpm test:affected` and `pnpm --filter @cs/web e2e:affected` **once** with `--base main`, plus `bash scripts/design-lint.sh`, `git ls-files --eol | grep crlf` (empty) and `iconv -f utf-8 -t utf-8` over `git diff --name-only main...HEAD`.
**Done when:** `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts` green (tags/rules); `waitlist.spec.ts` passes via `pnpm --filter @cs/web e2e:affected` **at the final review only**. Commit `docs(phase-17): 17a copy sign-off, e2e and work file`.
