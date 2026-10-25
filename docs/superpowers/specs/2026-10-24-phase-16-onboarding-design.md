# Phase 16-onboarding — agency and client onboarding, full-page split flow

**Status:** draft for owner approval · **Date:** 2026-10-24 · **Branch:** `phase-16` (sub-phase of the design-system phase)
**Inputs:** Phase 10 (agency onboarding), Phase 11 (client setup, intake), Phase 12 (competitor discovery), design system v1 (`docs/design-system/`), Mobbin references (below), owner mockups `docs/design-system/mockups/onboarding/` (`agency.html` reviewed 2026-10-24 — its pages 2/3 predate the logo moving to step 3; `explorations.html` = first round incl. the rejected split dialog). Client-flow and intake mockups are made and approved before their tasks are built.

## 1. Intent

The owner finds today's onboarding unprofessional and out of line with current practice. Both wizards render inside the app shell (sidebar visible) as stacked bordered/shadow panels with a pill stepper; the agency profile step asks ~18 fields up front; the client setup has a long "Your business" step. The goal: onboarding that feels **separate from the app, clean, one idea per step, only the inputs that are required**, in the pattern of best-in-class B2B onboarding (Mobbin: Lindy, HoneyBook, Maze, Mixpanel, Productboard, QuickBooks, Uxcel).

**Success:** a new agency goes from sign-up to "Add your first client" in under 3 minutes; an agency adds a client from details to picked competitors in about 5 minutes without leaving the flow; the owner judges both flows professional.

**Anti-goals:** a modal/dialog wizard (owner rejected the split-dialog option); collecting data we don't need yet; a separate wizard for the business owner; a stepper inside the app chrome.

## 2. Decisions (owner, 2026-10-24)

| # | Decision |
|---|---|
| O1 | All onboarding flows use a **full-page split layout** outside the app shell: left = step (form), right = **live product preview** of what is being built, or an illustration where nothing can be previewed. Split dialog over the app was shown and **not** chosen. |
| O2 | **Agency onboarding = 4 steps:** 1 About your agency · 2 Invite your team · 3 Make it yours (logo + colour + name clients see) · 4 You're all set (summary + next steps + confirmation). |
| O3 | Agency step 1 fields: **agency name, email address, contact full name, phone** (required); **postal/billing address** (optional). |
| O4 | **Client onboarding** order: 1 Client details · 2 Find the business · 3 What they do and where · 4 Competitors · 5 Invite the owner · 6 Billing (admins) · 7 All set. |
| O5 | Client step 1 fields: **business name, contact full name, phone, email** (required); **address, logo/avatar** (optional). |
| O6 | Step 2's Google search box is pre-filled with the step 1 business name; the user can change it. |
| O7 | The step 1 contact is **by default** the owner invited in step 5 (pre-filled; can be changed). |
| O8 | Step 3 = **search keywords + radius** required; services an optional review; ZIPs, towns, map centre, place id move to Settings. |
| O9 | The business owner's first sign-in lands on the client **Overview**, no wizard. |
| O10 | The public intake (`/start`, `/start/<slug>`) gets the **same split layout and step flow**. |
| O11 | This is its own **sub-phase (16-onboarding)** with its own spec, plan and owner verification; it may change behaviour and data (an exception to Phase 16 D1 "look only"). |
| O12 | **"Ask the owner to pick":** staff continue through invite, billing and All set; the client shows "Waiting on <owner> to pick competitors"; the owner's Overview card stays until they pick; the starting-point clock starts when the owner picks, else the existing 14-day cap applies. |
| O13 | **No Google listing:** the competitor search still runs, centred on the **typed address geocoded** (city/ZIP if no street address); radius map and search work as with a listing. |

## 3. Design-system change

Replace **D-22** in `docs/design-system/04-design-decisions.md` and the **L7** row in `05-design-system-specification.md`:

