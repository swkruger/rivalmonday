# Owner guide: from today to the first pilot invite

Built 2026-11-01 from `docs/STATE.md`, `BACKLOG.md` § Owner and the owner-verification files. Do the stages in order. Stage 4 runs alongside the others because it depends on other people.

**Where things run**
- **Demo:** `pnpm --filter @cs/web dev:demo` (fake data, good for looking at screens).
- **Dev:** `pnpm dev:web` on `cs_dev` (real lookups, small vendor costs).
- **Staging:** https://staging.rivalmonday.app (real email and Stripe test mode; vendors are faked, so the business lookup is unavailable).

---

## Agent to-do (found during your checks)

**From Stage 3 (2026-11-03), open:**

- [ ] **Account switcher overlap.** Menu items have a fixed 32 px height; the two-line switcher entries (name + role) spill over. Let them grow.
- [ ] **Business search on staging.** Unavailable by design (no DataForSEO keys on staging, `STAGING.md` step 11). Replace "Business search is not configured" with a plain message, and add a hint to the lookup ("Search Google for the listing, or choose a business type and continue without one").
- [ ] **Brief email.** Body text is 16 px (checked in the delivered HTML), but the "Where you stand" cards and tables are still 14 px and squeezed into 640 px, so headers collide ("Reviews 90 d" / "Reply rate"). Widen brief-style emails and raise table and card text.
- [ ] **Client limits: one Save for the whole table** instead of one per row.
- [ ] **Top bar:** full width, sticky, agency logo and name at its left (the sidebar starts below it).
- [ ] **Local rankings on staging show 20+ and no map.** Not a bug: staging's fake vendor mode returns made-up results that never include your business, and a blank map image. Real scans with maps are on `cs_dev`. Decision needed, see the agent's note.

**Done 2026-11-02** (merged 2026-11-03):

- [x] **Emails: larger text.** Body 16 px on a 24 px line, nothing under 14 px, button label 16 px with more padding. Button labels now follow `readableTextOn`: dark ink on the default light blue (it was white). Brief PDFs re-render once (`PDF_LAYOUT_VERSION` 4).
- [x] **`EMAIL_FROM`:** web and worker refuse a display name at start-up. `STAGING.md` and `DEPLOY.md` say "bare address".
- [x] **Waitlist form:** a Turnstile error now shows the "couldn't send" message instead of "Still checking" forever.
- [x] **`evals-live` is a required check on `main`** (repo setting, live now). It gates pull requests only. Admins can bypass, so `/rm-merge`'s direct push still works. Force pushes to `main` are off.
- [x] **Stale copy-ledger entries pruned:** 26 old signatures, no comments lost.

---

## Stage 0: Make the 6 blocking decisions

Answered 2026-11-02.

| # | Decision | Answer |
|---|---|---|
| 1 | Worker host | **Railway** (account open 2026-11-07). Staging worker live in project `rivalmonday-staging` (STAGING.md § 4). Production gets its own Railway project at Stage 5. |
| 2 | `evals-live` as a required check | **Required** (`ask-inject-09` has been fixed). Turn it on only after the `evals` secrets are in (Stage 1). Until then the check fails every run and would block merges. |
| 3 | Make the repo private | **Deferred.** |
| 4 | 13a1 (white-label) before the pilot | **Preferred, not a blocker.** |
| 5 | Copy gate blocks deploys | **Production only, not staging.** It only gates `deploy` and `deploy-site`, never the staging jobs. |
| 6 | design-lint in CI | **Yes.** |

---

## Stage 1: Finish staging

- [X] **Verify the sending domain.** Both `rivalmonday.app` and `mail.rivalmonday.app` are verified in Postmark (2026-11-02), and sign-in emails arrive.
- [X] **Make `EMAIL_FROM` a bare address with no display name:** `support@mail.rivalmonday.app`, not `Rival Monday Staging <support@mail.rivalmonday.app>`.
  - **Why:** the app adds the brand name itself (`"Rival Monday" <EMAIL_FROM>`). With a name already in the variable, Postmark rejects the sender with "Error parsing 'From'" (tested 2026-11-02).
  - **What it breaks:** every email except sign-in, including the waitlist confirmation, briefs, alerts, invites and hold or plan emails.
  - **Steps:**
    1. Change it in the Vercel `staging` environment and in `.env.staging`.
    2. Re-run `deploy-staging`.
    3. Restart the worker with `pnpm staging:up`.
    4. Submit the waitlist form again with the same email. An unconfirmed entry gets a fresh link and a new email.
  - **Production:** use the same rule, a bare `EMAIL_FROM` such as `briefs@mail.rivalmonday.app`.
  - **Agent follow-up:** see Agent to-do.
