# State of `main`

> **Overwritten, never appended. Hard cap 8 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here - each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-22

## Where `main` is
- Phases 0-2, 3a-3d, 4a, 4b, 5a-5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (MCP, Ask "Friday", KB), **8**, **12** + polish, **9** + fixes (owner-verified), **10**, **11**, **phase-11-fixes**, **13b** (owner-closed 2026-10-19) + Ask fixes, **15a** (UX/IA), **14** (verticals, runbooks), **15b-1** (help system), **15b-2** (help content), **15b-3a** (topic rename, data & engine) and **Phase 7a** (7a1 deploy/observability/runtime roles + 7a2 security/data lifecycle; merged 2026-10-22) are on `main`. Owner verification pending for 10, 11, 11-fixes, 15a, 14, 15b, 7a, 15b-3a. **Phase 13 is not finished: 13a (white-label) is unbuilt. 7a1 Task 12 (live deploy) is not done.**
- Migrations run through **`0084`** (next free `0085`). `cs_dev` at 0084 + `kb:seed` (2026-10-22). `cs_demo` is seeded by `pnpm demo:reset` (re-run before demoing).
- Tests on the local test cluster (`scripts/local-test-db.sh`, port 5444). Last full runs (15b-2 merge, 2026-10-21): unit 6,447 tests (59 min; one load-flake, PinPageSwitch), E2E 121/121. The 15b-3a merge ran `test:affected` only (15/15 packages); full unit + full E2E deferred by the owner until after `phase-15c` merges.
- Switches: `KB_IMPORT_ENABLED`, `ASK_FAKE_AI`, `BILLING_FAKE_GATEWAY`, `SETUP_FAKE_LOOKUP` (E2E only). Billing off until `STRIPE_SECRET_KEY`; Turnstile faked until its keys; `STADIA_API_KEY` in `.env` (dev). Worker env `NEON_API_KEY`, `NEON_ORG_ID` not set yet. `POSTMARK_WEBHOOK_SECRET` is added on Vercel only.
- **In flight (unmerged):** `phase-15c` (15c-1 built and reviewed, rebased on 7a; on hold for 15b-3a; next: rebase on main, owner verification, merge; its archive button needs archive exposed as a tool, 7a2 built only the worker CLI `archiveTenant`). Stale `cs_phase_6_test` still on the local cluster. `main` pushed at `76c9809d` before this merge; CI `deploy` skipped until repo var `DEPLOY_ENABLED=true`. 13a (white-label hosts) not started; it overlaps 7a on webhook/email env, error pages and `turbo.json`, and 7a's deploy precedes 13a live.
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbooks: [OPS.md](OPS.md), [DEPLOY.md](DEPLOY.md).

## Next up
**Owner - Phase 7a verification.** Neon dev roles exist and `cs_dev` is migrated + seeded. At first deploy ([DEPLOY.md](DEPLOY.md)): (1) `https://rivalmonday.app` serves on TLS, magic link arrives from `briefs@mail.rivalmonday.app`, mail-tester >= 9/10; (2) Sentry test event from web and worker; (3) Railway deployment Active, `/healthz` 200, `/platform/health` green after 1 h; (4) `/bot` + `/robots.txt` load signed out, then set `WEB_MONITORING_ENABLED=true` (last); (5) `profile:pages --base https://rivalmonday.app --cookie FILE`: agency/workspace p75 <= 1.5 s, all pages <= 3 s; (6) `kb:seed` on prod. 7a2: (7) Postmark webhook `https://postmark:<secret>@rivalmonday.app/api/postmark/webhook` (Bounce + Spam complaint), test bounce deactivates the contact, wrong password 401; (8) R2 no-overwrite re-put fails (untested live); (9) archive a throwaway client (`archive client <id>`: pages 404, `--undo` restores, `purge-archived --older-than 90d --dry-run` lists nothing); (10) a plan without `ask` hides Ask pages; (11) sign off the `/platform/health` help copy. Also owner Qs in BACKLOG § Owner (prod accounts O17, Postmark 500 vs 200, purge anonymising `platform_support`, archived ledger rows).

