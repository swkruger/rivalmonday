# Backlog

Grouped by target. Each item: `- [ ] <item> — *from <source phase/date>*` (+ short context if needed, keep spec/file refs).
Rules: new items go under their target; done items are deleted (git history keeps them); keep each item ≤ 3 lines.

Migrated 2026-10-11 from the roadmap's per-phase carry-over sections (full text: [archive/2026-10-11-roadmap-full.md](archive/2026-10-11-roadmap-full.md)) and HANDOVER §5, §7, §8.

## Phase 7 — Hardening & pilot

### Security & data
- [ ] Soft-delete/archival before any delete feature — audit/ledger rows cascade-delete with agency/client today — *from Phase 1 review*
- [ ] Least-privilege worker role (worker uses the owner `DATABASE_URL`); must cover the 8 Phase 4b delivery jobs; web `jobStatus` reads `pgboss.job` with the owner URL (least-privilege queue access) — *from Phase 1, 3d, 4b, 5b-1*
- [ ] Retention keeps `brief_item.evidence_ids`, `recommendation.evidence_ids` and `alert.evidence_ids` evidence for the brief's/alert's lifetime — *from 4a/4b cross-phase*
- [ ] Postmark bounce/complaint webhooks deactivate contacts (a hard bounce just fails that send today) — *from 4b*
- [ ] Object store `put` can overwrite (fs `wx` flag; R2 `IfNoneMatch: '*'` once verified live) — *from 2a review*

### Budget & cost
- [ ] Enforce caps (pause Ask/jobs at 100 %) and allocate shared collection cost to clients — *from 5b-2 (decision 18)*
- [ ] Prospect snapshots: add a cooldown (≈ $0.10–0.15 per re-run) and attribute GBP/ads pulls to the prospect (usage page under-reports) — *from 5b-2 final review Minor 3*
- [ ] Switch `cost_usd` (`packages/db/src/schema/ledger.ts`, `doublePrecision`) to `numeric` before real spend data — *from Phase 1 review*

### Scale & performance
- [ ] Worker concurrency: let `rival-search` (vendor-bound) run 3–5 jobs at once inside the single worker (pg-boss local concurrency), then shorten `RIVAL_MONTHLY_SPACING_SECONDS` — cheap first step, keeps one replica — *from owner Q 2026-10-15*
- [ ] Multiple worker replicas / autoscaling on queue depth: move per-host crawl politeness (`collectors/src/web/rate-limit.ts`) and vendor rate limits into Postgres (advisory locks or a rate table), check every cron job tolerates a second runner (sweeps, vendor-poll), optionally split crawler vs API-only workers; then lift the one-replica rule in root CLAUDE.md — *from owner Q 2026-10-15*
- [ ] Page latency on the remote Neon DB: pages took 28–36 s in E2E (Playwright timeouts raised to 90 s/test, 15 s/expect in `playwright.config.ts`) — look before launch — *from 5c-2*
- [ ] `listBriefDueClients` scans every client with one lookup each — set-based query — *from 4a cross-phase*
- [ ] Cross-replica rate limiter before scaling the worker; one host's large Crawl-delay blocks the single sequential capture queue; robots.txt fetch isn't paced by the limiter — *from 2a review*
- [ ] Flaky Neon connections in tests (`ECONNRESET`/`connect ETIMEDOUT` in `db` RLS tests, `collectors` `suggest.test.ts`, E2E seed); one un-bisected `@cs/collectors` full-suite failure (passed 249/249 on re-run) — add retry/pool settings or bisect — *from 5c-2 / demo runs*
- [ ] Per-task AI HTTP timeouts (60 s × 3 worst case, `packages/ai/src/http.ts`) — *from Phase 1 review (Vercel)*

### Deployment
- [ ] Vercel file tracing for `packages/ai/config/ai.yaml` and `packages/verticals/packs/` — *from Phase 1 review*
- [ ] `@cs/core` uses `node:crypto` (not Edge-safe) — *from Phase 1 review*
- [ ] Deploy note: migration `0025`'s `client_score_thresholds_check` fails on any existing malformed row — check before applying to a DB with real clients — *from 3d final review*
- [ ] Deploy note: `magicLink({ storeToken: 'hashed' })` invalidates links issued before the cutover (15-min window) — expect a few "expired" reports — *from 5b-2 final review Minor 7*
- [ ] Align Postgres versions (Neon 18 vs CI/compose `pgvector/pgvector:pg16`) — *from Phase 1 review*
- [ ] Add `drizzle-kit check` to CI — *from Phase 1 review*
- [ ] Set `"agentGuidance": false` in `turbo.json` if AGENTS.md churns — *from Phase 1 review*

