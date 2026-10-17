# State of `main`

> **Overwritten, never appended. Hard cap 8 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here - each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-17

## Where `main` is
- Phases 0-2, 3a-3d, 4a, 4b, 5a-5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (MCP, Ask "Friday", knowledge base), **Phase 8**, **Phase 12** + post-12 polish, **Phase 9** (9a/9b) + phase-9-fixes (all owner-verified), **Phase 10** (agency self-serve sign-up + onboarding wizard; merged 2026-10-16, owner verification pending) and **Phase 11** (11a setup wizard, 11b client invite/review email/billing, 11c intake links + lead pool; merged 2026-10-17, owner verification pending) are on `main`.
- Migrations run through **`0073`** (next free `0074`). `cs_dev` is at 0066: **not yet migrated to 0067-0073** (pending owner OK). `cs_demo` is seeded by `pnpm demo:reset`.
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite and full E2E at `/rm-merge` and in CI.
- Switches: `KB_IMPORT_ENABLED` (unset = off), `ASK_FAKE_AI`, `BILLING_FAKE_GATEWAY`, `SETUP_FAKE_LOOKUP` (E2E only). Billing is off (gateway null) until `STRIPE_SECRET_KEY` is set. Turnstile is faked until `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` are set. Worker env `NEON_API_KEY`, `NEON_ORG_ID` not set yet.
- **In flight:** **Phase 13b** local rankings on `phase-13b` ([work](work/phase-13b.md)). Phase 13 planning docs (umbrella [work/phase-13.md](work/phase-13.md), 13a white-label plan) are on `main`; 13a (13a1 then 13a2) follows 13b. Phase 7 deferred (parked on `phase-7-planning`).
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbook: [OPS.md](OPS.md).

## Next up
**Owner - Phase 11 verification** (after OK to migrate `cs_dev` to 0073):
- **11a (`cs_dev`):** 1 add a business via lookup; 2 suggestions within a minute, quotes match GBP; 3 search after "Save and find competitors" (<= $3); 4 pick, Done -> starting point due in 48 h; 5 invite an owner via `/agency/team`, they finish a second client's setup; 6 14:00 UTC reminder next day; 7 `DATAFORSEO_LOGIN`/`_PASSWORD` on Vercel web; 8 GBP `description` on a live lookup.
- **11b:** (a) real Postmark send shows the Cc; (b) invite -> accept: contact active, first brief only after acceptance; (c) billing step with a pending owner on Stripe test; (d) sign-in branding for an invited white-label owner.
- **11c:** (a) real Turnstile on `cs_dev`; (b) real preview for a dental business, numbers match; (c) accept -> prospect -> owner invite; (d) platform `/start` branding; (e) set the agency's slug. Before real onboarding: clean up the CS Dev Verification Agency/Client.
- **Copy sign-off (all of Phase 11):** every string in [archive/phase-11-copy-signoff.md](archive/phase-11-copy-signoff.md); approve or edit at the source file named in each heading.

**Owner - Phase 10 verification** (rulings R1-R25 are in the phase-10 commit history / plan; R20 = profile intro copy says "Only your agency name is required..." although saving the step needs contact name/email/phone - sign off or change):
1. `.env`: add `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (site covers `rivalmonday.app` + `localhost`), `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM` (stream exists, unsubscribe handling **"None"**).
2. Incognito -> `/sign-up` with a real address -> confirm email -> wizard -> skip all -> `/agency` checklist "0 of 5"; operator notice + welcome email arrive.
3. `/platform/billing`: email-locked pilot invite with "Email it" -> wrong Google account -> problem page; right one -> pilot.
4. Pause sign-ups -> `/sign-up` shows paused copy; invite link still works; funnel stat row shows the test sign-ups.
5. Next day 15:00 UTC: day-1 tip on the broadcast stream; Gmail "Unsubscribe" works in one click.
6. Open-trial agency: second active client refused ("Your trial includes 1 active client. Add a payment method to monitor up to 3."); allowed after Checkout.
7. Copy sign-off: profile intro (R20) and the four email templates (`agency_invite`, `agency_welcome`, `onboarding_tip`, `platform_signup_notice`).

**Owner housekeeping:** set `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy. **At prod deploy (Phase 9):** `set_seat_cap_exempt` for the owner's agency if it has > 3 active clients.

**Then:**
1. **Phase 13b** continues on `phase-13b` (`/rm-start` in `../CompetitorSpy-wt/phase-13b`); its migrations start at 0074. Then 13a1 -> 13a2 (owner first: neutral domain, Vercel wildcard + `mcp.` host, Postmark `mail.<neutral>`, Vercel + Postmark account tokens).
2. Phase 9/10/11 "Soon" backlog items (BACKLOG follow-up sections).
3. **Waiting on real data:** first real alerts expected from the 2026-10-20 weekly pull. See BACKLOG Waiting.

## Process (short)
`/rm-start` -> `/rm-kickoff` -> brainstorm -> spec -> lean plan -> owner approval -> subagent-driven development -> `/rm-wrap-up` -> `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
