# Phase 16-onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agency sign-up + 4-step agency onboarding, 7-step client onboarding, owner first visit and public intake as full-page split flows (form left, live preview right), per the 16-onboarding spec.

**Architecture:** A shared `OnboardingShell` (L7 split) in a new `(onboarding)` route group outside `AppShell`; previews are client components fed by form state. Data changes: three `client` columns, one `agency_onboarding` column, two `client_setup` columns (migration 0093). Tool changes: partial agency profile save, `finish_onboarding`, client details/logo tools, a Stadia geocoder dep so search runs without a Google listing, setup state with `details`/`lookup` steps and an owner-pick wait.

**Tech Stack:** Next.js App Router, Tailwind 4 + `@cs/ui`, `@cs/tools` registry, drizzle + Postgres (RLS), vitest + Testing Library, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-10-24-phase-16-onboarding-design.md` (O1–O13, §3–§8). Mockups: `docs/design-system/mockups/onboarding/`.

## Global Constraints
- Runs only after the Phase 16 hold lifts (Phase 7 + 15 merged). Task 0 rebases onto `main`; migrations start at **0093** (re-check).
- L7 layout values (spec §3): left column 640px, form max 440px, H1 30/600, progress = one 4px segment per step (`primary` done/current, `panel` rest), right panel `#F6F9FC` + 1px `line` border, preview radius 12px with the overlay shadow, right panel hidden < 1024px (left becomes centred 560px column). Required = red `*` (+ "Required" in accessible name), optional = muted "(optional)", inputs border `#8796AB`.
- Primary buttons: `#47A8E7` background, ink `#0B2540` label. Chart roles: you `#2A6BAC`, ≤ 2 rivals, grey (validate with the dataviz skill).
- Web reads = registered tools; writes via `runTool`. Page refusals → 404. Every page keeps a help key (`page:account.onboarding`, `page:agency.clients.new`, `page:client.setup`, intake none). Copy `server-only` where it is help copy; all new user-facing copy goes into the copy sign-off doc (Task 11).
- Miles in UI, km stored. Dates in viewer tz. No route-level `loading.tsx`.
- Geocoding goes to the fixed vendor host only (`api.stadiamaps.com`), key stripped from errors, ledgered as vendor `'stadia'`. User text is a query parameter, never a URL.
- `contact` stays service-role only; new email outputs are added to the tool's `supportMask`.
- No new npm dependencies (no axe this sub-phase; E2E stays role-based).

## Decisions (plan-level, from spec + code check)
- P1 `(onboarding)` route group with its own `layout.tsx` that repeats `requireContext()` and `billingRedirectFor` from `(app)/layout.tsx`; `(app)/layout.tsx`'s first-session redirect keeps pointing at `/onboarding`.
- P2 Agency wizard steps = `profile`, `team`, `branding`, then the `done` screen. `plan` stays in the DB/type but is set `skipped` by `finish_onboarding` and is no longer a wizard or nudge step.
- P3 `finish_onboarding` sets new `agency_onboarding.wizard_finished_at`; `completedAt` rule unchanged (all four steps settled + first client or dismissed) so nudges continue until a client exists. Checklist visibility = `!dismissed && openItems.length > 0` (no longer `!completed`).
- P4 Client is created at the end of step 2 by `create_client` (vertical known). Steps 1–2 live on `/agency/clients/new` as client-side state; steps 3–7 on `/c/<id>/setup`.
- P5 Search inputs rule becomes **keywords ≥ 1 AND service area with a centre** (place id no longer required) everywhere it is checked: `rival-search.ts:97`, `:168-170`, `setup/profile-change.ts:73`, `tools/onboarding.ts:84`, `setup/state.ts:58`, copy `tools/competitors.ts:141`.
- P6 Without a place id there is no self competitor; `selfContext` gets `client.phone` (normalised) as a fallback self signal so the client's own listing is filtered out of suggestions when phones match. Scorecard self data stays empty until a listing is linked (Settings); accepted limitation.
- P7 O12: new `client_setup.owner_pick_requested_at`; competitors step state `waiting_owner` counts as settled for completion; `setup-clock.ts` waits for `competitorsDoneAt` up to the 14-day cap even when `completedAt` is set and `owner_pick_requested_at` is non-null.
- P8 Owners never enter `/c/<id>/setup`; the only owner setup surface is `/c/<id>/setup/competitors` while `waiting_owner`.
- P9 Geocoding follows the existing Stadia static-map client pattern (fixed vendor host, plain fetch, key stripped) rather than `net/guard.ts`, which is a crawler text fetcher; user input only ever lands in a query parameter. (Refines spec §6 "through the SSRF-guarded fetch path".)