### Phase 6 follow-ups (MCP, Ask, knowledge base)
- [ ] Renderer-level SSRF guard: Playwright `page.route` resolved-IP check or pinned resolver; covers KB import/sync (DNS-rebinding race accepted in 6c), competitor URLs, robots fetch, `www.`/port redirects; treat SIIT `::ffff:0:0/96` as non-public — *from 6c final review*
- [ ] Tier gating of `mcp`/`ask`; MCP `manage` scope for client roles; ANN vector index (events, pages, `kb_chunk`) — *from 6a/6c*
- [ ] MCP hardening: vector-only pages; unredacted model-written titles; uncapped `fetch` brief text; connector name `rival-monday` not white-labelled; screenshot mime hard-coded; `resources.ts` upsell offset-0; `add_recommendation` not one tx; `revoke_oauth_grant` partial failure; consent second-tab race; `clientScope[0]` assumption — *from 6a*
- [ ] MCP tests: cross-agency, P18 scoped member, review cross-client leak, page-level `/sign-in` OAuth, exact client-role `tools/list` — *from 6a*
- [ ] Ask hardening: widen composite FK to `(id,user_id,client_id,agency_id)`; allowlist `action.tool` vs `ASK_WRITE_TOOLS` + action `clientId` = thread's; unknown clientId → raw FK 23503; starters skipped if `notifyBriefOutcome` throws; `dataBlock tool=` unescaped; per-call model budget; trace args may quote tool text; `askReviewAllowed` write non-atomic — *from 6b*
- [ ] Ask scope: generic `search`/`fetch` on the `ask` channel can still reach another in-scope client's events/evidence (knowledge part fixed in 6c) — pin `clientId` to the thread — *from 6b/6c*
- [ ] Ask parked: lookalike markers as plain text; body parsed before feature/scope checks (400 vs 404); delete has no isUuid precheck; SSE `final.action` echoes proposed input; unseen thread after pre-persist error; `?q=` auto-send counts toward quota (auto-send known starters only); no content-type/Origin check on `/api/ask/turn`; `0044` relies on owner BYPASSRLS; request body-size cap — *from 6b*
- [ ] Ask grounding: sentence split on "1."/"e.g."; nested-bullet indent lost; empty-evidence verifier call; metadata-only fallback for html/screenshot evidence; pure how-to answers: uncited filler sentences now checked against empty `ev:` text (watch traces) — *from 6b/6c*
- [ ] KB robustness: `kb-embed` should throw when the provider returns fewer vectors; validate scope before `kb-import` enqueue; `kb-sync` 7200 s expiry vs many articles; archived import jobs read as failed; seed-row guard into `saveArticle`; `previous_body_md` also set by manual edits; `get_kb_article` skips active-client check; `sourceUrl` not http(s)-restricted; `kbNamesFor` = 3rd copy of brand-name logic (invert into `@cs/tools`); KB hits pass no business names to redaction — *from 6c*
- [ ] Multi-membership is resolved for Ask only; other routes still pick one membership — *from 6b*

### Model ops
- [ ] Run `jev.live.test.ts` once with a real `TYPESAFE_API_KEY` (make `@cs/ai` tests load `.env`) to confirm 0- vs 1-based scores — *from Phase 1 review*

### Pilot
- [ ] Exercise `/link-other-account` live (never run live) — *from 5a*
- [ ] Review/rename/remove the `CS Dev Verification Agency`/`Client` (`aaf5e009-…`/`25f99947-…`) before real onboarding — *from HANDOVER §5 item 5*

## Phase 9 follow-ups (billing)
**Soon**
- [ ] `disable_client_billing`: re-check the row inside the tx (race with an ACH Checkout completing → subscription never cancelled) — *9b R27*
- [ ] Daily reconcile `payment_needed → active` doesn't lift a `paused_by='auto'` pause or set `last_paid_at` (paid client stays auto-paused; "is now paying" mail a month late) — *9b final M3*
- [ ] Client billing page after "turn off" (cancel at period end): shows "Not set up" next to "Your plan ends on …", Billing nav disappears while still paying; same for disconnected rows; amounts ignore `agency_connect.currency` — *9b M4*
- [ ] `checkout_completed` for a second live subscription is only logged (R11) → queue an agency notice for a live `untracked_subscription` (real double charge) — *9b M8*
- [ ] Billing pages auto-refresh after **every** Stripe round trip, not only Checkout/Portal returns: Connect onboarding return (`?connect=done`/`retry`), client billing actions (enable/disable, price change, resend, pause/resume) whose webhooks land later — reuse `RefreshUntilChanged` — *owner, 2026-10-16*
- [ ] `BILLING_FAKE_GATEWAY` accepted on Vercel preview and by the worker (refuse when `VERCEL_ENV` is set; worker ignores it) — *9a final re-review*

