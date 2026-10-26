# State of `main`

> **Overwritten, never appended. Hard cap 12 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here - each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-25

## Where `main` is
- Phases 0-2, 3a-3d, 4a, 4b, 5a-5c-2, demo data / dev panel, Phase 5 polish, Phase 6 (MCP, Ask "Friday", KB), **8**, **12** + polish, **9** + fixes (owner-verified), **10**, **11**, **phase-11-fixes**, **13b** (owner-closed 2026-10-19) + Ask fixes, **15a** (UX/IA), **14** (verticals, runbooks), **15b-1** (help system), **15b-2** (help content), **15b-3a** (topic rename, data & engine), **15b-3b** (topic rename, surfaces; owner-verified 2026-10-23), **15c-1** (shared UI pieces; merged 2026-10-22), **15c-2a** (page fixes: platform, agency, account/public; merged 2026-10-23), **15c-2b-1** (client pages; merged 2026-10-24), **15c-2b-2** (client-page sweep; merged 2026-10-25; copy approved 2026-10-24), **7b1** (cost guards; merged 2026-10-24), **7c1** (quality gates: tenant-isolation suite, RLS sweep, MCP contract tests, evals + cassettes in CI; merged 2026-10-25), **15c-3a** (agency management: rename, people, hold, archive; merged 2026-10-25), **15c-3b** (plan versions + agency moves; merged 2026-10-25), **7b2** (billing correctness; merged 2026-10-25), **7c2** (scale & pilot: concurrency, vendor limiter, capture pacing, readiness alarms, rehearsal tooling, feedback links, PILOT.md; code merged 2026-10-25, rehearsal pending) and **Phase 7a** (7a1 deploy/observability/runtime roles + 7a2 security/data lifecycle; merged 2026-10-22) are on `main`. Owner verification pending: 10, 11, 11-fixes, 15a, 14, 15b, 7a, 15b-3a, 15c-1, 15c-2a, 15c-2b-1, 15c-2b-2, 15c-3a, 15c-3b, 7b1, 7b2, 7c1, 7c2. **Phase 13 is not finished: 13a (white-label) is unbuilt. 7a1 Task 12 (live deploy) is not done.**
- Migrations run through **`0094`** (`ops_alert`; next free `0095`; 0089 `ledger_cost_numeric`, 0090 `spend_guard`, 0091 `retry_backoff`, 0092 `ask_thread_deleted_at`, 0093 `agency_hold`). `cs_dev` at 0094 + `kb:seed` (2026-10-25). `cs_demo`: `pnpm demo:reset` before demoing.
- Tests: local cluster (`scripts/local-test-db.sh`, port 5444). Last full local run: 15c-2b-2 merge (2026-10-25): unit 8,582 passed / 4 env failures; E2E 137/137. Since then (7c2, 7b2, 15c-3b merges): affected unit + `e2e:affected` green (15c-3b: 141/141); full suites deferred to CI.
- **Prod worker now needs `SERVICE_DATABASE_POOLED_URL`** (refuses to start without it); `WORKER_QUEUE_CONCURRENCY` optional. Rehearsal-only vars (`AI_PROVIDER_MODE`, `VENDOR_FAKE_MODE`, `CRAWL_HOST_ALLOWLIST`, `REHEARSAL_LIVE_CLIENT_IDS`, `FIXTURE_HOSTS`, `FIXTURE_LOG_TOKEN`) are refused outside staging.
- Switches: `KB_IMPORT_ENABLED`, `ASK_FAKE_AI`, `BILLING_FAKE_GATEWAY` (refused on any Vercel env; worker ignores it), `SETUP_FAKE_LOOKUP`, `WEBHOOK_FAKE_SEND` (E2E only). Billing off until `STRIPE_SECRET_KEY`; Turnstile faked until keys; `STADIA_API_KEY` in `.env` (dev). `POSTMARK_WEBHOOK_SECRET` is added on Vercel only.
- **In flight:** `phase-16` (design system v1, on hold; rebase onto main now - also migrate 7c2's readiness section on `/platform/health`, avatar "Send feedback", brief-page feedback line; new/changed tools need `ISOLATION_FIXTURES`, run `pnpm eval:replay`). Not started: 13a (overlaps 7a on webhook/email env, error pages, `turbo.json`). CI `deploy` skipped until repo var `DEPLOY_ENABLED=true`.
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbooks: [OPS.md](OPS.md), [DEPLOY.md](DEPLOY.md).

## Next up
**Owner - Phase 7b2 verification** (no migrations; M8 copy signed off): on a Vercel preview set `BILLING_FAKE_GATEWAY=1` and confirm the deploy refuses to serve. Add to the first-deploy checks.

**Owner - Phase 15c-3b verification** (no migrations): publish a version with MCP unticked; move two test agencies (one with a Stripe test subscription: new prices from next billing date, no proration item; held/cancelled greyed); admins get the email; agency page shows "Plan v2"; sign [archive/phase-15c3b-copy-signoff.md](archive/phase-15c3b-copy-signoff.md).

**Owner - Phase 7c2 (scale & pilot).** (1) Sign off copy (none is approved; needed before the first invite): ops alert email `platform_ops_alert` (subjects `Rival Monday ops: {n} brief(s) not ready for {date}` / `... awaiting approval for {date}` / `... starting point late for {client}`, lead lines, "Open Health: {url}", footer); `/platform/health` "Brief readiness" panel (headings, counts, chips Critical/Warning, checkpoint names, "emailed {when}", "No readiness issues.", failure line); feedback lines (client email "Something look off? Reply to this email or write to {name|your agency} at {email}.", in-app "Something look off? Email {name|your agency}." with mailto subject `Feedback: {client} - {page title}`, agency menu "Send feedback", welcome line "Questions or feedback during the pilot? Email {supportEmail}. We read every message."); readiness `HelpTip`/guide wait on this. (2) Staging per [DEPLOY.md](DEPLOY.md) § Staging (Neon `staging` branch, R2, Postmark test token, Vercel Preview, Railway worker + fixture-hosts, 5 CNAMEs; <= $5 live AI, ~$20 infra), then Task 12 rehearsal ([OPS.md](OPS.md) § Rehearsal) and Task 13 (BACKLOG § Waiting). (3) Before the first invite: [PILOT.md](PILOT.md) § 1 gate incl. the prod tenant-check SQL.

**Owner - Phase 15c-3a verification:** (1) put a test agency on hold: its admin gets the email, the agency UI is read-only with the banner, Stripe test subscriptions show "collection paused"; (2) lift it: the email arrives and collection resumes; (3) archive an agency with a live test subscription: refused; (4) cancel it, archive, find it under Archived, unarchive; (5) invite an agency admin: the email names the agency, not you; (6) change roles and hit the last-admin refusal; (7) sign [archive/phase-15c3a-copy-signoff.md](archive/phase-15c3a-copy-signoff.md) incl. its 3 questions.

**Owner - Phase 15c-2b-2 verification** (no migrations): zone labels ("CT") on Changes/alert/evidence pages; Changes at 390 px list-only; Alert rules band bar and Save-on-change; Delivery Discard; confirm dialogs (billing link, Stop tracking); Ask privacy sentence; Usage "Ask turned off by limit"; Reviews "Show as table".

**Owner - Phase 7c1 verification** (no migrations): (1) GitHub environment `evals` with secrets `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, `POSTMARK_SERVER_TOKEN`, `EVALS_ALERT_TO`, `EVALS_ALERT_FROM`; run `workflow_dispatch` once; **do NOT make `evals-live` a required check** (`ask-inject-09` flaps; BACKLOG § Owner). (2) Labels: regenerate CSVs with `pnpm --filter @cs/evals eval label --suite <s> --export label-work/<s>-labels.csv`, fix in `tools/decision-labeler.html`, `eval label --import ... --by <name>`, `eval run --suite <s> --mode replay --update-baseline`; commit. (3) Sign off: Ask drops uncited figure/date sentences. (4) Agency alerts `?client=<foreign id>` 404. (5) Confirm R7 (global catalogue) is by design.

**Owner - Phase 15c-2b-1 verification** (0089-0092): delete an Ask thread via the dialog (`/platform/ask` shows "Deleted by user"); Changes "Whole page" tab on a web price change; evidence "Compare with previous"; 390 px Changes/Moves open a right sheet on tap; double-save of an Ask answer gives one row; decide the P6 message-keyed dedupe (BACKLOG § Phase 15).

**Owner - Phase 7b1 verification** (deploy web + worker together): (1) agency usage page shows credits only, read-only; a client owner sees their own usage; (2) set a low client limit override: reached shows the calm notice; 130 % pauses once with banner and emails; raising it shows "Pause lifted."; (3) Ask on a paused client says so; a rank scan is refused; (4) lower spike floors on `/platform/costs`: Health shows Warning/Paused, Reset needs a note.

**Owner - Phase 15c-2a verification:** slack-teams settings; Team Resend (4th/24 h refused); intake Preview with link off; check-email Resend countdown; `/platform/billing` tabs; Alert review client filter; Branding buttons.

**Owner - Phase 15c-1 verification:** unknown URL shows "Page not found"; radius in miles; rankings charts "You" dark blue; sign off [archive/phase-15c1-copy-signoff.md](archive/phase-15c1-copy-signoff.md); decide the `reportError` digest-skip.

**Owner - Phase 7a verification.** At first deploy ([DEPLOY.md](DEPLOY.md)): (1) `https://rivalmonday.app` serves on TLS, magic link arrives from `briefs@mail.rivalmonday.app`, mail-tester >= 9/10; (2) Sentry test event from web and worker; (3) Railway Active, `/healthz` 200, `/platform/health` green after 1 h; (4) `/bot` + `/robots.txt` load signed out, then set `WEB_MONITORING_ENABLED=true` (last); (5) `profile:pages --base https://rivalmonday.app --cookie FILE`: agency/workspace p75 <= 1.5 s, all pages <= 3 s; (6) `kb:seed` on prod. 7a2: (7) Postmark webhook `https://postmark:<secret>@rivalmonday.app/api/postmark/webhook` (Bounce + Spam complaint): test bounce deactivates the contact, wrong password 401; (8) R2 no-overwrite re-put fails (untested live); (9) archive a throwaway client (`archive client <id>`: pages 404, `--undo` restores, `purge-archived --older-than 90d --dry-run` lists nothing); (10) a plan without `ask` hides Ask pages; (11) sign off the `/platform/health` help copy. Also owner Qs in BACKLOG § Owner.

**Then, in order:** staging setup -> 7c2 Task 12 rehearsal (numbers become code defaults) + Task 13 -> shell-DB-stages gate (BACKLOG "Launch gate": target `--assert-db-stages 8`) -> 7a1 Task 12 live deploy -> pilot. **Phase 7 dev:** 7b1, 7b2, 7c1, 7c2 all merged. **Dev next:** phase-16 in flight; Jev via OpenRouter (research done 2026-10-25, owner questions open; `/rm-kickoff` next).

**Owner - Phase 15b-3a verification:** `pnpm --filter @cs/db topic-leftovers` (expect no output); deploy web + worker together; `/platform/topics` queue works.

**Owner - Phase 15b verification** (`kb:seed` done 2026-10-21): sign off the four `docs/archive/phase-15b2-copy-signoff-{client,agency,platform-account,terminology}.md` incl. decisions; check client vs agency guides/tips, white-label "your agency", help search/glossary, "Ask {assistant} about this page".

**Owner - Phase 14 verification** (after 0077-0079 on `cs_dev`): `pnpm --filter @cs/worker runbook:backfill --dry-run`, then for real, **before the next brief run**; then create/approve a real vertical, check tailored client runbook, "Update available". Copy: [archive/phase-14-copy-signoff.md](archive/phase-14-copy-signoff.md).

**Owner - Phase 15a verification** (no migrations): context switcher, agency/client menus and badges, client view (Ask Friday first), old bookmarks redirect, white-label sign-in branding, phone drawer, copy sign-off.

**Owner - phase-11-fixes re-test:** pilot-link refusal on `/platform/billing`; duplicate-listing cards on `/agency/clients/new` and `/start`; copy in [archive/phase-11-fixes-copy-signoff.md](archive/phase-11-fixes-copy-signoff.md).

**Owner - Phase 11 verification:** 11a lookup -> suggestions -> search (<= $3) -> starting point in 48 h; 11b Postmark Cc, invite -> accept -> first brief, Stripe test billing; 11c real Turnstile, dental preview, `/start` branding. Clean up CS Dev Verification Agency/Client first. Copy: [archive/phase-11-copy-signoff.md](archive/phase-11-copy-signoff.md).

**Owner - Phase 10 verification:** `.env` `TURNSTILE_*`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM`; incognito sign-up -> wizard; pilot invite; second open-trial client refused until Checkout.

**Owner housekeeping:** `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy; `set_seat_cap_exempt` for the owner's agency at prod deploy if > 3 active clients.

**Later:** 13a1 -> 13a2 (owner first: neutral domain, Vercel wildcard + `mcp.` host, Postmark `mail.<neutral>`, tokens); Phase 9/10/11/15 "Soon" backlog items. **Waiting on real data:** first real alerts from the 2026-10-20 weekly pull.

## Process (short)
`/rm-start` -> `/rm-kickoff` -> brainstorm -> spec -> lean plan -> owner approval -> subagent-driven development -> `/rm-wrap-up` -> `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