## File Structure
- `apps/web/src/components/onboarding/` — `onboarding-shell.tsx`, `step-progress.tsx`, `step-footer.tsx`, `preview-window.tsx`, `highlight.tsx`, `previews/*.tsx` (brief-footer, invite-email, branded-dashboard, listing-map, radius-map, scorecard, payment-summary, timeline, snapshot-teaser).
- `apps/web/src/app/(onboarding)/layout.tsx`; `(onboarding)/onboarding/*` (moved); `(onboarding)/agency/clients/new/*` (moved); `(onboarding)/c/[clientId]/setup/*` (moved, incl. `competitors/page.tsx`).
- `packages/db/migrations/0093_onboarding_split.sql` + schema edits.
- `packages/collectors/src/geo/stadia-geocode.ts` (+ test); `packages/tools/src/deps.ts` (`geocode`); `apps/web/src/server/geocode.ts`.
- Tools: `packages/tools/src/tools/agency-onboarding.ts`, `tools/onboarding.ts`, `tools/client-details.ts` (new), `setup/state.ts`, `tools/setup.ts`, `setup/review-email.ts`, `access/client-invite.ts`, `rival-search.ts`, `setup/profile-change.ts`, `engine/src/briefs/setup-clock.ts`, `collectors/src/rivals/run.ts`.

## Dependencies on in-flight work (re-check in Task 0)
- `phase-15c2b2` (client-page sweep): may touch `/c/<id>/page.tsx`, `setup-badge.tsx`, `client-home-basic.tsx`. 16-onboarding rebases onto it if it merged first.
- Phase 16a foundations (tokens, primitives): if not merged, `OnboardingShell` uses the existing tokens in `packages/ui/src/styles.css` and the values above literally; no token refactor here.
- `phase-7c1`: isolation fixtures — every new/changed tool needs its fixture kind (`client` for the client tools, `agency` for agency onboarding tools); whichever merges second updates them.
- `STADIA_API_KEY` must be added to the **web** env on Vercel (owner step at deploy; it is in `.env` and `turbo.json` already).

## Review Focus
1. An agency admin who re-opens step 1 via "Edit" after filling Settings must not lose legal name / tax ID / website / manual time zone (Task 3 test `save_agency_basics keeps settings-only fields`).
2. A client owner hitting `/c/<id>/setup` (old bookmark, old email) must land on Overview, not a 404 or the wizard; with `waiting_owner` they reach only the competitors page (Task 9 tests).
3. A client with no Google listing and an address that geocodes to nothing must not get stuck: step 3 asks for city/ZIP again and the search stays unstarted with a clear message (Task 6 test `geocode miss returns needs_location`).
4. The client's own business must not appear as a suggested rival when created without a listing but with a phone (Task 6 test `selfContext uses client phone`).
5. Two tabs: an agency user saving step 3 while the search already runs must not start a second search (existing `discovery_run_one_live`; Task 7 test `profile save during running search does not enqueue`).

---

### Task 0: Pre-flight
**Goal:** Rebase, re-check dependencies, conflict-scan; owner approves client-flow + intake mockups.
- [ ] `git rebase main` in `../CompetitorSpy-wt/phase-16`; confirm next free migration (expect 0093) and that every "Modify" path below exists (grep each symbol named in the tasks).
- [ ] Re-check "Dependencies on in-flight work"; record results in `docs/work/phase-16.md` § Pre-flight.
- [ ] Build `docs/design-system/mockups/onboarding/client.html` (steps 1–7 + owner Overview card + owner competitors page) and `intake.html` (3 steps), styled from `base.css`; render to PDF (`render.cjs` pattern) and send to the owner. **Owner gate:** Tasks 8–10 start only after approval. Fix `agency.html` pages 2/3 (logo moved to step 3).
- **Done when:** branch rebased, work file updated, mockups approved.

