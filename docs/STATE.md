# State of `main`

> **Overwritten, never appended. Hard cap 8 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-16

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (MCP, Ask "Friday", knowledge base), **Phase 8** (owner-verified 2026-10-15), **Phase 12** (competitor discovery + starting-point brief; owner-verified 2026-10-16) + post-12 polish, **Phase 9** (9a platform → agency billing, 9b agency → client billing via Stripe Connect; owner-verified 2026-10-16) + phase-9-fixes, and **Phase 10 (agency self-serve sign-up + onboarding wizard; merged 2026-10-16, owner verification pending)** are on `main`.
- Migrations run through **`0066`** (next free `0067`). `cs_dev` is at 0066 (migrated 2026-10-16 at the Phase 10 merge). `cs_demo` is seeded by `pnpm demo:reset`.
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite and full E2E at `/rm-merge` and in CI. Phase 10 at merge: 4,715 unit (every package, 0 failed), 76/76 E2E.
- Switches: `KB_IMPORT_ENABLED` (unset = off), `ASK_FAKE_AI` and `BILLING_FAKE_GATEWAY` (E2E only). Billing is off (gateway null) until `STRIPE_SECRET_KEY` is set. Turnstile is faked until `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` are set (warning logged). Worker env `NEON_API_KEY`, `NEON_ORG_ID` not set yet.
- **In flight:** Phase 11 (11a–11c) specs + plans approved; execution next (pre-flight rebase on this `main`, branch `phase-11`). Phase 7 deferred (parked on `phase-7-planning`).
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbook: [OPS.md](OPS.md).

## Next up
**Owner — Phase 10 verification** (rulings R1–R25 are in the phase-10 commit history / plan; R20 = profile intro copy says "Only your agency name is required…" although saving the step needs contact name/email/phone — sign off or change):
1. `.env`: add `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (Turnstile site covers `rivalmonday.app` + `localhost`), `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM` (stream exists, unsubscribe handling **"None"**).
2. Incognito → `/sign-up` with a real address → confirm email → wizard → skip all → `/agency` checklist "0 of 5"; operator notice + welcome email arrive (no separate "trial started" email — R3).
3. `/platform/billing`: email-locked pilot invite with "Email it" → redeem with the wrong Google account → problem page; right one → pilot, "Join the Rival Monday pilot" heading.
4. Pause sign-ups → `/sign-up` shows paused copy; invite link still works; funnel stat row shows the test sign-ups.
5. Next day 15:00 UTC: day-1 tip on the broadcast stream; Gmail "Unsubscribe" works in one click.
6. Open-trial agency: second active client refused ("Your trial includes 1 active client. Add a payment method to monitor up to 3."); allowed after Checkout.
7. Copy sign-off: profile intro (R20) and the four email templates (`agency_invite`, `agency_welcome`, `onboarding_tip`, `platform_signup_notice`).

**Owner housekeeping:** set `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy. **At prod deploy (Phase 9):** `set_seat_cap_exempt` for the owner's agency if it has > 3 active clients.

**Then:**
1. **Phase 11 execution** (client onboarding wizard, 11a–11c) on branch `phase-11` — rebase on the new `main` first (Phase 10 adds `agency_onboarding`, `create_client` stamps `first_client_at`, `get_billing_summary` gains `reducedTrial`/`maxActiveClients`, open-trial 1-client cap).
2. Phase 9/10 "Soon" backlog items (BACKLOG § Phase 9 / Phase 10 follow-ups).
3. **Waiting on real data:** first real alerts expected from the 2026-10-20 weekly pull. See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff` → brainstorm → spec → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` → `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