**Later**
- [ ] Per-client price/setup fee at enable time in the UI (today: enable at default, then change price → second link) — *9b M5*
- [ ] `refunded_at`/`disputed_at` write-once and not shown; exempt refund/dispute signals from the R3 ordering guard — *9b M6*
- [ ] `stripe_connect_event` stores unhandled event types (insert before the `HANDLED` check) — *9b M7*
- [ ] Connect product name uses `agency.name`, not `branding.displayName` (shows on Checkout/receipts) — *9b M9*
- [ ] Re-adopt subscriptions on `disconnected` client rows after a reconnect to the same account; `open_billing_portal` for a customer of a forgotten account — *9b re-review*
- [ ] Missed `account.application.deauthorized` → reconnect reuses a dead account id; admin only sees the generic Stripe-failure copy — *9b R24*
- [ ] Per-agency browser-tab titles on client pages (root title "Rival Monday" leaks; only `/c/[id]/settings/billing` fixed) — *9b R18*
- [ ] Review an annual billing option for agency → client subscriptions (9b ships monthly only) — *9b brainstorm*
- [ ] 9a: `redeem_discount_code` doesn't check `discount_code.max_redemptions` on direct coupon attach; `syncSeats` unlocked (out-of-order syncs leave Stripe < DB until nightly reconcile); `applyBillingSignal` inserts a default pilot row on a null transition → `startAgencyTrial` returns early (Phase 10 sign-up sidesteps it, R3); `billing_notice.last_error` may hold a recipient address; rows at max attempts abandoned silently (a `client-payment-link` keeps `params.checkoutUrl`); stale digest/outbox items delivered after reactivation (no age cap — owner call) — *9a ledger*
- [ ] 9a: grant/extend live-subscription check outside the `adminSignal` tx (TOCTOU); daily seat-retry step lacks its own try; percentOff > 2 decimals rounded vs raw to Stripe; promo code left active in Stripe if the DB insert fails — *9a ledger*
- [ ] Test hygiene (fold in when touching): hand-set `pausedAt` in tests, unasserted seat sync after auto-pause, `sendClient`/`sendAgencyClient` untested, `get_connect_overview` N+1, `get_client_revenue` duplicates `clientMrrCents`, reconcile doesn't stamp `lastStripeEventAt`, invited `set_client_price` with unchanged amount re-mails, `next_bill` can create a duplicate-amount price, Stripe reads inside the webhook tx, `new Stripe()` without explicit `apiVersion` — *9a/9b ledgers*

## Phase 10 follow-ups (agency onboarding)
- [ ] Delete superseded logo objects under `logos/<agency>/`; SVG `<!DOCTYPE`/`<!ENTITY` rejects Illustrator exports with "scripts or external links" copy (tweak copy) — *phase-10*
- [ ] Existing member whose second-agency invite breaks lands on `/agency` with no explanation (`onboarding-start.ts` checks membership first) — *phase-10*
- [ ] Welcome-email link may open the wrong wizard for a user with two open agencies; sign-up email subject echoes the typed agency name (strip URL-like text?) — *phase-10*
- [ ] Checkout return doesn't mark the plan step; wizard skip/continue tool failures show 404; team step has no post-invite hint — *phase-10*
- [ ] `/sign-up` pause read fails closed on DB error; invite email `expiresAt` recomputed (ms drift); `get_billing_summary` reads billing twice; `billing-notices.ts` repeats the admins+deliver pattern 5× — *phase-10*
- [ ] `couponFor` ignores `max_redemptions` (Stripe enforces; exhausted coupon → Checkout error) — *phase-10*
- [ ] Test hygiene: >120-char CHECK tests, `parseWebEnv` new-var test, funnel non-active `cardAdded` case, sequential double-run nudge test, refused-duplicate E2E fixed 3 s wait, mock-based console spies — *phase-10*

## Polish (small UI/UX fixes, any time)

### Phase 6 UI polish
- [ ] Ask UI: thread delete is one-click with error only in a tooltip; save dialog allows duplicate saves; pre-persist error has empty `messageId`; quota 0 shows "N of 0"; `assistantName` read twice — *from 6b*
- [ ] `/platform/knowledge`: `start()` throw uncaught in import panel; preview shows stale kind; inline delete confirm lacks focus handling; "Saved." banner after publish — *from 6c*