### Task 1: OnboardingShell and route group
**Files:** Create `apps/web/src/components/onboarding/{onboarding-shell,step-progress,step-footer,preview-window,highlight}.tsx` + `onboarding-shell.test.tsx`; create `apps/web/src/app/(onboarding)/layout.tsx` + `layout.test.tsx`; modify `docs/design-system/04-design-decisions.md` (D-22 row), `05-design-system-specification.md` (L7 row) with spec §3 text verbatim.
**Interfaces (binding):**
```ts
type OnboardingBrand = { kind: 'platform' } | { kind: 'agency'; name: string; logoUrl: string | null; style: React.CSSProperties };
type OnboardingShellProps = { brand: OnboardingBrand; step?: { n: number; of: number; label: string }; exit?: { href: string; label: string } | null;
  title: string; subtitle?: string; preview?: React.ReactNode; caption?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode };
function StepProgress(props: { n: number; of: number; label: string }): JSX.Element; // role="progressbar" aria-valuenow=n aria-valuemax=of, text "Step n of N · label"
function StepFooter(props: { back?: () => void | string; skip?: { label: string; onSkip: () => void } ; primary: { label: string; pending?: boolean; disabled?: boolean; form?: string } }): JSX.Element;
function PreviewWindow(props: { chrome?: boolean | string; width?: number; children: React.ReactNode }): JSX.Element;
function Highlight(props: { active: boolean; children: React.ReactNode }): JSX.Element; // dashed accent outline when active
```
**Behaviour:** shell renders `<main>` with two regions; right `<aside aria-label="Preview">` has `hidden lg:flex` (≥ 1024px); title is the page `<h1>`; brand platform = wordmark (`rival` #2A6BAC, `monday` #F5A524), agency = logo or name; `(onboarding)/layout.tsx` = `requireContext()` + `billingRedirectFor` exactly as `(app)/layout.tsx:37-44` (suspended non-admin → bare children), no `AppShell`, no first-session redirect. Follow pattern: `(app)/layout.tsx`, `components/auth-card.tsx` for brand.
**Tests:** `renders step label and progressbar values`, `hides preview below lg via class`, `renders agency logo when brand.kind=agency`, `footer omits Skip when not given`; layout: `redirects to billing like (app) layout`, `renders children without AppShell`.
**Done when:** `pnpm --filter @cs/web exec vitest run components/onboarding app/\(onboarding\)` passes.

### Task 2: Migration 0093 + schema
**Files:** Create via `pnpm --filter @cs/db generate --name=onboarding_split` then hand-append grants; modify `packages/db/src/schema/tenancy.ts` (client), `schema/onboarding.ts` (agency_onboarding), `schema/setup.ts` (client_setup + `SetupSkippedStep`); update the privilege guard allow-list test.
**SQL (generated columns must match; grants appended by hand):**
```sql
ALTER TABLE "client" ADD COLUMN "phone" text;
ALTER TABLE "client" ADD COLUMN "address" jsonb;
ALTER TABLE "client" ADD COLUMN "logo_url" text;
ALTER TABLE "agency_onboarding" ADD COLUMN "wizard_finished_at" timestamp with time zone;
ALTER TABLE "client_setup" ADD COLUMN "owner_pick_requested_at" timestamp with time zone;
ALTER TABLE "client_setup" ADD COLUMN "location_source" text;
ALTER TABLE "client_setup" ADD CONSTRAINT "client_setup_location_source_chk" CHECK ("location_source" IS NULL OR "location_source" IN ('listing','geocoded'));
GRANT UPDATE (phone, address, logo_url) ON client TO app_user;
```
**Types:** `ClientAddress = { line1: string; line2?: string; city: string; region: string; postalCode: string; country: 'US' }` (`$type` on `client.address`). `client_setup.skipped` constraint unchanged.
**Tests:** `packages/db` schema/privilege test expects the new column grants; `onboarding.test.ts` row round-trip incl. `wizardFinishedAt`.
**Done when:** `pnpm --filter @cs/db exec vitest run privilege onboarding` passes on the worktree test DB; `git ls-files --eol | grep crlf` empty.

### Task 3: Agency onboarding tools
**Files:** Modify `packages/tools/src/tools/agency-onboarding.ts` (+ test), `apps/worker/src/jobs/onboarding.ts` (+ test), `packages/tools/src/tools/access-marks.test.ts` (WRITE_TOOLS), `billing-guard.ts` (`PAUSED_WRITE_ALLOW_LIST` if `update_agency_profile` is there — mirror).
**Interfaces:**
```ts
// new tool, permission 'agency', admin only (requireAdmin), channels ['web']
save_agency_basics: { name: string(1..120); contactName: string(1..120); contactEmail: email; phone: PHONE;
  address?: { line1; line2?; city; region; postalCode: ZIP } | null; billingSameAsPostal: boolean; browserTimezone?: IANA }
  → { ok: true }
// new tool, permission 'agency', admin only
finish_onboarding: {} → { ok: true }
// get_onboarding_status output gains: wizardFinished: boolean; steps exclude nothing (plan still reported)
```
**Behaviour:**
- `save_agency_basics` updates only `name`, `contactName`, `contactEmail`, `phone`, postal fields when `address` given (null clears postal), billing fields copied from postal when `billingSameAsPostal`, `timezone` set from `browserTimezone` **only if the profile's timezone is null/empty or no profile row exists**; inserts the profile row if missing (timezone default `America/Chicago` when no browser tz). Never touches legalName, website, verticals, taxId, billingEmail. Marks `profile` done. Updates `auth.user.name = contactName` for `ctx.userId` when `ctx.userId`'s email equals `contactEmail` (service db, `auth.user`).
- `finish_onboarding`: sets `wizardFinishedAt = now` (idempotent), marks `plan` skipped if not done, runs `reevaluateOnboardingCompletion`.
- `mark_onboarding_redirected` unchanged; `(app)/layout.tsx` redirect also skips when `wizardFinished`.
- Worker `nextOnboardingStep`: order `profile`, `team`, `branding`, then `first_client`; never `plan`.
- `update_agency_profile` unchanged (Settings).
**Tests (TDD):** `save_agency_basics keeps settings-only fields` (seed full profile incl. legalName/taxId/timezone 'America/Denver'; save basics with browserTimezone 'America/New_York' → legalName/taxId kept, timezone still Denver); `save_agency_basics sets timezone when blank`; `billingSameAsPostal copies postal into billing`; `sets auth user name for the caller`; `non-admin gets not_found`; `finish_onboarding sets wizardFinished and skips plan`; `finish_onboarding is idempotent`; worker `nudge never suggests plan`.
**Done when:** `pnpm --filter @cs/tools exec vitest run agency-onboarding access-marks` and `pnpm --filter @cs/worker exec vitest run jobs/onboarding` pass.

### Task 4: Agency onboarding + sign-up UI
**Files:** Move `apps/web/src/app/(app)/onboarding/*` → `(onboarding)/onboarding/*`; rewrite `page.tsx`, `flow.ts` (STEPS `['profile','team','branding','done']`), `actions.ts` (`saveBasicsAction`, `inviteTeamAction`, `saveBrandingStepAction` incl. logo, `skipStepAction`, `finishAction`), `steps/{about,team,brand,done}.tsx`; delete `stepper.tsx`, `step-nav.tsx`, `steps/plan.tsx`, `steps/profile.tsx`; create `components/onboarding/previews/{brief-footer,invite-email,branded-dashboard,timeline}.tsx`; modify `components/agency/onboarding-checklist.tsx` (+ test), `(app)/agency/page.tsx` (checklist condition P3), `(app)/layout.tsx` (+ test: skip redirect when `wizardFinished`), `app/sign-up/page.tsx` + `sign-up-form.tsx` (L7 split; drop "Your name"), `join/[token]/page.tsx` (same shell), `page-titles.test.ts` paths, `packages/demo/src/coverage.ts`, e2e `signup.spec.ts`.
**Behaviour:**
- Step 1 fields per spec §5 table; agency name + email pre-filled from `get_agency_profile`/session; address collapsed behind "+ Add an address" when empty, expanded when present; `browserTimezone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Step 2 primary label: "Send n invite(s)" when n ≥ 1, else "Continue"; Skip → `mark_onboarding_step skip team`.
- Step 3 = logo upload (reuse the branding logo route `agency/settings/branding/logo`) + colour + display name; Skip allowed.
- Step 4 summary rows Agency / Contact / Team / Brand, each "Edit" → `?step=`; primary "Add your first client" → `finish_onboarding` then `/agency/clients/new`; text "Go to dashboard" → `finish_onboarding` then `/agency`.
- Checklist items: `first_client` (`/agency/clients/new`), `payment` (trial only), `team` and `branding` only when skipped; hidden when dismissed or nothing open.
- Previews update from local form state (no server calls); `Highlight` on the element the focused field drives.
- Sign-up: L7 split, right = sample brief item + three proof points; check-email stays the 400px column (no card).
**Tests:** `steps.test.tsx`: `about step marks required fields`, `team primary label counts invites`, `done step lists summary with edit links`; `onboarding-checklist.test.tsx`: `shows only open items`, `hides when nothing open`; `layout.test.tsx`: `no redirect after wizard finished`; e2e `signup.spec.ts`: sign up → step 1 → skip team → skip brand → "Add your first client" lands on `/agency/clients/new`; existing logo-preview test moved to step 3.
**Done when:** focused vitest for the touched files + `pnpm --filter @cs/web e2e:affected` pass.

### Task 5: Geocoder dependency
**Files:** Create `packages/collectors/src/geo/stadia-geocode.ts` (+ test), export from collectors `index.ts`; modify `packages/tools/src/deps.ts` (add `geocode?`), create `apps/web/src/server/geocode.ts` (fixture under fake/demo/test like `server/setup-lookup.ts:18`), wire in `server/tools.ts`; add `STADIA_API_KEY` to `apps/web/src/server/env.ts` (optional).
**Interfaces:**
```ts
type GeocodeQuery = { line1?: string; city?: string; region?: string; postalCode?: string; text?: string };
type GeoPoint = { lat: number; lng: number; label: string; precision: 'address' | 'locality' | 'postalcode' };
function createStadiaGeocoder(opts: { apiKey: string; fetch?: typeof fetch; ledger?: VendorLedger }): (q: GeocodeQuery) => Promise<GeoPoint | null>;
// ToolDeps: geocode?: (q: GeocodeQuery) => Promise<GeoPoint | null>
```
**Behaviour:** GET `https://api.stadiamaps.com/geocoding/v1/search?text=<joined query>&boundary.country=US&size=1&api_key=<key>` (verify the endpoint and response shape live once with the dev key before coding the parser; record it in `docs/research/2026-09-30-phase-2-vendor-apis.md`); first feature's `geometry.coordinates` = `[lng, lat]`, `properties.layer` → precision; zero features → `null`; non-2xx → throw with key stripped (pattern `rankings/static-map.ts:15,40`); ledger vendor `'stadia'` op `'geocode'`. Fixture: deterministic Austin point for any query containing a ZIP or city, `null` for text `"nowhere"`.
**Tests:** `parses first feature`, `returns null on empty`, `strips key from errors`, `records a vendor call`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run stadia-geocode` passes.

### Task 6: Client creation, details, logo, search rule
**Files:** Modify `packages/tools/src/tools/onboarding.ts` (+ test), create `packages/tools/src/tools/client-details.ts` (+ test, add to `all.ts`), modify `access/client-invite.ts` (export `upsertOwnerContact`), `rival-search.ts` (+ test), `setup/profile-change.ts` (+ test), `tools/competitors.ts:141` copy, `collectors/src/rivals/run.ts` (+ test) `selfContext`; create `apps/web/src/app/files/logo/clients/[clientId]/[file]/route.ts` (+ test); `access-marks.test.ts`.
**Interfaces:**
```ts
// CreateClientIn gains (all optional for legacy callers: prospects, accept_lead):
details?: { phone: PHONE; address?: ClientAddress | null; locality?: string(1..120) /* step 2 "City or ZIP" */; contact: { name: string(1..120); email: email } }
// when lookup is null and details.address or details.locality given → geocode → serviceArea { center, radiusKm: 16.1, zips: [] }, client_setup.location_source='geocoded'
// with lookup → location_source='listing' (radius stays 15 km as today unless UI sends one)
update_client_details: { clientId; name?; phone?; address?: ClientAddress | null; contactName?; contactEmail? } → { ok: true }   // permission 'agency', level client
upload_client_logo: { clientId; png: base64 ≤ 2MB; sha256: hex64 } → { logoUrl: string }   // permission 'agency'; key logos/clients/{clientId}/{sha}.png; url /files/logo/clients/{clientId}/{sha}.png
get_client_details: { clientId } → { name; phone; address; logoUrl; contactName; contactEmail; locationSource } // permission 'read' staff only (agency); supportMask ['contactEmail']
```
**Behaviour:**
- Contact: `create_client` with `details.contact` calls `upsertOwnerContact(tx, {agencyId, clientId, name, email})` → `contact` row role `client_owner`, `active=false` (same row `inviteClientUser` later finds by email). It does **not** set `invited_contact_id`.
- Search rule P5 (`searchInputsReady(c) = keywords.length > 0 && serviceArea?.center != null`) — one exported helper in `rival-search.ts`, used by all six call sites.
- `selfContext`: when `selfCompetitorId` is null, return `{ phone: normalisePhone(client.phone) }` if present (P6).
- Geocode miss: `create_client` still creates the client with `serviceArea = null`; state step 3 then shows `needs_location` (Task 7).
- Logo route: same access rule as `files/logo/[agencyId]` but checks client visibility (`requireVisibleClient`); 404 otherwise.
**Tests:** `create_client stores phone, address and owner contact`; `create_client without lookup geocodes the address`; `geocode miss returns needs_location` (state); `legacy create_client without details unchanged`; `update_client_details partial update keeps other fields`; `upload_client_logo stores content-addressed and is idempotent`; `client viewer cannot update details` (not_found/permission); `searchInputsReady accepts geocoded centre without placeId`; `monthly refresh includes geocoded clients`; `selfContext uses client phone`; route `logo 404 for other agency`.
**Done when:** `pnpm --filter @cs/tools exec vitest run onboarding client-details rival-search profile-change access-marks` and `pnpm --filter @cs/collectors exec vitest run rivals` pass.

### Task 7: Setup state, owner pick, clock
**Files:** Modify `packages/tools/src/setup/state.ts` (+ test), `tools/setup.ts` (+ test), `setup/review-email.ts` (+ test), `access/client-invite.ts` (`landingPath`), `tools/portfolio.ts` + `tools/schemas.ts:177`, `packages/engine/src/briefs/setup-clock.ts` (+ test), `apps/web/src/components/setup-badge.tsx` (+ test).
**Interfaces:**
```ts
type SetupStepKey = 'details' | 'lookup' | 'profile' | 'competitors' | 'invite' | 'billing';
type CompetitorsStepState = 'todo' | 'searching' | 'blocked' | 'ready' | 'waiting_owner' | 'done' | 'skipped';
// SetupStateOut: steps: Record<SetupStepKey, StepState>; totalSteps: 5 | 6; competitors: CompetitorsStepState; needsLocation: boolean
// advance_client_setup action gains 'ask_owner' (agency-only): sets owner_pick_requested_at=now, queues the existing review email; competitors → 'waiting_owner'
```
**Behaviour:**
- `details` done when client has name + phone + an owner contact; `lookup` done always once the client exists (listing or geocoded/continue-without); `profile` done when `searchInputsReady`; `needsLocation = serviceArea?.center == null`.
- `search` and `competitors` merge into `competitors`; `waiting_owner` counts as settled in `completeIfDone`.
- `assertSetupActor` (security-sensitive — exact rule): agency staff always (as today); `client_owner` **only** for `pick_setup_competitors` and `advance_client_setup` `confirm_competitors`, and **only** while `owner_pick_requested_at IS NOT NULL AND competitors_done_at IS NULL`; every other owner call → `not_found`. Remove the `clientOpen` owner path.
- `landingPath` → always `/c/<id>`; review email link → `/c/<id>`.
- `setup-clock.ts`: when `owner_pick_requested_at` is set, the clock starts at `competitors_done_at` if set, else at `owner_pick_requested_at + 14 d` once that has passed, else not started — even if `completedAt` is set. Without `owner_pick_requested_at`, unchanged.
- Portfolio/SetupBadge: "Setup n of N" where N = `totalSteps + 1` (the All set screen); "Waiting on <owner first name>" when `waiting_owner`.
**Tests:** `details and lookup done for a created client`; `profile done with geocoded centre`; `ask_owner sets waiting_owner and completes setup for staff`; `owner may pick only while waiting_owner`; `owner gets not_found on save_setup_profile`; `owner gets not_found after competitors done`; `invite link lands on overview`; `review email links to overview`; clock `waits for owner pick up to 14 days`; badge `shows waiting on owner`; `profile save during running search does not enqueue`.
**Done when:** `pnpm --filter @cs/tools exec vitest run setup state review-email portfolio` and `pnpm --filter @cs/engine exec vitest run setup-clock` pass; `pnpm test:affected`.

### Task 8: Client onboarding UI (agency staff)
**Files:** Move `(app)/agency/clients/new/*` → `(onboarding)/agency/clients/new/*` and `(app)/c/[clientId]/setup/*` → `(onboarding)/c/[clientId]/setup/*`; rewrite `wizard-steps.ts`, `setup-wizard.tsx`, steps `details-step.tsx`, `find-step.tsx` (pre-creation, client state), `area-step.tsx`, `competitors-step.tsx`, `invite-step.tsx`, `billing-step.tsx`, `done-step.tsx`; delete old `business-step`, `search-step`, `pick-step` + private stepper; previews `listing-map`, `radius-map`, `scorecard`, `payment-summary`; modify `agency/prospects/new/actions.ts`, `agency/leads/actions.ts` (redirect targets unchanged), `page-titles.test.ts`, `packages/demo/src/coverage.ts`, e2e `client-setup.spec.ts`, `client-setup-invite.spec.ts`, `new-vertical.spec.ts`, `starting-point.spec.ts`, `apps/web/scripts/e2e-affected-rules.ts` (new paths).
**Behaviour:** per spec §6 table, agency brand (`themeForViewer` already on `<html>`); "Save and exit" → `/agency`; step 2 search box pre-filled with step 1 name (editable), City or ZIP pre-filled from address, business type select pre-chosen via existing category→vertical mapping, "Continue without a listing"; completing step 2 calls `createClientAction` (details + optional lookup) then `upload_client_logo` if a logo was chosen, then redirects to `/c/<id>/setup`; step 3 keywords max 5 chips (seed keywords until suggestions ready; swap only if untouched), radius select `[5,10,15,25]` mi default 10, services collapsed line; `needsLocation` shows City or ZIP field → `update_client_details` + geocode; step 4 polls like today (5 s → 10 s), picks max 5, scorecard shows you + first two ticked; footer "Ask the owner to pick" → `ask_owner`; step 5 pre-filled with the owner contact, "Invite someone else instead"; step 6 admins only on active clients; step 7 "Go to <client>" / "Add another client". "Dismiss setup" in an exit menu with confirm dialog.
**Tests:** `wizard-steps.test.ts`: `admin active client has 7 screens`, `non-admin has 6`, `prospect has 6`; `find-step.test.tsx`: `pre-fills search with business name`; `area-step.test.tsx`: `caps keywords at 5`, `shows city field when needsLocation`; `competitors-step.test.tsx`: `scorecard shows at most two rivals`; e2e `client-setup.spec.ts`: details → find (fake lookup) → area → competitors (fake search) → invite → done; `client without listing reaches competitors via geocode` (fixture).
**Done when:** focused vitest + `pnpm --filter @cs/web e2e:affected` pass.

### Task 9: Owner first visit
**Files:** Modify `(app)/c/[clientId]/page.tsx` (welcome line + choose-competitors card), `(onboarding)/c/[clientId]/setup/page.tsx` (owner → `redirect('/c/<id>')`), create `(onboarding)/c/[clientId]/setup/competitors/page.tsx` (owner-only, reuses `competitors-step.tsx` in `OnboardingShell`), `components/client/owner-welcome.tsx` (+ test); e2e `client-setup-invite.spec.ts`.
**Behaviour:** welcome line shown until dismissed (cookie `rm_welcome_<clientId>`, set by its Dismiss button; no DB) in agency branding: "Welcome, {first name}. {agency} set this up for you. Your starting point is on its way."; card when `waiting_owner` for owners: "{agency} asked you to choose who to watch" + "Choose competitors" → `/c/<id>/setup/competitors`; that page 404s unless `waiting_owner`, returns to Overview on confirm.
**Tests:** `owner hitting /setup is redirected to overview`; `competitors page 404 when not waiting_owner`; `welcome line hides after dismiss`; e2e invite → owner sign-in lands on Overview → card → pick → back to Overview.
**Done when:** focused vitest + `pnpm --filter @cs/web e2e:affected` pass.

### Task 10: Public intake
**Files:** Modify `apps/web/src/app/start/{landing,intake-form}.tsx`, `start/page.tsx`, `[slug]/page.tsx`, `verify/page.tsx`, `v/[leadId]/page.tsx`; delete `start/shell.tsx` (`IntakeShell`, `Panel`) after moving callers to `OnboardingShell`; previews `snapshot-teaser.tsx`; tests `pages.test.tsx`; e2e `intake.spec.ts`.
**Behaviour:** spec §8: 3 steps with `StepProgress`, brand from `start/brand.ts` (`platformBrand`/`agencyBrand` → `OnboardingBrand`), no "Save and exit"; step 3 "Check your email" with Resend (existing 60 s rule); lead data, rate limits, verify unchanged; snapshot page `v/[leadId]` uses the shell without step/preview (wide content).
**Tests:** `pages.test.tsx`: `slug page shows agency brand`, `step 2 requires consent`; e2e intake happy path still passes.
**Done when:** focused vitest + `pnpm --filter @cs/web e2e:affected` pass.

### Task 11: Help, copy sign-off, docs
**Files:** Modify `apps/web/src/help/copy/account.ts:108` (remove plan tip; tips for about/team/brand/done), `client.ts:489,506`, `agency.ts:50`; guides `docs/help/pages/account.onboarding.agency.md`, `agency.clients.new.agency.md`, `client.setup.agency.md`, `client.setup.client.md` (owner version: Overview card + competitors page); `(app)/help-account.test.tsx`; create `docs/archive/phase-16-onboarding-copy-signoff.md` (every new string, grouped by screen, with "Decisions for the owner"); `docs/work/phase-16.md` (owner verification steps); `.env.example` note for web `STADIA_API_KEY`.
**Owner verification steps (write into work file):** (1) incognito sign-up → 4 steps → "Add your first client"; re-open step 1 via Edit: Settings fields intact; (2) add a client with a listing → 7 screens, previews update live; (3) add a client without a listing (real address) → search runs; own business not suggested; (4) "Ask the owner to pick" → staff see All set + "Waiting on …"; owner sign-in lands on Overview with card; pick; starting point follows; (5) `/start/<slug>` 3 steps in agency branding; (6) phone width 390 px: no preview panel, column readable; (7) sign the copy doc.
**Done when:** `pnpm --filter @cs/web exec vitest run help` passes; `kb:seed` dry run lists the changed guides.