> **L7 Onboarding (split):** full viewport, no app shell. Left column 640px on `surface` white: wordmark or agency logo top-left, "Save and exit" top-right, step label ("Step 2 of 4 · Your team") + segmented progress bar (one 4px segment per step, done/current = `primary`, rest = `panel`), H1 30/600, one-line subhead, form max 440px, footer pinned bottom: Back (secondary) · spacer · "Skip for now" (text, optional steps only) · primary. Right panel: `canvas` #F6F9FC with a 1px `line` left border, holding one floating preview (12px radius, overlay shadow — the one allowed shadow) and a one-line caption. Below 1024px the right panel is hidden; the left column becomes a centred 560px column. Logged-out auth pages (sign-in, check-email, link pages) keep a centred 400px column, no card; **sign-up** uses L7 split.
> Rejected: modal wizards; pill steppers; checklist-page setup (old D-22); cards around form steps.

Forms keep D-15 (red `*` required, muted "(optional)", 36–40px inputs, `#8796AB` borders). Wizards save per step. Copy is server-side and owner-signed (15b rule).

## 4. Shared pieces

- `OnboardingShell` (web component): the L7 frame; props `brand` (platform wordmark | agency logo + tokens), `step {n, of, label}`, `exitHref`, `preview: ReactNode`, `caption`. Standalone route group, **not** under `(app)/layout.tsx` (no `AppShell`).
- `StepProgress` (segmented bar), `StepFooter` (Back / Skip / primary, pending state), `PreviewWindow` (floating frame with optional fake browser chrome), `HighlightChange` (dashed accent outline on the preview element the current field drives).
- Live previews are **client components fed by the form's local state** (no server round trip per keystroke); they render fixed sample content plus the user's values. They are illustrative, never real client data.
- Replaces both private steppers (`(app)/onboarding/stepper.tsx`, inline `Stepper` in `setup-wizard.tsx`), `AuthCard` on sign-up, and `start/shell.tsx`.

## 5. Agency onboarding (`/onboarding`)

Entry and resume rules stay as Phase 10 (admin only, first-session redirect, `?step=`, opens at the first open step, completed/dismissed → `/agency`). Route moves out of `(app)` into the onboarding layout.

| Step | Left | Right preview |
|---|---|---|
| 1 About your agency | Agency name* (pre-filled from sign-up), Contact full name*, Phone*, Email address* (pre-filled with the sign-up email), Address (optional: street, suite, city, state, ZIP) + "Use this for billing too" (on by default; off reveals billing address). Time zone is **not shown**: taken from the browser, editable in Settings. | A client brief footer showing name · agency, phone · email, address — updating as typed |
| 2 Invite your team (skippable) | Rows of email + role (Agency admin / Account manager), "+ Add another"; primary label counts ("Send 2 invites"; "Continue" when empty) | The invite email a teammate receives (agency name) |
| 3 Make it yours (skippable) | **Logo upload** (moved here from step 2 per owner), brand colour (swatches + hex; suggested from the logo — my call, nice-to-have), name clients see | The client dashboard in the agency's logo/colours |
| 4 You're all set | Summary rows (Agency, Contact, Team, Brand) each with "Edit" → that step; "What happens next" 1 Add your first client (~5 min) · 2 We start watching (starting point within 48 h) · 3 A brief every Monday (you approve it first). Buttons: Back · "Go to dashboard" (text) · **"Add your first client"** (primary → client flow) | Illustration: first-two-weeks timeline |