### Workflow & behaviour
- [ ] Let agencies add their own verticals and services (feature-sized) — *from phase5-polish*
- [ ] Franchise brands: jobs postings are brand-wide (Aire Serv's 2026-10-14 postings are "United States"), not the local franchisee's — *from phase5-polish*
- [ ] A removed competitor's pending alerts and brief items are still approvable — *from 5b-1 final review Minor 5*
- [ ] Trend table shows "— → —" for a business with no rating; show a single "—" (owner undecided) — *from 5b-1 owner verification*
- [ ] Webhook/notification toggle actions (`agency/webhooks/actions.ts`, `settings/notifications/actions.ts`) ignore the `runTool` result — surface the error like `AutoSendSwitch` — *from 5b-2 Minor 4*
- [ ] Playbook disable/enable intents submit the current (unsaved) title/template fields (`agency/playbooks/actions.ts`) — *from 5b-2 Minor 5*
- [ ] Playbook titles aren't checked for placeholders (`packages/tools/src/tools/playbooks.ts`); refuse `{{` in titles — *from 5b-2 Minor 6*
- [ ] `SignOutButton` clears guest cookies only after `authClient.signOut()` succeeds — a failed sign-out can leave a stale guest session — *from 5a fix-wave re-review*
- [ ] `/go` skips client-facing status filters (a draft brief's webhook link 302s then 404s) — *from 5a T15*
- [ ] Starting-point copy: approval message "Approved — sent to the client." is wrong when delivery is unconfigured (show by status); "In progress" label while waiting for the agency to track a rival; deleted-brief notice link 404s after `--force` — *from phase-12*

### Evidence, timeline & profile
- [ ] Evidence: chip ordering can make an `html`/`vendor_json` piece "Evidence 1"; `EvidenceImage` `onError` can miss a pre-hydration 404 (add a mount-time `complete`/`naturalWidth` check) — *from 5c-1 final review*
- [ ] `compare_snapshots` screenshot fallback doesn't filter `capture.status` (a blocked capture's screenshot can be "as of") — *from 5c-1 final review*
- [ ] Timeline includes open moves that started before the period; profile's "Open moves" KPI link is unfiltered — *from 5c-1 final review*
- [ ] Competitor profile: KPI cards `text-xl` vs the brand's 34px; dangling " · " when `lastStatus` is null; empty sources list has no text; empty prices array renders an empty span; "See pricing" under "No prices seen" — *from 5c-1/5c-2 task minors*
- [ ] Long `del`/`ins` `aria-label`s on the large-diff fallback — *from 5c-1 final review*

### Data views & charts
- [ ] Ads "More ads" link loops to page 1 past the offset cap of 5000; Reviews "More" link resets past the cap; `?business=self` while the self business is pending says "no longer available" — *from 5c-2 Tasks 7, 12*
- [ ] Heatmap "Show as table" cells unstyled and omit the delta; SVG text shrinks at phone width — *from 5c-2 Task 11*
- [ ] `GeoGrid`: legend emits duplicate `<defs id="geogrid-hatch-legend">` five times; fixed hatch id collides with two grids on a page; ragged rows not defended — *from 5c-2 Task 15*
- [ ] `get_geogrid`: a selected scan older than the newest 12 is missing from the scans list — *from 5c-2 Task 13*
- [ ] Mobile drawer stays open across a resize to `lg` — *from 5c-2 Task 18*
- [ ] Legend: pinned "You" leads instead of following the name sort; rival "Other (average)" rating is an unweighted mean of monthly averages — *from 5c-2 re-review*
- [ ] `ReportView`'s "Changes detected" isn't sorted by count like the email; trend table plain-text fallback lists one cell per line — *from 5a T14, 4b Task 6*

### Settings, auth & admin screens
- [ ] Agency banner says "Update payment method" (past_due / read_only) even after the subscription ended; the link lands on Subscribe, but the copy is 9a-binding — owner call — *from phase-9-fixes*
- [ ] DEMO: fake Checkout never completes (no webhook in DEMO), so the trial banner and seat cap stay after "Add payment method" — only if the owner wants to demo the paying flow — *from phase-9-fixes*
- [ ] Google sign-in button has no busy/error handling; `magicLink` call not wrapped in try/catch (button stays disabled) — *from 5a T12*
- [ ] Membership switcher form inside `DropdownMenuItem asChild` (possible Radix dismiss/submit race; add a test) — *from 5a T13*
- [ ] Webhooks page shows raw kind slugs (list can drift from `AGENCY_KINDS`); `toggleWebhookAction` has no error path; `ColorField` labels not linked; logo preview refetches per keystroke; branding save drops a stored `fromEmail` (latent) — *from 5a T18*
- [ ] `PrefSwitch` discards `isPending` and doesn't revert on a failed `setPrefAction` — *from 5a T17*
- [ ] Dismiss/remove dialog refusal text persists across close/reopen — *from 5b-1 re-review*
- [ ] Usage page has no empty state for a zero-client agency; `list_alert_queue`'s `.limit(200)` gives no UI hint — *from 5b-2 Task 4, 5b-1 Task 12*
- [ ] Feed brief pill hardcodes `text-[#B45309]` (use `text-accent-text`); AI page `Badge` secondary variant isn't the brand info pill; alert-rules "3 a day" text hard-coded; `NavRoleFlags.manageCompetitors` unused — *from 5c-1*

### Phase 8 follow-ups (console, support sessions, costs)
- [ ] Console stats: `wau`/`last_activity_at` ignore `membership.created_at`; `runDailyStats` accepts today/future `day`; backfill is 400×agencies sequential queries — *from 8a*
- [ ] Console UI: name sort `<` vs `localeCompare`; spend delta "up" tone; duplicate "Overview" nav labels; unused `email?` in `nav.ts` viewer type — *from 8a*
- [ ] Console tests: CLI add/revoke SQL; 27/28-day health boundary; `tilesOf` ms28 filter + NULL-last sort; agency-cascade/`relforcerowsecurity` asserts; page-level tests; E2E audit before/after count — *from 8a*
- [ ] Support sessions: member-less env-only platform owners can't reach `/platform` or open sessions; operator console list shows the raw platform user name (agency list falls back to "Rival Monday support"); a >64-char non-RFC email local part is only partly masked — *from 8b*
- [ ] Support audit: direct service reads in sessions (`listTeam`, `listClientRecipients`, `getAgencyBranding`, `listWebhooks`, `/go`, evidence/PDF bytes) aren't session-audited themselves; `end_support_session` audit lands in the operator's home agency — *from 8b*
- [ ] Support tests: `support_session` cascade-delete; ok-at-59-min resolve case — *from 8b*
- [ ] Costs: Neon settings dialog wrongly shows "Warnings need a dollars-per-CU-hour rate." (gate the rate hint on `kind==='balance'`, fix `costs-components.test.tsx:328`); key present but no reading shows "Not configured" ("No reading yet" is clearer); Apify with no cap gets no hint — *from 8c*
- [ ] Costs job: `evaluateAlerts` throw → job retry re-inserts the day's snapshots (wrap in try/catch); concurrent refresh + cron can double-email (conditional update before send) — *from 8c*
- [ ] Costs UI/edges: strip read audits every owner `/platform` view; strip sits outside the 1560px wrapper; services-table Actions header in read-only; empty warnDays → 0; run dataviz skill on chart colours; Neon `from==to` before 01:00 UTC on the 1st; Anthropic partial sum after 3 pages; empty `APP_URL` → relative link in email; tools' toFixed silently rounds threshold/rate; read.ts 12 sequential queries; seed rows duplicated in migration 0051 and `@cs/db` test helpers (add cross-reference comments) — *from 8c*

## Waiting on real data / external events
- [ ] Re-pull Aire Serv reviews + ads (command in [OPS.md](OPS.md); pass only advertisers `AR11447192921745391617`, `AR09867956064303972353`), diff `review_id`s against the 546 from 2026-10-01 — if unstable, dedupe on the content-hash key — *from 2b live verification*
- [ ] Owner-verify alerts per outcome (sent now / 17:00 digest / withdrawn) and Recommendations rating — waived until real alerts: the 2026-10-13 pull and a full re-pull on 2026-10-14 (all 8 tracked competitors) gave 1 new event (Aire Serv hiring, score 12 → archive) and 0 alerts; next chance is the 2026-10-20 weekly pull — *from 5b-1 verification*
- [ ] Before switching on `WEB_MONITORING_ENABLED`: `accept_competitor_suggestion`/`add_competitor` (`packages/tools/src/tools/competitors.ts`) return `'disabled'` for a prospect; start discovery in `convert_prospect` — *from 5b-2 final review Minor 1*
- [ ] `price_extract` live-verified only by tests — no web captures until the bot page exists — *from 3c live verification*
- [ ] Verifier strictness: at τ 0.85 true facts often score low (0.36, 0.16; alert headline 0.84) — watch brief `dropped` counts on pilot data before changing τ/routing (labelling: see Owner) — *from 4a/4b*
- [ ] Accuracy report "consider routing to the LLM" note: restrict pairing to `reason = 'shadow'` samples before acting; keep review decisions on Jev until ~200 pilot labels — *from 3d final review, owner 2026-10-03*
- [ ] Quarterly report verified only by tests — no client predates a quarter yet; check the first real one — *from 4b live verification*

## Owner (user-owned items: validation, LOIs, counsel, accounts, domains…)
- [ ] Postmark broadcast stream (`POSTMARK_BROADCAST_STREAM`) must use unsubscribe handling **"None"** (else Postmark suppresses without setting `unsubscribed_at` and tips 406-retry) — *phase-10*
- [ ] Support-session email says "Reply to this email" but `replyTo` is null (replies go to `EMAIL_FROM`) — needs a reply-to address/env var — *from 8b*
- [ ] Register **rivalmonday.com** / **.ai**; trademark knockout search — *from HANDOVER §7*
- [ ] Publish the bot page `https://rivalmonday.com/bot` — required before crawling any real competitor (never run `collect-once` without `--vendors` until then) — *from Phase 1/2 carry-over, HANDOVER §5 item 6*
- [ ] Phase 0 validation before the Phase 7 pilot: GoHighLevel/Vendasta marketplace check, 5 agency letters of intent, US counsel review (crawling, review privacy, AI claims about named competitors) — *from roadmap Phase 0, HANDOVER §7*
- [ ] Create an **R2** bucket + token before production (dev stores evidence on local disk) — *from HANDOVER §7*
- [ ] Confirm Jev pricing (0.042 $/M input is a placeholder) before costs feed budget caps — *from Phase 1, HANDOVER §7*
- [ ] Postmark before the pilot: request account approval (to deliver outside `@nofingers.ai`), add SPF/DMARC if not done, put the **live** server token back in `.env` — *from HANDOVER §7*
- [ ] On deploy at `rm.nofingers.ai`, set `APP_URL=https://rm.nofingers.ai` (deep links; still `http://localhost:3000`) — *from HANDOVER §7*
- [ ] Review a few rendered template alerts before real clients (fallback reads the raw event summary, unedited for tone) — *from HANDOVER §7, 4b*
- [ ] Label `verifier_decisions` samples (5 unlabelled in `cs_dev` as of 2026-10-04; `decisions export --task verifier_decisions`) before changing τ or routing — *from HANDOVER §5 item 3/§7*

## Unscheduled / ideas

### Features
- [ ] **UI/UX review against Mobbin** (Mobbin MCP): compare the agency, client-workspace, onboarding and console screens with real-world app patterns and file concrete fixes; scope and details to be provided by the owner at planning — *owner, 2026-10-17*
- [ ] **Affiliate program (fully featured)**: affiliate sign-up and approval, referral links/codes attributed through agency sign-up (Phase 10) and billing (9a Stripe), commission rules (one-off / recurring %, cookie window, clawback on refund or churn), affiliate dashboard (clicks, sign-ups, conversions, earnings), payouts, console management + fraud checks; scope and details to be provided by the owner at planning — *owner, 2026-10-17*
- [ ] Public "request access" form / marketing landing page (declined for now) — *phase-10*
- [ ] Console: activity `client_activated` lacks `clientName` (record activation, e.g. `client.activated_at`); `list_platform_activity` loads all sources per call (bound/paginate in SQL); agencies list silently capped at 100 (paging or notice) — *from 8a*
- [ ] Cost APIs for Vercel / Cloudflare R2; Neon storage cost; costs CSV export; renewal reminders — *from 8c*
- [ ] REST API (spec §8.1) — *from 6a*
- [ ] Knowledge base: file upload (PDF/DOCX), browsable Help page (`/agency/help`, `/c/<id>/help`), agency/client self-authoring (`manage_knowledge`), KB in weekly briefs, citation analytics — *from 6c "Not in 6c"*
- [ ] Brief writers (`brief_writer`/`playbook_writer`/`theme_discovery`) back to sonnet-5 (probe 2026-10-12 OK for ZDR + strict json_schema) — *from 6b*
- [ ] Agencies add their own business types (verticals) and services, not just built-in packs — *from end-of-Phase-5 owner request*
- [ ] Generic runbook with per-client customisation (replaces per-vertical packs; merge with the custom-verticals item above) — own future phase — *owner idea 2026-10-17*
- [ ] Volatile-mask unmask UI (AM): pass the capture id explicitly; manual unmask re-pinned only within the 6-capture window — *from 3d, 5c-1/5c-2*
- [ ] SMS (Twilio) — `sms` channel slot reserved — *from 4a/4b (Phase 7+)*
- [ ] Agency custom domains; custom sending domains + DKIM per agency — *from 4b, 5a*
- [ ] Passkeys/2FA — *from 5a*
- [ ] Per-user digest hour; translating emails; "send now" for alerts — *from 4b*
- [ ] Agency voice settings for the brief writer — *from 4a*
- [ ] Batch-priced brief writing (not needed at pilot volume) — *from 4a*
- [ ] Per-client page deactivation; drag-and-drop reordering; agency-wide recommendation board — *from 5b-1*
- [ ] Delete/archive a prospect (needs soft-delete first); per-agency default caps/limits — *from 5b-2*
- [ ] Ad images (vendor media URLs expire and leak viewer requests); map tiles under the geo-grid; dark chart theme (with the app's dark theme) — *from 5c-1/5c-2*
- [ ] Own-site prices: a "you" column; feed ads/own-website prices into `price_point` (3c decision 11) — *from 3c, 5c-2*
- [ ] Change-region boxes on screenshots (owner: not wanted for now) — *from 5c-1*
- [ ] Instagram Business Discovery (needs a Facebook app, a connected Page and app review; Graph API v26.0) — *from Phase 2 planning*
- [ ] Decide the `briefs_only` feature flag — *from Phase 1 review*
- [ ] `tier_change` event when a tracked competitor's tier changes (deferred: `detected_change_subject_check` needs a capture or rank scan) — *from phase-12 plan 12a P4*

### Collectors
- [ ] Tracked pages: re-discovery never deactivates unselected pages; `active: true` re-activates human-deactivated pages; http/https and www/bare tracked separately — *from 2a review*
- [ ] Claimed pages are lost for a cadence if enqueue fails mid-batch or a capture job exhausts pg-boss retries — *from 2a review*
- [ ] Spec §4.4 capture status enum lacks `error` — update the spec — *from 2a review*
- [ ] Smaller 2a items in the Phase 2a SDD review record (git history) — *from 2a review*
- [ ] Unexplained one-off `@cs/collectors` full-suite failure (249/249 on re-run) — *from 5c-2*
- [ ] Discovery (parked): re-tracked competitor keeps a stale `competitor_signal` until Monday; a failed first-ever run's suggestions stay hidden; sweep clock from `started_at`; bulk-accept lock order; deduped enqueue not detected — *from 12a*

### Engine — known limitations
- [ ] Tag-stage version bump doesn't re-tag already-tagged changes — *from 3a/3d (decision 7)*
- [ ] A competitor whose `place_id` changes is never re-linked (`findExistingCompetitor`/`ensureSelfCompetitor` match the old id); self link matched from `client.place_id` only (no domain) — *from 3c*
- [ ] `price_block_map` never re-mapped on catalogue change, partial failure or rotating copy; no page-level lock for concurrent price jobs (equal `captured_at` not ordered) — *from 3c*
- [ ] Review-spike thresholds (`REVIEW_SPIKE_Z`, `REVIEW_SPIKE_MIN`, `REVIEW_BASELINE_WEEKS`) not pack-tunable; `review_spike` reuses one z-score for velocity and complaint Poisson — *from 3b/3c*
- [ ] GBP category/service additions/removals are one change per entry, not grouped per capture — *from 3b*
- [ ] `alignBlocks` same-key pairing can give a volatile block's identity to an inserted sibling (shared with diffing — fix carefully) — *from 3d Task 12*
- [ ] Late-added vertical doesn't re-analyse already-analysed reviews; theme approved mid-window not asked of older reviews — *from 3c (decisions 4, 8)*
- [ ] Churn: log reports pre-cap suppressed count; `CHURN_SUPPRESSED_MAX` untested; masked non-money blocks on churned pages go to `suppressed` (check spec intent) — *from 3d Task 13*
- [ ] `extractZips`: `'TX 36000 BTU'` reads as a ZIP; "24000 filters and 36000 belts" list misread (decision 17, accepted) — *from 3d Task 14*
- [ ] `volatile_block` with null `key_capture_id` resolves at window start; AM-unmasked row resolves at index 0 once its capture ages out; masked block shifting onto an unmasked key loses its mask — *from 3d Task 12*
- [ ] Merge: concurrent tag jobs can create two events for one offer; `drain.ts` counts a merged change as `events++` — *from 3b Task 11*
- [ ] Moves: territory-signal tagging not exclusive; price-war `else if` drops ad-burst evidence; `MovesRunResult.updated` counts unchanged; nightly race fails on `move_open_unique` (accepted) — *from 3b Tasks 13–14*
- [ ] AM "updated" path doesn't recompute `details.offer`/summary or clear `needs_review` on detach — *from 3d final review*
- [ ] Anthropic batch: submit precedes `model_batch` insert (orphans not auto-reconciled); apply not idempotent; `collectModelBatches` no per-item try/catch; no `ok:false` ledger row on submit/status/results throw — *from 3d Tasks 8–9, 4a*
- [ ] `ensureSelfCompetitor` read-then-write race on a place-id change — *from 5b-1*
- [ ] Structured: `ad` started/stopped queries lack `ORDER BY`; `rank_scan.status` no CHECK; jobs lookback ignores `capture.source`; `upsertReviews` hard-codes `source: 'google'` — *from 3b Tasks 2, 5–7*
- [ ] Prices: unhyphenated "off peak" read as discount; dead `-1` in `pricesInBlock`; over-cap pages (> `PRICE_MAX_BLOCKS`) end no spans — *from 3c Tasks 8–9*

### Briefs, alerts & delivery
- [ ] Brief rules: period-header dates allowed in rules-only fields; "detected in this period" can overstate for late-scored events; word numbers ("three") and weekdays unchecked — *from 4a*
- [ ] Two active items for one move both get a recommendation; re-featured moves re-list earlier-featured events — *from 4a*
- [ ] Failing move recommendations retry nightly with no backoff — *from 4a*
- [ ] Long verifier runs vs the 30-min `BRIEF_STALE_MINUTES`: batch `supportCheck` or heartbeat the claim — *from 4a*
- [ ] `recommendationFromItem` cuts `recommended_action` at 200 chars mid-word — *from 4a*
- [ ] `brief-once --force` orphans AM feedback rows — *from 4a*
- [ ] Failing PDF render re-enqueued hourly for 7 days (≤ ~500 attempts) — add a failure counter/backoff if noisy — *from 4b final review*
- [ ] `alert_digest` rows not re-checked for retraction at send time; possible duplicate `alert-process` spend on a race; auto-send vs concurrent-edit race — *from 4b final review*
- [ ] Alerts: approval feedback says "approved" when release withdraws; withdrawn alert sends no `am_alert`; > 7-day alert approvable before sweep expiry; client with no contacts still marked delivered — *from 4b Tasks 12–13*
- [ ] Quarterly report counts recommendations by *current* status, not at quarter end; `renderReportPdf` untested, no status guard — *from 4b Task 17*
- [ ] Starting point (parked): home card when exhausted after 3 attempts; `editBriefItem` false warnings on self items; standard→quiet-at-delivery brief has no scorecard; self `ads_google` diff/tag spend; soften facts (BASELINE_BODY "map rankings" when none, 0-review velocity, `complete_profile` claim wording) — *from 12b final review*

### Code quality & test gaps (fold in when touching the file)
- [ ] Phase 1 registry leftovers: `countRows` only recognises `{items}` outputs; log the original handler error when the audit write also fails — *from Phase 1 review*
- [ ] Conventions to keep checking on new read paths: strip `upsell_tag` for client roles; client-facing readers filter status (brief approved/sent, items `active`, alert delivered); sort brief items by `ord` (never assume 0-based) — *from 4a/4b cross-phase*
- [ ] Phase 6 test gaps: ask-rls WITH CHECK + user-delete cascade; ThreadList/SaveDialog/StarterChips components; chip → auto-send E2E; `expectNoUsageNumbers` scans only main; settings toggle not retry-safe; KB: GIN guard title + kb index, title/body CHECK and unset-role RLS tests, MCP title redaction, embed id↔vector mapping, chunker edge cases (`C#` heading, long heading paths, fences, CRLF), brittle `@kb` selectors (`selectOption({index:1})`) — *from 6b/6c*
- [ ] Phase 1 cleanups: `@types/node` ^22 vs Node 24; slug regex duplicated in verticals; `register()` not atomic; mkdtemp dir not cleaned in packs test; pg-boss batch loop assumes batchSize 1 — *from Phase 1 review*
- [ ] 3b minors: hiring-move summary not truncated; `buildStructuredSummary` branches untested; `FakeAi` doesn't record scope; `engine-once --moves` untested at CLI; consolidate the "no-retry queues" worker test — *from 3b Tasks 10, 15*
- [ ] 3c minors: `TITLE_WORDS` includes `'the'`; GBP `domain` not in redaction names; `review_analysis` confidence spans all verticals; `ReviewInsightsResult.errors` conflated; `priceMatrix` test gaps — *from 3c Tasks 1–10*
- [ ] 3d minors: task-constant doc comments; `ai.ts` ~135 duplicate jev check; shadow vs review reason precedence; `formatReport` column widths; `validThresholds` evaluated twice; `volatile.test` raise `testTimeout` — *from 3d Tasks 1–14*
- [ ] 4a minors: `clientFk` typed `any`; `rebuildEventText` business names; `schedule.ts:103,107` non-null asserts; `select.ts:2` "top 3–5" wording; `playbooks.ts:106` `themeName` fallback; `$50000` via ZIP path; verify/test gaps (Tasks 9–13) — *from 4a per-task*
- [ ] 4b minors: `delivery.test` coverage; `addContact` duplicate-email raw error; `updateClientDelivery` empty patch; Teams markdown escaping; transport error tests; non-atomic file transport; `createBrowserCache` duplicated; `WorkerDeps` doc comments — *from 4b Tasks 1–18*
- [ ] 5a minors: last-admin revocation deadlock → raw 500; pending invitations left on member removal; N+1 in `myNotificationSettings`; `files.ts` duplicates `isHiddenToolError`; branding fetched twice per request; test gaps (T3–T19) — *from 5a per-task*
- [ ] 5b-1 minors: zod bounds looser than limits; `packFor` vs `deps.packs`; `add_tracked_page` keeps old `source`; `list_brief_queue` N+1 `isUntouched`; E2E near Better Auth's 5-link/IP/60s limit — *from 5b-1 per-task*
- [ ] 5b-2 minors: `resolve.test.ts` lock poll; `reviewQuestions` drops unknown keys silently; malformed `PLATFORM_ADMIN_EMAILS` no warning; `enqueue` ignores null `send()`; prospect report "as of" dates; test gaps — *from 5b-2 Tasks 2–12*
- [ ] 5c-1 minors: `requireVisibleEvent`/`get_move`/`get_competitor_timeline` test gaps; `list_moves` double subquery; `set_alert_rules` redundant SELECT; `LineChart` edge cases and table caption/`scope`; duplicated `Pill` type — *from 5c-1*
- [ ] 5c-2 minors: price/ads/reviews/sov/heatmap test gaps (Tasks 1–17); private UUID helper in `changes/params.ts`; non-null asserts `pricing/page.tsx:124-126`; mis-indented `line-chart.tsx` ~150–176; E2E `noSideScroll` without waiting (`data-views.spec.ts:127,131`) — *from 5c-2*
- [ ] Demo/dev panel: reset stuck "resetting" if the child never closes output; POSIX detached reset survives Ctrl+C; `links`/`findContact` use live `dbs()`; coverage-test walker not transitive; no two-seed determinism test; restore/`isLocalHost` test gaps; `redactSecrets` misses IPv6/bare hosts — *from demo-data review 2026-10-09*