- [X] **Allow the staging site in Turnstile.** The waitlist form showing "Still checking, try again in a moment." forever means the widget never produced a token. The likely cause is that `staging.rivalmonday.com` is missing from the widget's hostnames (`STAGING.md` step 9). The site's security headers and site key are correct. To confirm: open browser devtools → Console and look for a Turnstile error such as `110200`. A code fix is also pending (the agent's job): the form should report a widget failure instead of waiting forever.
- [X] **Add the Postmark webhook** if it isn't there yet (step 5, items 6-8).
- [X] **Start the worker:** run `pnpm staging:up` and leave the window open. Its checkout is stale.
- [X] **Run the checks in `STAGING.md` § 6:**
  - `/health`, the site, and `robots.txt` showing `Disallow: /`
  - sign-in email arrives and the link works
  - Postmark test returns 200
  - a brief PDF and an evidence screenshot open
  - `curl.exe http://localhost:8081/healthz` shows `queueGrants: ok`
  - `/platform/health` is green after about an hour
  - Stripe test webhooks succeed
  - Sentry shows staging events
  - the waitlist form submits
  - the `agency_webhook` count is 0
- [X] **Replace `VERCEL_TOKEN`** (the old value leaked into a transcript). Create a team-wide token, update `.env.staging` and the GitHub environment `staging`, then delete the old token.
- [X] **Skim the agent's staging calls** in `archive/staging-env-calls.md` and overrule any you disagree with.
- [X] **Fix the evals job.** Add `OPENROUTER_API_KEY`, `POSTMARK_SERVER_TOKEN`, `EVALS_ALERT_TO` and `EVALS_ALERT_FROM` to the GitHub environment `evals`. It listed no secrets today, which is why the nightly run is red. Run the workflow once by hand.

**Done when:** you have signed in on staging and every § 6 box is ticked.

---

## Stage 2: One sitting at your desk

- [X] **Sign the remaining copy.** Run `pnpm copy:review`. Only **77 items** are left, not thousands: app-account 47, mcp-tools 14, app-shared 9, help 3, guides 4. The per-phase copy items in STATE and BACKLOG are out of date, because those surfaces already show as signed. There are also 26 stale ledger entries; ask the agent to clear them.
- [X] **Answer the small decisions** at the bottom of this guide. Replying "use your suggestions, except #…" is enough.
- [X] **Commit `docs/copy/signoff.json` and push.** The push also carries one docs commit waiting on `main`, and it redeploys staging. Run `pnpm staging:up` again afterwards.
- [X] **Run these on `cs_dev`:**
  - `pnpm db:migrate`
  - `pnpm --filter @cs/db topic-leftovers` (should print nothing)
  - `pnpm --filter @cs/worker runbook:backfill --dry-run`, then the same without `--dry-run` **before the next brief run**
  - the two rename `UPDATE`s in `OPS.md` § Internal QA
- [Defer to later] **Close out TypeSafe.** Compare one day of OpenRouter `typesafe/jev-1.14` charges with the `llm_call` Jev rows. Then close the TypeSafe account and delete `TYPESAFE_API_KEY` from `.env`, Vercel, Railway and GitHub.
- [X done and all confirmed ] **Label the evals and verifier samples:**
  - **Evals:** export with `pnpm --filter @cs/evals eval label --suite <s> --export label-work/<s>-labels.csv`, fix in `tools/decision-labeler.html`, import with `eval label --import … --by <name>`, then run `eval run --suite <s> --mode replay --update-baseline` and commit.
  - **Verifier:** label the `verifier_decisions` samples (`decisions export --task verifier_decisions`).
- [X See comments] **Confirm the Stadia geocode price** (assumed $0.001/request).
SW Kruger
• Geocode Cost: Each geocoding request costs 20 credits.
• Free Plan: $0/month for 200,000 credits (non-commercial use only; equals up to 10,000 geocode requests per month).
• Starter Plan: $20/month for 1,000,000 credits (allows commercial use; overages billed at $0.03 per 1,000 extra credits).
---

## Stage 3: Click through the product

Report anything wrong as you go. Don't stop to fix it.

**Demo: screens**
- [X] Client Overview and Local rankings charts ("You" in dark blue), Changes toolbar, competitor traces, Business profile form, Agency Portfolio, Platform Costs. Repeat one at phone width.
- [X] Changes: zone labels ("CT"), list-only at 390 px, right sheet on tap, "Whole page" tab, evidence "Compare with previous".
- [X] Alert rules band bar and Save-on-change, Delivery Discard, confirm dialogs, Ask privacy sentence, Reviews "Show as table", unknown URL shows "Page not found".
- [X] Friday panel: switching client closes it; resizing across 1280 px keeps the conversation. Delete an Ask thread (`/platform/ask` shows "Deleted by user"). Saving an answer twice gives one row.
- [X] Context switcher, agency and client menus, old bookmarks redirect, phone drawer, white-label sign-in branding, shell agency name, logo, Friday's avatar.
- [X] Before/after shots: `apps/web/.shots/index.html`.

**Staging: anything that sends email or uses Stripe test mode**
- [X] **Profile, as three roles.** Agency user: name, photo, notifications. Client owner: "Your business" with credits only. Client viewer: Business profile only.
- [X] **Profile on a real phone:** upload a photo straight from the camera.
- [X] **Hold:** put a test agency on hold (email, read-only, "collection paused"), then lift it.
- [X] **Archive:** archive with a live subscription is refused; cancel, archive, unarchive.
- [X] **Invites and roles:** an admin invite names the agency, not you; last-admin refusal works.
- [X] **Plan versions:** publish a version with MCP unticked; move 2 agencies; new prices start at next billing with no proration; the page shows "Plan v2".
- [X] **Limits:** set a low client limit: notice, then pause at 130 %, then "Pause lifted." Ask says it's paused and a rank scan is refused. Lower the spike floors: Health shows Warning/Paused, and Reset needs a note.
- [X] **Team:** 4th Resend in 24 h is refused; intake Preview with the link off; check-email countdown; `/platform/billing` tabs; Alert review filter; Branding buttons; slack-teams settings.
- [X] **Isolation:** agency alerts with `?client=<foreign id>` return 404.
- [X] **`/link-other-account`:** run `PILOT.md` § 8 once.
- [X] **Topics and help:** `/platform/topics` queue works. Help search and glossary work. Client vs agency guides differ, and white-label says "your agency".

**Dev: real lookups**
- [ ] **Agency sign-up:** incognito sign-up, 4 steps, re-open step 1. Pilot invite. A second open-trial client is refused until Checkout. Pilot-link refusal on `/platform/billing`.
- [ ] **Client setup:** a client with a listing (7 screens) and one without (own business not suggested). Duplicate-listing cards on `/agency/clients/new` and `/start`.
- [ ] **Owner pick:** "Ask the owner to pick": the owner lands on Overview, picks, and the starting point follows.
- [ ] **Intake:** `/start/<slug>` in agency branding, with real Turnstile. Dental preview. At 390 px there's no preview panel.
- [ ] **Full client flow:** lookup, suggestions, search (≤ $3), starting point within 48 h, invite, accept, first brief, Stripe test billing.
- [ ] **Runbooks:** create and approve a real vertical; check the tailored runbook and "Update available".
- [ ] **Waitlist:** `/platform/waitlist` invite; sample flow end to end (submit, approve, setup, Send sample, open privately).
- [ ] **Site:** in `apps/site`, run `npx next dev -p 3011`. Check all pages at 1440, 1024 and 390, `/roadmap`, `/sample-brief`, the home tour, and both join flows.

---

## Stage 4: Outside the codebase (start now, runs in parallel)

- [Defer to bakclog] **Validation:** GoHighLevel/Vendasta marketplace check, and **5 agency letters of intent**.
- [X] **US counsel:** crawling, review privacy, AI claims about named competitors, privacy + terms, `/compare/*` (with archived source PDFs).
- [we hace .app and .com already] **Trademark knockout search.** Decide on `.ai`. (`rivalmonday.com` looks registered, since its staging address loads.)
- [X] **Postmark:** request account approval, then add SPF and DMARC (`p=none`). Set the broadcast stream's unsubscribe handling to **None**. Keep the live token for production settings only (Vercel `production`, worker host); `.env` keeps the test-server token so local dev never delivers.
- [X defer worker host to later] **Accounts:** Neon prod, R2 prod, Sentry, worker host (Stage 0 #1). Confirm `support@rivalmonday.app` exists.
- [Defer to later] **Your content:** founder note and photo, the placeholders in `privacy.md`, `terms.md` and `founder.ts` (the site deploy refuses until they're gone), social links, client price.
- [X] **Logos:** OpenRouter and Neon are done. Check the Railway, Postmark and Sentry guidelines, or leave them as text.

---

## Stage 5: Rehearsal (one calendar week; about $20 infra + up to $5 AI)

Needs Neon prod and the worker host from Stage 4.

- [Ignore, keep permanent] **Build the throwaway stack:** `DEPLOY.md` § Rehearsal stack. It is separate from permanent staging.
- [ ] **Monday:** `latency`, then `seed` (Mon-Thu before 22:00 Chicago), then `fault`. Set `REHEARSAL_LIVE_CLIENT_IDS` straight after seeding. Commands: `OPS.md` § Rehearsal.
- [ ] **Daily:** check Health, memory, connections, Sentry.
- [ ] **Friday 14:00 local:** `approve`, and check the fault alarm email.
- [ ] **Next Monday 08:00 local:** `report`. You need `RESULT: PASS`. The agent fixes any FAIL and sets final numbers as code defaults.
- [ ] **Teardown:** `teardown`, then the manual cleanup it prints.

---

## Stage 6: Live deploy

- [ ] **Agent first:** shell DB stages gate (`--assert-db-stages 8`), page checks on the production `deploy` job, 13a1 if you chose it in Stage 0.
- [ ] **Deploy:** follow `DEPLOY.md` § 1, with these additions:
  - add `STADIA_API_KEY` to the Vercel web env, `NEON_API_KEY` + `NEON_ORG_ID` to the worker, and `ANTHROPIC_API_KEY`
  - set yourself as required reviewer on the `production` environment
  - run `pnpm kb:seed`
  - `set_seat_cap_exempt` for your agency if it has more than 3 active clients
- [ ] **Pre-apply check:** look for rows that would fail `client_score_thresholds_check` (only matters if prod holds real data).
- [ ] **Verify:**
  - TLS on `rivalmonday.app`; magic link from `briefs@mail.rivalmonday.app`; mail-tester ≥ 9/10
  - Sentry events from web and worker; worker Active; `/healthz` 200
  - `/platform/health` green after 1 h
  - `profile:pages` p75 ≤ 1.5 s, all pages ≤ 3 s
  - Postmark bounce deactivates a contact; wrong password returns 401
  - R2 re-put fails
  - archive a throwaway client, then `--undo`; `purge-archived --dry-run` lists nothing
  - a plan without Ask hides the Ask pages
  - `BILLING_FAKE_GATEWAY=1` on a preview refuses to serve
- [ ] **Billing:** Connect fee is 0 (global and per agency), `standard` includes Ask + MCP, the Stripe portal lets agencies cancel, Pilot mode is on.
- [ ] **Last step:** once `/bot` and `/robots.txt` load signed-out, set `WEB_MONITORING_ENABLED=true`. Ask the agent to fix the `convert_prospect` discovery gap first (BACKLOG § Waiting).

---

## Stage 7: Marketing site

- [ ] **Before deploying:** counsel is done, `SITE_ORIGIN` and Turnstile hostnames are set, re-export `verticals.json` from prod, set `WEBSITE_MONITORING_LIVE = true`. Then follow `DEPLOY.md` § Marketing site.
- [ ] **Compare pages:** only after counsel. Re-check rival facts within 7 days of first publishing them.
- [ ] **After deploying:** Search Console and Bing, submit `/sitemap.xml`, Rich Results Test on `/pricing`, check `/llms.txt`.

---

## Stage 8: First invite

- [ ] **Run the gate in `PILOT.md` § 1**, including the prod tenant SQL, which must return 0 rows.
- [ ] **Read a few rendered template alerts** for tone.
- [ ] **Invite at most 3 agencies.** Add the next batch only after a clean first weekly (`PILOT.md` § 2).
- [ ] **Run the daily and weekly checks** in `PILOT.md` § 3-4 for 8 weeks.

**Watch during the first weeks**
- Spike alert or pause in week 1 (Health -> Reset)
- `[engine-reask]` log lines; `review_analysis` ≤ 2,000 a day
- Alert outcomes: sent now, 17:00 digest, withdrawn (no real alerts yet)
- Brief `dropped` counts before touching τ
- The first quarterly report
- Re-pull Aire Serv reviews and diff the `review_id`s
- DMARC to `p=quarantine` after 2 clean weeks
- Testimonials once you have permission

---

## Small decisions

Suggestions marked † come from the sign-off docs alone. I didn't test them in the app.

| # | Question | Suggestion |
|---|---|---|
| 1 | Primary hover/active is now lighter than the design docs say | Approve; the documented darker shades fail 4.5:1 with the ink label |
| 2 | Wordmark amber "monday" is 1.93:1 | Exempt it; it's brand, and decided |
| 3 | Lint allowlist (09 § 8) | Approve† |
| 4 | "First moves still open" vs glossary "First steps" | Rename to "First steps", because "move" means a competitor pattern |
| 5 | Business type and neutral Platform access label (15b-2 T10, T11) | Keep† |
| 6 | Email says "1 client seats" | Fix the plural |
| 7 | Resend dialog says "3 times a day" | Change to "3 times in 24 hours" (it's what the limit does) |
| 8 | Filter labels "On hold {n}", "Archived {n}" | Keep† |
| 9 | 15c1 status labels and tones (`archive/phase-15c1-copy-signoff.md`, items 1-10) | Keep all† |
| 10 | Radius error floor (2 mi) is stricter than the check (1.2 mi) | Keep; stricter is harmless |
| 11 | Tailoring prompt: add "no facts, prices or claims about competitors"? | Yes; it matches "no evidence, no claim" |
| 12 | "This client uses the agency runbook." also shows for HVAC/dental legacy clients | Have the agent reword it† |
| 13 | Dedupe "save as recommendation" on the server (P6) | Yes, after the pilot |
| 14 | `reportError` digest-skip | Keep† |
| 15 | Keep tool `.describe()` text in the copy scan? | Yes; MCP clients read it |
| 16 | Make tool inputs `.strict()` (`search_reviews` ignores old `themeId`) | Yes; silent unfiltered results are the worse failure |
| 17 | Postmark webhook on handler errors: 500 or 200? | 500, so Postmark retries a missed bounce |
| 18 | Purge anonymises `platform_support` rows | Confirm |
| 19 | Scope-all roles still see an archived client's ledger rows | Accept (staff only)† |
| 20 | Support-session email says "Reply" but `replyTo` is null | Have the agent use `SUPPORT_REPLY_TO` |
| 21 | Global catalogue (R7) | Confirm; it's the Phase 14 decision |
| 22 | `attach_agency_discount` ignores `max_redemptions`; cap counts current holders | Keep both for the pilot |
| 23 | Trend table "— → —" for an unrated business | Show a single "—" |
| 24 | Agency banner "Update payment method" after the subscription ended | Have the agent reword it† |
| 25 | Hold failure tone: danger or warning | Danger† |
| 26 | Website monitoring: `apps/site` claim vs `WEBSITE_MONITORING_LIVE` | Keep "Switching on soon" until Stage 6's last step |
| 27 | Site `HERO.eyebrow`, "under your brand", vendor `<title>` format (17c) | Follow Stage 0 #4 |

**Can be closed:** the `rm.nofingers.ai` `APP_URL` item (production is `rivalmonday.app`), and the OpenRouter and Neon logo downloads (done 2026-10-30).