**Then, in order:** shell-DB-stages gate (BACKLOG "Launch gate": target `--assert-db-stages 8`) -> staging environment setup (owner decision pending: Vercel Preview + Neon `staging` branch + a worker, local or Railway) -> 7a1 Task 12 live deploy -> 7b brainstorming (money; may start any time). **Dev next:** `/rm-kickoff phase-15b3b` (topic rename surfaces), then merge `phase-15c`.

**Owner - Phase 15b-3a verification** (on `cs_dev` per [OPS.md](OPS.md), already migrated to 0084): run `pnpm --filter @cs/db topic-leftovers` (expect no output); deploy web + worker together (stop the worker while migrating); `/platform/themes` queue still lists and decides proposals; existing client briefs/moves show "Topic" wording.

**Owner - Phase 15b verification** (`kb:seed` done on `cs_dev` 2026-10-21): sign off the four copy docs `docs/archive/phase-15b2-copy-signoff-{client,agency,platform-account,terminology}.md` incl. their "Decisions for the owner"; client owner sees client guides/tips with no agency wording, agency admin the agency versions; white-label agency without a display name reads "your agency"; help pages (search, glossary client terms only to clients; `/platform/themes` reads "Topic proposals"); "Ask {assistant} about this page" auto-sends (hidden in support sessions).

**Owner - Phase 14 verification** (after 0077-0079 on `cs_dev`): run `pnpm --filter @cs/worker runbook:backfill --dry-run`, then for real, **before the next brief run**. Then: (1) look up and draft a real distillery (quotes match the profile), create it, finish setup; a second distillery preselects it; approve it in `/platform/verticals`; merge a duplicate; `/platform/costs` shows the draft cost. (2) Existing clients' next briefs are unchanged. (3) A Distillery client's runbook is tailored. (4) Customise a play; the next brief uses it. (5) An agency edit shows "Update available" on the client. (6) A platform runbook edit reaches agencies as an update. Copy: [archive/phase-14-copy-signoff.md](archive/phase-14-copy-signoff.md).

**Owner - Phase 15a verification** (no migrations): context switcher Platform/Agency/Client (search, pin, Recent, Ctrl/Cmd+K; Platform lists only your agencies); agency admin / scoped AM menus + badges; client view (Ask Friday first, Briefs & reports, Client settings); client owner has no switcher/Platform; old `/agency/team|branding/logo|webhooks` bookmarks redirect; white-label client sign-in shows agency branding; phone 390px drawer; copy sign-off (group labels, "Lead pool", "Billing & plans", "Ask reviews", "Business profile", empty states, Ask disclosure, Previous = older).

**Owner - phase-11-fixes re-test:** pilot-link refusal on `/platform/billing`; `/onboarding` profile intro + red error box; duplicate-listing lookup cards on `/agency/clients/new` and `/start`; empty-suggestions note; copy in [archive/phase-11-fixes-copy-signoff.md](archive/phase-11-fixes-copy-signoff.md).

**Owner - Phase 11 verification:** 11a lookup → suggestions → search (<= $3) → pick → starting point in 48 h; owner invite; 14:00 UTC reminder; `DATAFORSEO_LOGIN`/`_PASSWORD` on Vercel. 11b Postmark Cc; invite → accept → first brief; billing step on Stripe test. 11c real Turnstile; dental preview; accept → prospect → invite; `/start` branding. Clean up CS Dev Verification Agency/Client first. Copy: [archive/phase-11-copy-signoff.md](archive/phase-11-copy-signoff.md).

**Owner - Phase 10 verification:** `.env` `TURNSTILE_*`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM`; incognito sign-up → wizard → checklist; pilot invite "Email it"; pause sign-ups; day-1 tip + unsubscribe; open-trial second client refused until Checkout; copy (R20 intro, four email templates).

**Owner housekeeping:** `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy; `set_seat_cap_exempt` for the owner's agency at prod deploy if > 3 active clients.

**Later:** 13a1 -> 13a2 (owner first: neutral domain, Vercel wildcard + `mcp.` host, Postmark `mail.<neutral>`, tokens); merge `phase-15c`; Phase 9/10/11/15 "Soon" backlog items. **Waiting on real data:** first real alerts from the 2026-10-20 weekly pull.

## Process (short)
`/rm-start` -> `/rm-kickoff` -> brainstorm -> spec -> lean plan -> owner approval -> subagent-driven development -> `/rm-wrap-up` -> `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