**Data:** `agency_onboarding` keeps its columns. Steps in the wizard become `profile`, `team`, `branding`; the **`plan` step leaves the wizard** — it is set `skipped` by the step 4 confirmation, and the trial/payment prompt lives in the existing agency banner + checklist (Phase 10 rule "card needed after the first client" unchanged). Step 4 confirmation (`finish_onboarding`, new action, admin only) marks the **wizard** finished (stop the first-session redirect; new column `wizard_finished_at` or reuse — builder's choice). **My calls:** `completedAt` keeps its meaning (wizard settled + first client or dismissed) so the "add your first client" nudge emails continue until a client exists; the **`OnboardingChecklist`** on `/agency` stays until dismissed or all items are done, showing only what's open: Add your first client; Add a payment method (trial); any skipped step ("Invite your team", "Add your brand"). Step 1 saves with a **partial update** (new input mode on `update_agency_profile` or a sibling tool): it writes only the fields on screen, never clears Settings-only fields (legal name, website, industries, tax ID, billing email), and sets `timezone` from the browser **only if blank**. Step 1's contact full name also sets the signed-in user's `auth.user.name`; sign-up without a name behaves as today. Legal name, website, industries, tax ID stay in Settings › Agency profile.

**Sign-up (`/sign-up`, `/join/[token]`):** L7 split. Left: "Start your free 30-day trial", work email*, agency name*, "Create my agency", "or", "Continue with Google", terms line; "Sign in" link top-right. Right: a sample brief item + three proof points. Your-name field leaves sign-up (collected in step 1). Check-email stays a 400px column.

## 6. Client onboarding (`/c/<id>/setup` and `/agency/clients/new`)

Started from "Add a client" (agency) or step 4 of agency onboarding. Branded with the **agency's** logo/tokens (staff are in their agency context). "Save and exit" → client list, where an unfinished client shows "Setup n of 7" and resumes at its first open step.

**Client creation (my call):** step 1 is held in client-side form state; the client row is created by `create_client` when **step 2 completes** (business type known, so `client.vertical_id NOT NULL` and today's seat/trial-cap rules apply unchanged). Leaving during step 1 discards it — no half-made client takes a seat or reaches schedulers. Exit/resume works from step 3 onward.

| Step | Left | Right preview | Done when |
|---|---|---|---|
| 1 Client details | Business name*, Contact full name*, Phone*, Email*; Address (optional); Logo/avatar (optional, PNG/JPG/SVG → PNG, square) | The client's dashboard header / brief cover with logo + name | required fields saved |
| 2 Find the business | Search box pre-filled with business name (editable) + City or ZIP (pre-filled from address if given); results list (radio rows: name, address, ★ rating); **Business type** select, pre-chosen from the Google category, required; "Can't find it? Continue without a listing". Picking a listing fills **only blank** step 1 fields (address, phone). | Map with the picked listing pin + listing card | listing picked or "continue without" chosen; vertical set |
| 3 What they do and where | Search keywords* (chips, max 5, pre-filled from suggestions/pack seeds); Radius* (5/10/15/25 mi; default 10 mi); Services: one line "12 services from Google · Review" expanding to the chip list (optional) | Map with radius circle, redrawn on change | keywords ≥ 1 + service area; place id **or** a geocoded centre (O13) |
| 4 Competitors | The search **starts automatically** when step 3 completes (existing `startFirstAutoSearch`); this step shows progress ("Searching 3 keywords across your area…") then suggestions with tier chips (Top rival / Worth watching / Minor), checkboxes, max 5 picked, "Show n more", "Add one we missed". Footer: Back · "Ask the owner to pick" · "Continue with n". Without a listing the search runs on the geocoded centre (O13). Refusals (cap, cooldown) use today's copy. | "Where you stand" scorecard: rating and review count, you (#2A6BAC) + up to 2 picked rivals (chart roles rule) — the first two ticked; caption notes more rivals in the brief | competitors confirmed or skipped |
| 5 Invite the owner (staff) | "Send Maria an invite" with step 1 contact name + email pre-filled; "Invite someone else instead" reveals name/email fields; Skip | The invite email in agency branding | invitation exists or skipped |
| 6 Billing (admins; active clients only) | Monthly price*, setup fee (optional); "Turn on billing and email the payment link"; Stripe-not-connected note as today; Skip | The owner's payment page summary | as today |
| 7 All set | Summary rows with Edit; next steps (starting point within 48 h, brief every Monday); **"Go to <client>"** primary, "Add another client" text | Illustration / timeline | — (shown once setup completes) |

Non-admin staff see 6 steps (no billing); prospects follow today's prospect rules (no billing). "Dismiss setup" stays for staff (in the "Save and exit" menu, confirm dialog).

**Data (migration 0093+ after rebase; next free on main is 0093):**
- `client`: add `phone text`, `address jsonb` (`{line1, line2?, city, region, postalCode, country}`), `logo_url text` — all nullable (existing clients have none). Validation mirrors `update_agency_profile` (US phone, ZIP).
- **Contact (my call):** the step 1 contact name + email is written as the client's `contact` row (role `client_owner`, `active=false`, not invited) — the same row `invite_client_owner` already keys on via `client_setup.invited_contact_id`. One source of truth; step 5 "Invite someone else" uses the existing `replaceInvitedOwner` path. Contact name/email are personal data for support masking (`access-marks.test.ts`).
- Client logo storage mirrors `upload_agency_logo`: content-addressed `logos/clients/{clientId}/{sha256}.png` in the evidence store, served by a `files/logo` route with the same access rules as the client.
- Tools (all via `runTool`, registered in `@cs/tools`): `create_client` gains the step 1 details (phone, address, contact name/email; logo uploaded right after) and an optional lookup; new `update_client_details {clientId, name?, contactName?, email?, phone?, address?}` (partial update); new `upload_client_logo {clientId, png, sha256}`; `save_setup_profile` unchanged; `invite_client_owner` unchanged.
- **Suggestions (my call):** `enqueueSetupSuggestions` is queued when a listing is picked (i.e. by `create_client` at step 2 completion, as today). Step 3 shows the business type's seed keywords until suggestions are ready, then swaps in the suggested ones if the user hasn't edited the chips.
- **Geocoding (O13):** a server-side geocode of the step 1 address (or step 2 city/ZIP) via **Stadia Maps geocoding** (existing `STADIA_API_KEY`; through the SSRF-guarded fetch path), stored as `service_area.center`. The search-start rule (`startClientSearch` `missing_profile`, `deriveSetupState` profile rule, monthly-refresh filter) changes from "keywords + area + place id" to "keywords + area" — **builder to check what `place_id` feeds in the discovery run (e.g. excluding the client itself) and keep that working without it**.
- Setup state: `deriveSetupState` gains `details` and `lookup` steps before `profile`; `search` + `competitors` render as one step. The owner view (`clientOpen`) no longer routes owners into setup (O9). **O12:** "Ask the owner to pick" sets competitors to a new `waiting_owner` state that counts as settled for staff completion (step 7 shows), keeps owner write access to competitor picking only (`assertSetupActor` widened for that action), and leaves `competitorsDoneAt` unset until the owner confirms (14-day cap unchanged). The review email links to `/c/<id>` (Overview card), not `/setup`.

## 7. Business owner first visit (O9)

The invite link (`/sign-in?email=…&next=…`) always targets `/c/<id>` (Overview). First visit: a one-time welcome line at the top of Overview in agency branding ("Welcome, Maria. Brightside Marketing set this up for you. Your starting point is on its way."). If the agency used "Ask the owner to pick", Overview shows a card "Brightside asked you to choose who to watch · Choose competitors", opening the step 4 screen alone in `OnboardingShell` and returning to Overview. Owners edit services/area in Settings.

## 8. Public intake (O10)

`/start` (platform pool, Rival Monday brand) and `/start/<slug>` (agency brand) in `OnboardingShell`, 3 steps, no "Save and exit" (link to the agency site if set, else none):
1. **Find your business:** business name*, City or ZIP*, results to pick. Right: a blurred "You vs 3 nearby rivals" snapshot teaser.
2. **Your details:** your name*, email*, phone (optional), "What would you like help with?" (optional), consent*, Turnstile. Right: what the agency will do with the request.
3. **Check your email:** "Your snapshot link is on its way" + Resend (existing 60 s rule). Right: illustration.

Lead data, rate limits, verify token and `/start/v/<leadId>` behaviour unchanged; the snapshot page gets the DS look only.

## 9. Non-goals

Dark mode; phone-first redesign (the column collapses responsively, no separate mobile flow); changes to discovery cost/limits, billing rules, invite tokens or the agency checklist's data model beyond §5; illustrations commissioned from a designer (v1 uses simple inline SVG in DS colours).

## 10. Left to the builder

Exact copy (drafted, then owner sign-off doc per sub-phase); SVG illustrations; animation (none beyond 150ms fades); preview sample content; how `create_client` migrates legacy callers (prospects, `accept_lead`); E2E updates (role-based, axe check per step); whether "Suggested from your logo" ships in v1.

## 11. Dependencies and order

Phase 16 is on hold until Phase 7 and Phase 15 merge (16 D4). 16-onboarding needs DS tokens (16a foundations) and overlaps 15c-2b-2 only on `/c/<id>/setup` and `/agency/clients/new` files. Rebase onto main before planning (branch at 0088; main at 0092).
