# Backlog

Grouped by target. Each item: `- [ ] <item> — *from <source phase/date>*` (+ short context if needed, keep spec/file refs).
Rules: new items go under their target; done items are deleted (git history keeps them); keep each item ≤ 3 lines.

Migrated 2026-10-11 from the roadmap's per-phase carry-over sections (full text: [archive/2026-10-11-roadmap-full.md](archive/2026-10-11-roadmap-full.md)) and HANDOVER §5, §7, §8.

## Phase 7 — Hardening & pilot
> 7b/7c planned 2026-10-23: items below are owned by the plans `2026-10-23-phase-7b1|7b2|7c1|7c2` (each plan's docs task lists the lines it closes). Not folded: Launch gate (standalone before the live deploy), ANN index (when pilot volume shows slow search).

### Launch gate (before 7a1 Task 12, the live deploy)
- [ ] **HIGH - gates 7a1 Task 12:** shell DB stages: (app) shell ~12 sequential stages/page (max 22), (platform) 19-20 (`list_platform_costs` per-snapshot-row queries); target `--assert-db-stages 8`; also time the Better Auth pg pool and profile ask/[threadId], reports/[reportId], kb/[id] — *from 7a*

### Security & data
- [ ] 7b: `email_resend` retention (purge rows older than 1 h); decide the webhook host allow-list `.logic.azure.com` / `.environment.api.powerplatform.com` (any Azure tenant can get one, so a tester can make us POST to their endpoint; not internal SSRF; same policy as the real sender); webhook test limit is per webhook (add a per-agency cap) — *phase-15c2a*
- [ ] Retention keeps `brief_item.evidence_ids`, `recommendation.evidence_ids` and `alert.evidence_ids` evidence for the brief's/alert's lifetime — *from 4a/4b cross-phase*

### Budget & cost

### Scale & performance
- [ ] Re-ask sweep hashes 180 d of review text per idle sweep; a stored `review.text_sha` column would remove it — *from 15b-3b*
- [ ] Multiple worker replicas / autoscaling on queue depth: move per-host crawl politeness (`collectors/src/web/rate-limit.ts`) and vendor limits (`createVendorLimiter`) into Postgres, check every cron job tolerates a second runner; then lift the one-replica rule in root CLAUDE.md — *from owner Q 2026-10-15; shrunk by phase-7c2*
- [ ] Page latency on the remote Neon DB: pages took 28–36 s in E2E (Playwright timeouts raised to 90 s/test, 15 s/expect in `playwright.config.ts`) — look before launch — *from 5c-2*
- [ ] Cross-replica rate limiter before scaling the worker — *from 2a review; shrunk by phase-7c2*
- [ ] Flaky Neon connections in tests (`ECONNRESET`/`connect ETIMEDOUT` in `db` RLS tests, `collectors` `suggest.test.ts`, E2E seed); one un-bisected `@cs/collectors` full-suite failure (passed 249/249 on re-run) — add retry/pool settings or bisect — *from 5c-2 / demo runs*
- [ ] Per-task AI HTTP timeouts (60 s × 3 worst case, `packages/ai/src/http.ts`) — *from Phase 1 review (Vercel)*
- [ ] PILOT vendor-collect expiry watch counts only final-attempt expiries (retry-expiries need `state IN ('retry','active','completed') AND retry_count > 0` or the vendor_call ledger) — *phase-7c2*
- [ ] Worker heartbeat re-runs the `cs_web` queue GRANTs every beat; retry only while not ok — *7c2 final review*
- [ ] Limiter/worker: "queued 5 s keeps full timeoutMs" test uses real timers; deps wiring test asserts `typeof` only; boss "throws on one poller" test does not attribute the poller; concurrency log lists only raised queues; idle pollers raise pg-boss direct connections (~57 to ~80: watch in Task 12) — *7c2 T1/T2*
- [ ] Captures: limiter cursor/last maps never pruned; captures queued before deploy lack the `capture:` singleton key (one-time duplicate); fixture `task_get` ledger rows carry `fx_` ids ($0); fixture-fetch abort listener not removed — *7c2 T3/T9b*

### Deployment
- [ ] Deploy note: migration `0025`'s `client_score_thresholds_check` fails on any existing malformed row — check before applying to a DB with real clients — *from 3d final review*
- [ ] Deploy note: `magicLink({ storeToken: 'hashed' })` invalidates links issued before the cutover (15-min window) — expect a few "expired" reports — *from 5b-2 final review Minor 7*
- [ ] Set `"agentGuidance": false` in `turbo.json` if AGENTS.md churns — *from Phase 1 review*

### Phase 6 follow-ups (MCP, Ask, knowledge base)
- [ ] MCP `manage` scope for client roles; ANN vector index (events, pages, `kb_chunk`) — *from 6a/6c*
- [ ] MCP hardening: vector-only pages; unredacted model-written titles; uncapped `fetch` brief text; connector name `rival-monday` not white-labelled; screenshot mime hard-coded; `resources.ts` upsell offset-0; `add_recommendation` not one tx; `revoke_oauth_grant` partial failure; consent second-tab race; `clientScope[0]` assumption — *from 6a*
- [ ] Ask hardening: widen composite FK to `(id,user_id,client_id,agency_id)`; unknown clientId → raw FK 23503; starters skipped if `notifyBriefOutcome` throws; `dataBlock tool=` unescaped; per-call model budget; trace args may quote tool text; `askReviewAllowed` write non-atomic — *from 6b*
- [ ] Ask parked: lookalike markers as plain text; delete has no isUuid precheck; SSE `final.action` echoes proposed input; unseen thread after pre-persist error; `?q=` auto-send counts toward quota (auto-send known starters only); `0044` relies on owner BYPASSRLS — *from 6b*
- [ ] Ask grounding: sentence split on "1."/"e.g."; nested-bullet indent lost; empty-evidence verifier call; metadata-only fallback for html/screenshot evidence; pure how-to answers: uncited filler sentences now checked against empty `ev:` text (watch traces) — *from 6b/6c*
- [ ] KB robustness: `kb-embed` should throw when the provider returns fewer vectors; validate scope before `kb-import` enqueue; `kb-sync` 7200 s expiry vs many articles; archived import jobs read as failed; seed-row guard into `saveArticle`; `previous_body_md` also set by manual edits; `get_kb_article` skips active-client check; `sourceUrl` not http(s)-restricted; `kbNamesFor` = 3rd copy of brand-name logic (invert into `@cs/tools`); KB hits pass no business names to redaction — *from 6c*
- [ ] Multi-membership is resolved for Ask only; other routes still pick one membership — *from 6b*

### 7a follow-ups
- [ ] 7c: embeddings 8 s x2 also bound worker batch embedding; if `llm_call` shows embeddings ok=false at ~8 s, add an `embeddings_batch` task (30000x3, not request_path) — *from 7a*
- [ ] 7c: `withMonitor` should check in only for the cron payload; job retries re-capture to Sentry — *from 7a*
- [ ] 7c: structured logging: `JSON.stringify` interpolated in messages; `redactForLog` may strip keys `text/content/body/output`; `tracesSampleRate` hard-coded 0.1; `main.ts` order/shutdown untested — *from 7a*
- [ ] 7c: tests: predeploy missing/wrong-typed thresholds untested; `ci.yml` edits do not trigger the shape test under `test:affected`; e2e "destination stream closed early" noise — *from 7a*
- [ ] 7a2/7c: `Sentry.captureException(raw pg error)` skips `redactForLog` (beforeSend still redacts); `scrubUrl` guard skips lowercase/prefixed transaction names, `ws:` URLs, leading whitespace; `tagRequest` only via `callTool` — *from 7a*
- [ ] 7a2/7c: `contact_bounced:<id>` dedupe is permanent (key by MessageID); sign-out/`/support/exit` end a session with no audit row; inbox + notification-settings pages read via service fns in support (unmasked?); platform overview sums keep archived agencies' daily-stat rows — *from 7a*
- [ ] 7a2/7c minors: T6 no quarterly PDF overwrite test; T7 no `support_view_pdf` subject kind, files audit tested only for evidence, notification settings page in support (consider `notFound()` like `/inbox`); T8 bounced contact looks inactive (`INACTIVE_OK_KINDS`; add `bounced_at`) — *from 7a*
- [ ] 7a2/7c: purge dry-run counts are not one snapshot — *from 7a*
- [ ] Later: orphaned Better Auth users after purge; evidence/object pruning via `evidenceReferenced`; guarded forward proxy / undici `connect.lookup` (DNS rebinding, `route.fetch` buffering), POST->GET on sub-resource 30x, script redirects after DOMContentLoaded, WebRTC/preconnect unrouted (SSRF guard) — *from 7a*
- [ ] Later: `.pnpmfile.cjs` drops drizzle's optional `@opentelemetry/api` peer (revisit if drizzle needs OTel); `/bot` is dynamic (root layout reads cookies); migrate root `globalPassThroughEnv` to `global.passThroughEnv` — *from 7a*

### 7c1 follow-ups (quality gates, evals)
- [ ] Evals: `record --case <id>` single-case merge; flush cassette on budget stop; omit `topic.*`/`sentiment.mae` when n=0; validate baseline JSON; cassette `version` guard; rebuild `changes` once real web changes exist (R15) and re-baseline after the owner confirms labels — *phase-7c1*
- [ ] Ask: citation-repair follow-up for thinner answers (guard runs after `supportCheck`; misses spelled-out numbers/relative dates); eval B2 splitter vs guard `splitUnits` divergence; ~2 % invalid-JSON turns (likely per-call `AbortSignal.timeout` firing during `res.json()`, mislabelled) — *phase-7c1*
- [ ] Isolation suite gaps: shared `global_public` rows and `auth` schema outside the write fingerprint; viewer "other user's row" cases; `reinsertAs` accepts "permission denied" without an INSERT-privilege check; dedupe `requireOwnClient`/`requireVisibleClient` — *phase-7c1*
- [ ] Briefs evals: bare-year and bare-number bait B2 edge cases; injection H1/H3 target-phrase canaries — *phase-7c1*
### 7c2 follow-ups (scale, rehearsal, readiness)
- [ ] Rehearsal AI fidelity: tested against one synthetic schema; real `ai.yaml` caller schemas (recJson, draftJson, tailor, starters `minItems 4`, numeric_facts, starting_point_why, theme discovery) may take fallback paths, so the rehearsal could load-test fallbacks. `minimalValue` ignores `pattern`/`format`; `collectBatch` in rehearsal throws a misleading `ANTHROPIC_API_KEY` error; latency floor at p50 — *7c2 T10a*
- [ ] `guardManifestRun` compares the strict hostname: pooler vs direct host is refused with no hint (documented in OPS); improve the message or compare the endpoint id. Fault-test alarm assertion loosened; rehearsal CLI wiring untested; "fx5 does not slow the others" is a lag proxy (retune after Task 12) — *7c2 T10b*
- [ ] Readiness: partial send failure re-emails all recipients next hour; `windowOpenedAt` is off 30/45 min in half-hour zones (US-only pilot); no Saturday/DST-weekend checkpoint test; `findReadinessIssues` reruns per page load; no `HelpTip` on the readiness section (needs owner copy); the section keeps the `card` wrapper until phase-16 migrates the page; a resolved `starting_point_late` / weekly key never reopens, so a client unpaused late (same key) gets no new alert — *7c2 T6/T7/final review*
- [ ] Tests: `tenant.test` "cannot write rows into another agency" now re-proves only the grant; `table-classes.ts` `ops_alert` out of alpha order and `OpsAlertSeverity` duplicates the CHECK list; `settings/ai` test name says "lacks mcp" (gate is `mcp`) — *7c2 T4/T5/T8*
- [ ] Feedback: mailto addresses not `encodeURI`d; brief page feedback test is one big `it` — *7c2 T11*


### Model ops
- [ ] Run `jev.live.test.ts` once with a real `TYPESAFE_API_KEY` (make `@cs/ai` tests load `.env`) to confirm 0- vs 1-based scores — *from Phase 1 review* (7c2 Task 13, owner)

### Pilot
- [ ] Phase 7c: `search_reviews` input is not `.strict()`: an old MCP client sending `themeId` gets unfiltered results silently. Decide whether tool inputs become strict — *from 15b-3b*
- [ ] Exercise `/link-other-account` live (never run live) — *from 5a* (7c2 Task 13, owner)
- [ ] Review/rename/remove the `CS Dev Verification Agency`/`Client` (`aaf5e009-…`/`25f99947-…`) before real onboarding — *from HANDOVER §5 item 5* (7c2 Task 13, owner)
- [ ] Future: buying extra credits (self-serve top-up) — *phase-7b1*
- [ ] 7b2/later: confirm the Jev price, then lift the d19 exclusion (`SPEND_GUARD_EXCLUDED_PROVIDERS`) — *phase-7b1*
- [ ] 7b1 engine/worker: handlers that swallow `AiPausedError` internally (generateBrief, alert template fallback, setup-suggestions, lead-preview) lose one in-flight attempt; a prospect snapshot queued before a pause still runs its vendor pulls; archived-agency clients still count as O11 trackers; spend-paused runbook tailoring stays `skipped`; events aging out during a pause are never scored; `app_user` can read `spend_limit_usd`/`spend_paused_at` under RLS; one-time auto competitor search refused as `spend_paused` is not retried (agency runs a manual search); null-scope ledger paths (engine vertical stages, discovery/classify, leads, embeddings, own crawl) stay unattributed — *phase-7b1*
- [ ] 7b1 polish (db/tools/worker): `spend-guard.ts` bare `console.warn`; extra `platform_setting` read per budget/usage/portfolio call; no negative cache on guard read failure; `sendStaffEmail` ~ `sendLowEmail`; `rowsOf` duplicated; `spendByClient` CTE scans all competitors; swept orphan batches counted as `expired`; PDF tick jitter; dead `if (!providerId)` branch; non-limit `set_client_limits` edits can lift a pause when under threshold; failed pending-row update can duplicate a provider batch after the 1 h sweep (cost only); missing tests (jobs/post batch ids, ads/google scope, mid-embed refusal, web guard wiring, body-read abort, exact-24 h edge); `timeoutSpy.mockRestore` not in `finally`; E2E "destination stream closed early" noise — *phase-7b1*
- [ ] 7b1 polish (web): events table shows raw kind enum and actor UUID; costs action error punctuation; client-limits input width classes; blank competitor/Ask field shows raw zod message; layout guard read runs after the costs read; prospect detail guide "Run snapshot again" lacks a 24 h pointer — *phase-7b1*

## Phase 9 follow-ups (billing)
- [ ] Client billing page: add an agency contact link ("contact {agency}"); `get_my_billing` returns no contact — *phase-15c2b2*
**Soon**
- [ ] `disable_client_billing`: re-check the row inside the tx (race with an ACH Checkout completing → subscription never cancelled) — *9b R27*
- [ ] Daily reconcile `payment_needed → active` doesn't lift a `paused_by='auto'` pause or set `last_paid_at` (paid client stays auto-paused; "is now paying" mail a month late) — *9b final M3*
- [ ] Client billing page after "turn off" (cancel at period end): shows "Not set up" next to "Your plan ends on …", Billing nav disappears while still paying; same for disconnected rows; amounts ignore `agency_connect.currency` — *9b M4*
- [ ] `checkout_completed` for a second live subscription is only logged (R11) → queue an agency notice for a live `untracked_subscription` (real double charge) — *9b M8*
- [ ] Billing pages auto-refresh after **every** Stripe round trip, not only Checkout/Portal returns: Connect onboarding return (`?connect=done`/`retry`), client billing actions (enable/disable, price change, resend, pause/resume) whose webhooks land later — reuse `RefreshUntilChanged` — *owner, 2026-10-16*
- [ ] `BILLING_FAKE_GATEWAY` accepted on Vercel preview and by the worker (refuse when `VERCEL_ENV` is set; worker ignores it) — *9a final re-review*

**Later**
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

## Phase 11 follow-ups (client onboarding)
- Flaky test → `page-controls.test.tsx` PinPageSwitch "shows a refusal, falling back to the server value" failed once under the full suite (timing; passes alone 3/3). (Phase 11 merge)
**Soon**
- [ ] `@cs/billing access.test.ts` reduced-trial test is order-dependent; `start_search` retry bound is only the 10-min cooldown (<= $3); setup idle reminder has no cycle component; concurrent double "Done picking" errors; starting-point card shows checks pending during setup hold - *phase-11*

**Later**
- [ ] 11b polish: no "billing on" success copy, `billingPrefill` live read per poll; setup stuck "5 of 5" (worker sweep); `clientBillingEligibility` import cycle; `invite_member` (client roles) allowed for paused agencies
- [ ] 11c polish: partial index on `lead.verify_token_hash`; `validateSummary` checks digits only; each verify use rotates the view token; a resubmit rotates the verify token (first link dies); snippet button hard-codes #47A8E7 (agency primary?); resubmit > 30 d after verify -> preview 404; nav lead badge loads 200 rows; confirmation retry still sent after the agency became non-serviceable
- [ ] Phase 13: sign-in page uses host default branding (breaks white-label once a second agency onboards clients) - check in 11b verification (e)
- [ ] phase-11-fixes polish: `DAY` literal duplicated in the invite-links form; import order in the swept files; agency CreateForm posts hint fields (schema strips them; tidy to SetupLookup keys); `DuplicateHint` not tied to the list via `aria-describedby` - *phase-11-fixes*

## Phase 10 follow-ups (agency onboarding)
- [ ] Delete superseded logo objects under `logos/<agency>/`; SVG `<!DOCTYPE`/`<!ENTITY` rejects Illustrator exports with "scripts or external links" copy (tweak copy) — *phase-10*
- [ ] Existing member whose second-agency invite breaks lands on `/agency` with no explanation (`onboarding-start.ts` checks membership first) — *phase-10*
- [ ] Welcome-email link may open the wrong wizard for a user with two open agencies; sign-up email subject echoes the typed agency name (strip URL-like text?) — *phase-10*
- [ ] Checkout return doesn't mark the plan step; wizard skip/continue tool failures show 404; team step has no post-invite hint — *phase-10*
- [ ] `/sign-up` pause read fails closed on DB error; invite email `expiresAt` recomputed (ms drift); `get_billing_summary` reads billing twice; `billing-notices.ts` repeats the admins+deliver pattern 5× — *phase-10*
- [ ] `couponFor` ignores `max_redemptions` (Stripe enforces; exhausted coupon → Checkout error) — *phase-10*
- [ ] Test hygiene: >120-char CHECK tests, `parseWebEnv` new-var test, funnel non-active `cardAdded` case, sequential double-run nudge test, refused-duplicate E2E fixed 3 s wait, mock-based console spies — *phase-10*

## Phase 13b follow-ups (local rankings)
- [ ] Soon: Stadia one-image probe (confirm `STATIC_MAP_WORLD_PX=512`, @2x size, max size; add a fixture) before enabling the key in prod; `SINGLE_SHOT` 3 h expiry on a long Sunday fan-out (pre-existing); `request_rank_scan` stale sweep covers all tenants and, with no DataForSEO-configured signal in `ToolDeps`, an unconfigured worker leaves a manual row `running` until the 3 h sweep — *phase-13b*
- [ ] Soon: Compare limited to the newest 12 scans (slider vs grid mismatch when `?scan=` is older); orphaned `rank-map/{id}/{oldHash}.png` on a hash change; failed map fetches ledgered at the full $0.06 while network-error fetches ledger 0 (redact the key on all error paths) — *phase-13b*
- [ ] Rankings data/logic: `get_geogrid` map non-null for a zero-snapshot scan; trend cursor lacks an id tiebreak; `tier_change` factors report unused weights; `block_key` dates like 02-30 roll over; demo `rank_change` ignores `diffRankScan` thresholds; `get_rank_settings` returns the raw legacy radius (41-80 fails resubmission); client components importing `@cs/engine` pull `node:crypto` via the barrel — *phase-13b*
- [ ] Rankings UI: cap fallback copy lacks client name/amount; weekly fallback date uses UTC; `queued` keeps "Scan running..." until navigation; cap/daily notes not `aria-describedby`; slider debounce compares a stale value; brief thumb snap-back mid-drag; ChangeGrid duplicates GeoGrid hatch defs — *phase-13b*
- [ ] Rankings tests: 0068 backfill untested; `fitStaticMap` centre/y-placement and zoom-clamp; agency 10/day `FOR UPDATE` concurrency; "never logs the key" and failure-ledger; trend legend order asserted only via `toContain('You')`; `tier_change` `failed` status — *phase-13b*
- [ ] Pre-existing on main: `apps/worker/src/jobs/leads.ts` fails the UTF-8 check (polish) — *found at 13b merge*

## Phase 15 follow-ups (UX & information architecture)
- [ ] Soon (15b-2 help hardening): filter agency-only `TipRow` labels out of client payloads server-side (alerts/profile/notifications pages pass literal labels); `@cs/core/glossary` subpath + bundle gate (agency-only terms `routing`/`seat`/`paused`/`upsell-tag` kept out of client bundles only by tree-shaking); `account.onboarding.skip` → `audience: 'agency'`; coverage reach lists not cross-checked against page role gates; Help pages list guides for pages the viewer can't open; spread-header helpKey check is per file; strip Markdown from Help search excerpts; Help search button focus ring — *phase-15b2*
- [ ] Owner decision (15b-2 sign-off): scorecard/briefs-detail say "First moves still open" vs glossary "First steps" — *phase-15b2*
- [ ] Owner decision (P6, 15c-2b-1): message-keyed server dedupe for "save as recommendation" (changes `add_recommendation` input); today a reload shows the Save button again for an already-saved answer — *from 15c-2b-1*
- [ ] Tools pass: refusal "Google place id looks wrong" (`packages/tools/src/client-input.ts:52`) still lower-case (owner decision 2) — *phase-15c2b2*
- [ ] Forms: a stale error stays after Discard on SaveBar forms (alert rules, delivery, profile, features; also the `settings/notifications/contact-form.tsx` pattern they copy) — *phase-15c2b2*
- [ ] Reports: quarterly report move dates render in UTC (`ReportView` takes no `timezone`); evidence copy "stored as raw saved page" reads oddly (`evidence/[evidenceId]/page.tsx:133`, lower-cased `EVIDENCE_KIND` label) — *phase-15c2b2*
- [ ] 15c-2b-2 leftovers (found, out of scope): `e2e/client-setup.spec.ts:127` comment says "place id"; starting-point-card `<h3>` without `<h2>`; Overview "N open" is a hand-rolled span; defaults `<form>` outside the card (spacing); no test pins thread-list empty line or TimelineCard wiring; billing chip test asserts className not `data-tone` — *phase-15c2b2*
- [ ] Flaky: `competitors/[competitorId]/page-controls.test.tsx` PinPageSwitch "falls back to the server value" failed once in the 15b-2 full suite (expected 'true' to be 'false'), passes alone 4/4 — RAF timing under load (see `apps/web/CLAUDE.md` PinPageSwitch note) — *phase-15b2 merge*. Also `src/server/mcp.test.ts` "PAT round-trip … returns tools/list" timed out at 30 s once in the 15c-2a `test:affected` run (78 min, all pkgs), passes alone 7/7 — *phase-15c2a merge*
- [ ] Tooling: `e2e:affected` tag selection pulls single tests out of `describe.serial` files (false failures in `kb.spec`/`new-vertical.spec`); `pnpm test:affected --base <sha>` selects no tests (use the default merge-base) — *phase-15b2*
- [ ] 13a: agency privacy URL and agency site URL in branding (agency `/start/v` CTA link, intake privacy link); Team invite From address is the lead-mail from-address (rivalmonday envelope for white-label) → 13a neutral domain — *phase-15c2a*
- [ ] 15c-1 deferred minors (no target): one shared `ui-primitives.test.tsx`; ConfirmDialog input id should use `useId`; chip hex duplicated in `status-chip.tsx` and `styles.css`; `labelFor` value type collapses to string; `EVIDENCE_KINDS`/`ALERT_STATUSES` SQL parity not enforced; `global-error` lacks Inter; PageSkeleton title height; "Other" series #94a3b8 fails dataviz checks (pre-existing); categorical slots pass dataviz adjacent-pair checks but fail the all-pairs normal floor (orange↔amber 13.7, orange↔pink 12.9; pre-existing); legacy stored radius >40 km shows custom and is rejected — *phase-15c1*
- [ ] **15c-3b** plans (15c spec §5.5, incl. `create_plan` features, Q5) — *phase-15c3*
- [ ] 15c-3 polish (deferred minors from the 15c-3a final review): billingAccess/syncSeats extra `isOnHold` query; consistency CHECK one-direction test; hold copy in `assertCanActivateClient` always default support email; duplicated hold-setting test update (helper); live-billing predicates duplicated (`liveBillingQuery`/`liveBilling`); `CLI_USER` duplicated; stale `resend_invitation` doc comments in `team.ts`; `inviteMember` unused `_o.inviter`; `assertTeamInviteBudget` runs twice; `list_platform_agencies` description lacks status/counts; unarchive of a non-archived agency is a silent ok; no resume-failure-still-lifts test; success toasts lost on unmount; `tiles as Tiles` cast; action slices 200/600 vs limits 120/500; list not revalidated after rename/hold/archive; "All" view archived rows lack chip; isolation world has no held agency (R9 skipPositive); E2E archive step could wait for Unarchive before navigating (one fresh-build flake) — *phase-15c3*
- [ ] 13a: client-visible "Rival Monday" fallbacks in MCP `serverInfo`/tool descriptions, `.well-known/oauth-protected-resource` `resource_name`, agency-facing KB `{{product}}` (client-facing KB help now falls back to "your agency"; `kbNamesFor` agency-facing still reads "Rival Monday") (only when no agency name resolves; the Ask system prompt now falls back to `agency.name`, 2026-10-19) — *phase-15a*. Also: support-session email subject and `support.ts` tool description still name the product (page label/fallback now "platform support", 15b-2) — *phase-15b2*
- [ ] Soon: nav-count tools write an `audit_log` row every shell render (consider `skip-web`; update `channels.test` `SKIP_WEB_TOOLS`); switcher lists prospect clients (`list_clients` has no status filter); `togglePin` never prunes stale ids; `apps/web` page changes don't trigger `@cs/demo#test` (coverage scan); no hydration-path test for the sidebar cookie; `navForViewer` positional booleans — *phase-15a*
- [ ] Soon (15b-1): `c/[clientId]/layout.tsx` adds an audited `get_client_profile` read per agency request (resolve the name from the switcher list instead); seed imports `PAGE_HELP_KEY` from `tools/help` (move to a shared module); `docs/help/asking-the-assistant.md` "Cancelled." spelling — *phase-15b*
- [ ] Unscheduled: product tour (Overview, Portfolio); agency help override editor; cross-device pinned/recent clients; enterprise custom roles, multi-agency switcher, audit-log page; switcher "jump to any agency" via support session; Ask review to-do state + badge — *phase-15 decisions*
- [ ] Unscheduled (15b): console editor for platform guides; help-usage analytics; first-visit "new" hints — *phase-15b*

## Design system v1 implementation (owner mandate 2026-10-23)
- [ ] Extend `@cs/ui` `ConfirmDialog` (controlled open, inline error, children) and fold the page-local `ActionDialog` (platform agency page) into it — *phase-15c3 (R11)*
- [ ] `--color-secondary-foreground` is still a literal (15c-2a made `--primary-foreground` a runtime var via `readableTextOn`) — *phase-15c2a*
- [ ] Hex without tokens (existing Cards stay for phase-16, Q2): disabled `bg-[#CBD5E1]`; signal-pills unticked border `#CBD5E1`; tier chip `#E2E8F0`/`#F1F5F9`/`#4A5D73`; topic-heatmap INK/WHITE/LINE and sentiment fills — *phase-15c2b2*
- [ ] **Next phase candidate:** `/rm-kickoff design-system`. Migrate the app to `docs/design-system/` following `09-ai-implementation-playbook.md` § 9 (11 PRs: tokens → primitives → new primitives → container sweep → shell + PageHeader → Overview slice (owner review) → workspace pages → detail/settings → Friday + briefs → responsive → lock-in). 153 Card/shadow-card usages mapped. Coordinate with **15c-2** (same files). — *design-system*
- [ ] Validate the responsive proposal (D-23: drawer < 1024, bottom tab bar < 768) with 3–5 pilot owners on phones before PR 10. — *design-system*

## Polish (small UI/UX fixes, any time)
- [ ] Pack YAML flow-mapping descriptions containing commas are truncated (generic `staff_professionalism` is stored as "Courtesy"): quote descriptions + new migration — *from 15b-3b*
- [ ] `review_analysis.checked_at` has no index; the daily-cap count scans the table each idle sweep. Add one if volume grows — *from 15b-3b*
- [ ] Vertical-edit re-ask trigger fires on any `vertical.updated_at` bump (area version bumps, renames, reviewed status; a generic edit hits every inheriting vertical); on cs_dev ~84% of analysed reviews have a below-tau seed topic, so each bump re-asks most of that vertical's 180-day reviews and shares the 2,000/day cap with approval re-asks. Fix: topics-specific edit marker (`config->'topics'` hash or `topics_edited_at`) or order approval gaps first — *from 15b-3b*
- [ ] Duplicate `engine-reask` job can be queued while one runs (singleton `short` policy covers only queued jobs): at most one extra Jev call under backlog, data deduped under FOR UPDATE; optional `pg_try_advisory_xact_lock(hashtext('reask:'||id))` guard. Also a review whose decide keeps throwing (Jev and LLM down) is re-offered every 5 min with no backoff — *from 15b-3b*
- [ ] `scripts/local-test-db.sh env` prints `/cs_test`; the per-worktree DB name only comes from the kickoff sed, so a reviewer using the script's output hits the shared `cs_test` — *from 15b-3b*

### Phase 14 follow-ups (verticals & runbooks)
- [ ] 14b: prospects never tailored on activation; paid `retailor_runbook_item` has no rate limit; "Keep"/"Not now" not persisted; preview lacks candidate vars
- [ ] 14b: `set_alert_rules` column + item writes non-atomic; create-vs-pause race; platform thresholds knob shadows a pack's own routing; redundant runbook loads per brief; score stage needs a thresholds-only loader / per-run cache
- [ ] 14b: legacy `customised` flag conflates pack-vs-generic wording with human edits ('*' then tailors fewer HVAC plays); redaction tokens can be written back from askModel; starting-point actions from tailored templates lack a fact check
- [ ] 14a: draft-cap index/atomicity; `add_business_area` has no ownership check; rename skips similarity checks; `position` column for areas; client-data check skips seed keywords; merged areas can point across verticals; Distillery E2E rows linger (fresh DB)

### Phase 6 UI polish
- [ ] `/platform/knowledge`: `start()` throw uncaught in import panel; preview shows stale kind; inline delete confirm lacks focus handling; "Saved." banner after publish — *from 6c*

### Workflow & behaviour
- [ ] Franchise brands: jobs postings are brand-wide (Aire Serv's 2026-10-14 postings are "United States"), not the local franchisee's — *from phase5-polish*
- [ ] A removed competitor's pending alerts and brief items are still approvable — *from 5b-1 final review Minor 5*
- [ ] Trend table shows "— → —" for a business with no rating; show a single "—" (owner undecided) — *from 5b-1 owner verification*
- [ ] Webhook/notification toggle actions (`agency/webhooks/actions.ts`, `settings/notifications/actions.ts`) ignore the `runTool` result — surface the error like `AutoSendSwitch` — *from 5b-2 Minor 4*
- [ ] `SignOutButton` clears guest cookies only after `authClient.signOut()` succeeds — a failed sign-out can leave a stale guest session — *from 5a fix-wave re-review*
- [ ] `/go` skips client-facing status filters (a draft brief's webhook link 302s then 404s) — *from 5a T15*
- [ ] Starting-point copy: approval message "Approved — sent to the client." is wrong when delivery is unconfigured (show by status); "In progress" label while waiting for the agency to track a rival; deleted-brief notice link 404s after `--force` — *from phase-12*

### Evidence, timeline & profile
- [ ] Evidence: chip ordering can make an `html`/`vendor_json` piece "Evidence 1"; `EvidenceImage` `onError` can miss a pre-hydration 404 (add a mount-time `complete`/`naturalWidth` check) — *from 5c-1 final review*
- [ ] `compare_snapshots` screenshot fallback doesn't filter `capture.status` (a blocked capture's screenshot can be "as of") — *from 5c-1 final review*
- [ ] Timeline includes open moves that started before the period; profile's "Open moves" KPI link is unfiltered — *from 5c-1 final review*
- [ ] Long `del`/`ins` `aria-label`s on the large-diff fallback — *from 5c-1 final review*

### Data views & charts
- [ ] Ads "More ads" link loops to page 1 past the offset cap of 5000; Reviews "More" link resets past the cap; `?business=self` while the self business is pending says "no longer available" — *from 5c-2 Tasks 7, 12*
- [ ] Legend: rival "Other (average)" rating is an unweighted mean of monthly averages — *from 5c-2 re-review*
- [ ] `ReportView`'s "Changes detected" isn't sorted by count like the email; trend table plain-text fallback lists one cell per line — *from 5a T14, 4b Task 6*

### Settings, auth & admin screens
- [ ] 15c-2a final-review minors: duplicated `ResultLine`/`RowResult` (team, webhooks); `test_webhook`/resend limits are check-then-act; a `blocked` webhook test counts toward the limit; a refused sign-up for an existing member gets a sign-in link on resend; `contact.role` rewritten on client-invite resend (pre-existing) — *phase-15c2a*
- [ ] Agency banner says "Update payment method" (past_due / read_only) even after the subscription ended; the link lands on Subscribe, but the copy is 9a-binding — owner call — *from phase-9-fixes*
- [ ] DEMO: fake Checkout never completes (no webhook in DEMO), so the trial banner and seat cap stay after "Add payment method" — only if the owner wants to demo the paying flow — *from phase-9-fixes*
- [ ] Google sign-in button has no busy/error handling; `magicLink` call not wrapped in try/catch (button stays disabled) — *from 5a T12*
- [ ] Membership switcher form inside `DropdownMenuItem asChild` (possible Radix dismiss/submit race; add a test) — *from 5a T13*
- [ ] Webhooks page shows raw kind slugs (list can drift from `AGENCY_KINDS`); `toggleWebhookAction` has no error path; `ColorField` labels not linked; logo preview refetches per keystroke; branding save drops a stored `fromEmail` (latent) — *from 5a T18*
- [ ] `PrefSwitch` discards `isPending` and doesn't revert on a failed `setPrefAction` — *from 5a T17*
- [ ] Dismiss/remove dialog refusal text persists across close/reopen — *from 5b-1 re-review*
- [ ] Usage page has no empty state for a zero-client agency; `list_alert_queue`'s `.limit(200)` gives no UI hint — *from 5b-2 Task 4, 5b-1 Task 12*

### Phase 8 follow-ups (console, support sessions, costs)
- [ ] Console stats: `wau`/`last_activity_at` ignore `membership.created_at`; `runDailyStats` accepts today/future `day`; backfill is 400×agencies sequential queries — *from 8a*
- [ ] Console UI: name sort `<` vs `localeCompare`; spend delta "up" tone; unused `email?` in `nav.ts` viewer type — *from 8a*
- [ ] Console tests: CLI add/revoke SQL; 27/28-day health boundary; `tilesOf` ms28 filter + NULL-last sort; agency-cascade/`relforcerowsecurity` asserts; page-level tests; E2E audit before/after count — *from 8a*
- [ ] Support sessions: member-less env-only platform owners can't reach `/platform` or open sessions; operator console list shows the raw platform user name (agency list falls back to "Rival Monday support"); a >64-char non-RFC email local part is only partly masked — *from 8b*
- [ ] Support tests: `support_session` cascade-delete; ok-at-59-min resolve case — *from 8b*
- [ ] Costs: Neon settings dialog wrongly shows "Warnings need a dollars-per-CU-hour rate." (gate the rate hint on `kind==='balance'`, fix `costs-components.test.tsx:328`); key present but no reading shows "Not configured" ("No reading yet" is clearer); Apify with no cap gets no hint — *from 8c*
- [ ] Costs job: `evaluateAlerts` throw → job retry re-inserts the day's snapshots (wrap in try/catch); concurrent refresh + cron can double-email (conditional update before send) — *from 8c*
- [ ] Costs UI/edges: strip read audits every owner `/platform` view; strip sits outside the 1560px wrapper; services-table Actions header in read-only; empty warnDays → 0; run dataviz skill on chart colours; Neon `from==to` before 01:00 UTC on the 1st; Anthropic partial sum after 3 pages; empty `APP_URL` → relative link in email; tools' toFixed silently rounds threshold/rate; read.ts 12 sequential queries; seed rows duplicated in migration 0051 and `@cs/db` test helpers (add cross-reference comments) — *from 8c*

## Waiting on real data / external events
- [ ] 7c2 Task 12 (owner + controller, after staging setup): staging rehearsal per `docs/OPS.md` § Rehearsal steps 1-9, fix wave per FAIL, final concurrency/limits and costs become code defaults, `teardown`; done when one run shows every PASS line incl. the fault alarm. Then close "Staging setup" and the 7c2 part of the copy sign-off item — *phase-7c2*
- [ ] 7c2 Task 13 (owner): (a) the two rename `UPDATE`s on `cs_dev` (`docs/OPS.md` § Internal QA); (b) `pnpm --filter @cs/ai exec vitest run jev.live` with the real `TYPESAFE_API_KEY`, record 0- or 1-based; (c) `/link-other-account` once live (PILOT § 8); then delete the three Model ops/Pilot items tagged Task 13 — *phase-7c2*
- [ ] After the 15b-3b deploy: watch `[engine-reask]` log lines; daily `review_analysis` checks stay <= 2,000. Copy doc: [archive/phase-15b3b-copy-signoff.md](archive/phase-15b3b-copy-signoff.md) — *moved from STATE at 15c-2b-2 merge*
- [ ] Re-pull Aire Serv reviews + ads (command in [OPS.md](OPS.md); pass only advertisers `AR11447192921745391617`, `AR09867956064303972353`), diff `review_id`s against the 546 from 2026-10-01 — if unstable, dedupe on the content-hash key — *from 2b live verification*
- [ ] Owner-verify alerts per outcome (sent now / 17:00 digest / withdrawn) and Recommendations rating — waived until real alerts: the 2026-10-13 pull and a full re-pull on 2026-10-14 (all 8 tracked competitors) gave 1 new event (Aire Serv hiring, score 12 → archive) and 0 alerts; next chance is the 2026-10-20 weekly pull — *from 5b-1 verification*
- [ ] Before switching on `WEB_MONITORING_ENABLED`: `accept_competitor_suggestion`/`add_competitor` (`packages/tools/src/tools/competitors.ts`) return `'disabled'` for a prospect; start discovery in `convert_prospect` — *from 5b-2 final review Minor 1*
- [ ] `price_extract` live-verified only by tests — no web captures until the bot page exists — *from 3c live verification*
- [ ] Verifier strictness: at τ 0.85 true facts often score low (0.36, 0.16; alert headline 0.84) — watch brief `dropped` counts on pilot data before changing τ/routing (labelling: see Owner) — *from 4a/4b*
- [ ] Accuracy report "consider routing to the LLM" note: restrict pairing to `reason = 'shadow'` samples before acting; keep review decisions on Jev until ~200 pilot labels — *from 3d final review, owner 2026-10-03*
- [ ] Quarterly report verified only by tests — no client predates a quarter yet; check the first real one — *from 4b live verification*

## Owner (user-owned items: validation, LOIs, counsel, accounts, domains…)
- [ ] Prod accounts (O17: Vercel, Railway, Neon prod, Sentry, R2) before 7a1 Task 12; steps in `docs/DEPLOY.md` — *7a*
- [ ] Sign off the `/platform/health` help copy (description, 4 status tips, operator guide) — *7a1*
- [ ] Sign off copy marked in the 7b1/7b2/7c2 plans before each task builds it (credit notices, pause/heavy-load banners, credit refusals, staff emails, duplicate-subscription notice, feedback links) — *phase-7-planning*
- [ ] `ask-inject-09`: make the Ask prompt paraphrase injected text (it quotes the phrase while refusing in most live runs; B3 failed 7 of 10 live), re-record ask; until then keep `evals-live` advisory (not a required check) — *phase-7c1*
- [ ] Confirm Jev's real price (`ai.yaml` placeholder); until then Jev is excluded from credit limits and the spike guard — *phase-7-planning*
- [ ] Staging setup before 7c2 Task 12 (needs O17 prod Neon): Vercel Preview + Neon staging branch + Railway worker sized like prod + fixture-hosts service (5 custom domains); rehearsal ≤ \$5 AI, ~\$20 infra — *phase-7-planning*
- [ ] Postmark webhook: answer 500 or 200 on handler errors (500 makes Postmark retry)? — *7a2 T8*
- [ ] Purge anonymises `platform_support` rows: confirm — *7a2 T10*
- [ ] Scope-`all` roles still see an archived client's `llm_call`/`vendor_call`/`audit_log` rows (0006 policies): accept or hide — *7a2*
- [ ] Postmark broadcast stream (`POSTMARK_BROADCAST_STREAM`) must use unsubscribe handling **"None"** (else Postmark suppresses without setting `unsubscribed_at` and tips 406-retry) — *phase-10*
- [ ] Support-session email says "Reply to this email" but `replyTo` is null (replies go to `EMAIL_FROM`) — needs a reply-to address/env var — *from 8b*
- [ ] Register **rivalmonday.com** / **.ai**; trademark knockout search — *from HANDOVER §7*
- [ ] Phase 0 validation before the Phase 7 pilot: GoHighLevel/Vendasta marketplace check, 5 agency letters of intent, US counsel review (crawling, review privacy, AI claims about named competitors) — *from roadmap Phase 0, HANDOVER §7*
- [ ] Create an **R2** bucket + token before production (dev stores evidence on local disk) — *from HANDOVER §7*
- [ ] Confirm Jev pricing (0.042 $/M input is a placeholder) before costs feed budget caps — *from Phase 1, HANDOVER §7*
- [ ] Postmark before the pilot: request account approval (to deliver outside `@nofingers.ai`), add SPF/DMARC if not done, put the **live** server token back in `.env` — *from HANDOVER §7*
- [ ] On deploy at `rm.nofingers.ai`, set `APP_URL=https://rm.nofingers.ai` (deep links; still `http://localhost:3000`) — *from HANDOVER §7*
- [ ] Review a few rendered template alerts before real clients (fallback reads the raw event summary, unedited for tone) — *from HANDOVER §7, 4b*
- [ ] Label `verifier_decisions` samples (5 unlabelled in `cs_dev` as of 2026-10-04; `decisions export --task verifier_decisions`) before changing τ or routing — *from HANDOVER §5 item 3/§7*

## Unscheduled / ideas

### Features
- [ ] Drop `playbook_override` (table, tools, tests) after the runbook backfill is verified in prod; new migration — *phase-14b*
- [ ] "Sync platform runbook" step: the platform runbook is seeded once from `generic.yaml`; later generic/pack additions don't reach existing runbooks — *phase-14b*
- [ ] **UI/UX review against Mobbin** (Mobbin MCP): optional cross-check of 15b/15c against real-world app patterns (the Phase 15 designer audit replaced the main review) — *owner, 2026-10-17*
- [ ] **Affiliate program (fully featured)**: affiliate sign-up and approval, referral links/codes attributed through agency sign-up (Phase 10) and billing (9a Stripe), commission rules (one-off / recurring %, cookie window, clawback on refund or churn), affiliate dashboard (clicks, sign-ups, conversions, earnings), payouts, console management + fraud checks; scope and details to be provided by the owner at planning — *owner, 2026-10-17*
- [ ] Automatic lead routing to agencies (vertical/area/capacity/opt-in) on the 11c platform pool - *phase-11*
- [ ] Public "request access" form / marketing landing page (declined for now) — *phase-10*
- [ ] Console: activity `client_activated` lacks `clientName` (record activation, e.g. `client.activated_at`); `list_platform_activity` loads all sources per call (bound/paginate in SQL); agencies list silently capped at 100 (paging or notice) — *from 8a*
- [ ] Cost APIs for Vercel / Cloudflare R2; Neon storage cost; costs CSV export; renewal reminders — *from 8c*
- [ ] REST API (spec §8.1) — *from 6a*
- [ ] Knowledge base: file upload (PDF/DOCX), agency/client self-authoring (`manage_knowledge`), KB in weekly briefs, citation analytics — *from 6c "Not in 6c"*
- [ ] Brief writers (`brief_writer`/`playbook_writer`/`theme_discovery`) back to sonnet-5 (probe 2026-10-12 OK for ZDR + strict json_schema) — *from 6b*
- [ ] Volatile-mask unmask UI (AM): pass the capture id explicitly; manual unmask re-pinned only within the 6-capture window — *from 3d, 5c-1/5c-2*
- [ ] SMS (Twilio) — `sms` channel slot reserved — *from 4a/4b (Phase 7+)*
- [ ] Agency custom domains; custom sending domains + DKIM per agency — *from 4b, 5a*
- [ ] Passkeys/2FA — *from 5a*
- [ ] Per-user digest hour; translating emails; "send now" for alerts — *from 4b*
- [ ] Agency voice settings for the brief writer — *from 4a*
- [ ] Batch-priced brief writing (not needed at pilot volume) — *from 4a*
- [ ] Per-client page deactivation; drag-and-drop reordering; agency-wide recommendation board — *from 5b-1*
- [ ] Delete/archive a prospect (needs soft-delete first); per-agency default caps/limits — *from 5b-2*
- [ ] Ad images (vendor media URLs expire and leak viewer requests); dark chart theme (with the app's dark theme) — *from 5c-1/5c-2*
- [ ] Own-site prices: a "you" column; feed ads/own-website prices into `price_point` (3c decision 11) — *from 3c, 5c-2*
- [ ] Change-region boxes on screenshots (owner: not wanted for now) — *from 5c-1*
- [ ] Instagram Business Discovery (needs a Facebook app, a connected Page and app review; Graph API v26.0) — *from Phase 2 planning*
- [ ] Decide the `briefs_only` feature flag — *from Phase 1 review*

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
- [ ] Churn: log reports pre-cap suppressed count; `CHURN_SUPPRESSED_MAX` untested; masked non-money blocks on churned pages go to `suppressed` (check spec intent) — *from 3d Task 13*
- [ ] `extractZips`: `'TX 36000 BTU'` reads as a ZIP; "24000 filters and 36000 belts" list misread (decision 17, accepted) — *from 3d Task 14*
- [ ] `volatile_block` with null `key_capture_id` resolves at window start; AM-unmasked row resolves at index 0 once its capture ages out; masked block shifting onto an unmasked key loses its mask — *from 3d Task 12*
- [ ] Merge: concurrent tag jobs can create two events for one offer; `drain.ts` counts a merged change as `events++` — *from 3b Task 11*
- [ ] Moves: territory-signal tagging not exclusive; price-war `else if` drops ad-burst evidence; `MovesRunResult.updated` counts unchanged; nightly race fails on `move_open_unique` (accepted) — *from 3b Tasks 13–14*
- [ ] AM "updated" path doesn't recompute `details.offer`/summary or clear `needs_review` on detach — *from 3d final review*
- [ ] Anthropic batch: `collectModelBatches` no per-item try/catch; no `ok:false` ledger row on submit/status/results throw (pending row, orphan sweep and idempotent apply done in 7b1) — *from 3d Tasks 8–9, 4a*
- [ ] `ensureSelfCompetitor` read-then-write race on a place-id change — *from 5b-1*
- [ ] Structured: `ad` started/stopped queries lack `ORDER BY`; jobs lookback ignores `capture.source`; `upsertReviews` hard-codes `source: 'google'` — *from 3b Tasks 2, 5–7*
- [ ] Prices: unhyphenated "off peak" read as discount; dead `-1` in `pricesInBlock`; over-cap pages (> `PRICE_MAX_BLOCKS`) end no spans — *from 3c Tasks 8–9*

### Briefs, alerts & delivery
- [ ] Brief rules: period-header dates allowed in rules-only fields; "detected in this period" can overstate for late-scored events; word numbers ("three") and weekdays unchecked — *from 4a*
- [ ] Two active items for one move both get a recommendation; re-featured moves re-list earlier-featured events — *from 4a*
- [ ] Long verifier runs vs the 30-min `BRIEF_STALE_MINUTES`: batch `supportCheck` or heartbeat the claim — *from 4a*
- [ ] `recommendationFromItem` cuts `recommended_action` at 200 chars mid-word — *from 4a*
- [ ] `brief-once --force` orphans AM feedback rows — *from 4a*
- [ ] `alert_digest` rows not re-checked for retraction at send time; possible duplicate `alert-process` spend on a race; auto-send vs concurrent-edit race — *from 4b final review*
- [ ] Alerts: approval feedback says "approved" when release withdraws; withdrawn alert sends no `am_alert`; > 7-day alert approvable before sweep expiry; client with no contacts still marked delivered — *from 4b Tasks 12–13*
- [ ] Quarterly report counts recommendations by *current* status, not at quarter end; `renderReportPdf` untested, no status guard — *from 4b Task 17*
- [ ] Starting point (parked): home card when exhausted after 3 attempts; `editBriefItem` false warnings on self items; standard→quiet-at-delivery brief has no scorecard; self `ads_google` diff/tag spend; soften facts (BASELINE_BODY "map rankings" when none, 0-review velocity, `complete_profile` claim wording) — *from 12b final review*

### Code quality & test gaps (fold in when touching the file)
- [ ] phase-11-fixes: third haversine copy (collectors `filters.ts`, intake `preview.ts`, setup `lookup.ts`) -> consolidate into `core/geo.ts`; listing collapse with mixed placeId/cid is not transitive; phone extensions don't match as duplicates; tests: `get_client_setup` ready with services only, no E2E for the "already passed" pilot refusal; a11y: `ErrorNote` role=alert + focus may double-announce, document `focusKey` stability, global `scrollIntoView` stub in tests - *phase-11-fixes*
- [ ] Phase 1 registry leftovers: `countRows` only recognises `{items}` outputs; log the original handler error when the audit write also fails — *from Phase 1 review*
- [ ] Conventions to keep checking on new read paths: strip `upsell_tag` for client roles; client-facing readers filter status (brief approved/sent, items `active`, alert delivered); sort brief items by `ord` (never assume 0-based) — *from 4a/4b cross-phase*
- [ ] Phase 6 test gaps: ask-rls WITH CHECK + user-delete cascade; ThreadList/SaveDialog/StarterChips components; chip → auto-send E2E; `expectNoUsageNumbers` scans only main; settings toggle not retry-safe; KB: GIN guard title + kb index, title/body CHECK and unset-role RLS tests, MCP title redaction, embed id↔vector mapping, chunker edge cases (`C#` heading, long heading paths, fences, CRLF), brittle `@kb` selectors (`selectOption({index:1})`) — *from 6b/6c*
- [ ] Phase 1 cleanups: `@types/node` ^22 vs Node 24; slug regex duplicated in verticals; `register()` not atomic; mkdtemp dir not cleaned in packs test; pg-boss batch loop assumes batchSize 1 — *from Phase 1 review*
- [ ] 3b minors: hiring-move summary not truncated; `buildStructuredSummary` branches untested; `FakeAi` doesn't record scope; `engine-once --moves` untested at CLI; consolidate the "no-retry queues" worker test — *from 3b Tasks 10, 15*
- [ ] 3c minors: `TITLE_WORDS` includes `'the'`; GBP `domain` not in redaction names; `review_analysis` confidence spans all verticals; `ReviewInsightsResult.errors` conflated; `priceMatrix` test gaps — *from 3c Tasks 1–10*
- [ ] 3d minors: task-constant doc comments; `ai.ts` ~135 duplicate jev check; shadow vs review reason precedence; `formatReport` column widths; `validThresholds` evaluated twice; `volatile.test` raise `testTimeout` — *from 3d Tasks 1–14*
- [ ] 4a minors: `clientFk` typed `any`; `rebuildEventText` business names; `schedule.ts:103,107` non-null asserts; `select.ts:2` "top 3–5" wording; `$50000` via ZIP path; verify/test gaps (Tasks 9–13) — *from 4a per-task*
- [ ] 4b minors: `delivery.test` coverage; `addContact` duplicate-email raw error; `updateClientDelivery` empty patch; Teams markdown escaping; transport error tests; non-atomic file transport; `createBrowserCache` duplicated; `WorkerDeps` doc comments — *from 4b Tasks 1–18*
- [ ] 5a minors: last-admin revocation deadlock → raw 500; pending invitations left on member removal; N+1 in `myNotificationSettings`; `files.ts` duplicates `isHiddenToolError`; branding fetched twice per request; test gaps (T3–T19) — *from 5a per-task*
- [ ] 5b-1 minors: zod bounds looser than limits; `packFor` vs `deps.packs`; `add_tracked_page` keeps old `source`; `list_brief_queue` N+1 `isUntouched`; E2E near Better Auth's 5-link/IP/60s limit — *from 5b-1 per-task*
- [ ] 5b-2 minors: `resolve.test.ts` lock poll; `reviewQuestions` drops unknown keys silently; malformed `PLATFORM_ADMIN_EMAILS` no warning; `enqueue` ignores null `send()`; prospect report "as of" dates; test gaps — *from 5b-2 Tasks 2–12*
- [ ] 5c-1 minors: `requireVisibleEvent`/`get_move`/`get_competitor_timeline` test gaps; `list_moves` double subquery; `set_alert_rules` redundant SELECT; `LineChart` edge cases and table caption/`scope`; duplicated `Pill` type — *from 5c-1*
- [ ] 5c-2 minors: price/ads/reviews/sov/heatmap test gaps (Tasks 1–17); private UUID helper in `changes/params.ts`; non-null asserts `pricing/page.tsx:124-126`; mis-indented `line-chart.tsx` ~150–176; E2E `noSideScroll` without waiting (`data-views.spec.ts:127,131`) — *from 5c-2*
- [ ] Demo/dev panel: reset stuck "resetting" if the child never closes output; POSIX detached reset survives Ctrl+C; `links`/`findContact` use live `dbs()`; coverage-test walker not transitive; no two-seed determinism test; restore/`isLocalHost` test gaps; `redactSecrets` misses IPv6/bare hosts — *from demo-data review 2026-10-09*
