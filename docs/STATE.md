# State of `main`

> **Overwritten, never appended. Hard cap 8 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-16

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (MCP, Ask "Friday", knowledge base), **Phase 8** (owner-verified 2026-10-15), **Phase 12** (competitor discovery + starting-point brief; owner-verified 2026-10-16) + post-12 polish, and **Phase 9 (9a platform → agency billing, 9b agency → client billing via Stripe Connect; merged 2026-10-16, owner-verified 2026-10-16)** + phase-9-fixes (Subscribe after an ended subscription; auto-refresh after a Stripe return) are on `main`.
- Migrations run through **`0064`** (next free `0065`). `cs_dev` is at 0064 (migrated 2026-10-16; snapshot before it `backups/20261016-032408-cs_dev`). `cs_demo` is seeded by `pnpm demo:reset` (includes client-billing demo data).
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite and full E2E at `/rm-merge` and in CI. Phase 9 at merge: 4,303 unit (every package), 72/72 E2E.
- Switches: `KB_IMPORT_ENABLED` (unset = off), `ASK_FAKE_AI` and `BILLING_FAKE_GATEWAY` (E2E only). Billing is off (gateway null) until `STRIPE_SECRET_KEY` is set. Worker env `NEON_API_KEY`, `NEON_ORG_ID` not set yet.
- **In flight:** Phase 10 built + reviewed, not merged (branch `phase-10`); Phase 11 (11a–11c) specs + plans approved, execution waits for the Phase 10 merge (branch `phase-11`). Phase 7 deferred (parked on `phase-7-planning`).
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbook: [OPS.md](OPS.md).

## Next up
**Owner housekeeping (Phase 8c):** Neon $/CU-hour rate set (2026-10-16); set `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy.

**At prod deploy (Phase 9):** `set_seat_cap_exempt` for the owner's agency if it has > 3 active clients (backfill makes every agency a capped pilot).

**Then:**
1. **Merge Phase 10** (agency self-serve sign-up + onboarding; built and reviewed 2026-10-16, `docs/work/phase-10.md` on its branch). Before `/rm-merge phase-10`: (a) owner reviews its "Rulings made during execution" + R20 copy; (b) owner adds `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM` (fakes/defaults work until then); (c) the phase-10 session rebases on `main` — expect a conflict in `packages/tools/src/tools/billing.ts` (`get_billing_summary` gains `hasSubscription` here and `reducedTrial`/`maxActiveClients` there; keep all; `create_checkout_session` gains `returnTo`). Merge adds migrations **0065–0066** (`cs_dev` migrate on owner OK). After it: Phase 11 execution (pre-flight rebase on the new `main`).
2. Phase 9 "Soon" backlog items (ACH disable race, reconcile lifting auto-pause, client page after turn-off, untracked-subscription notice, fake gateway on Vercel preview, billing page auto-refresh after every Stripe action).
3. **Waiting on real data:** first real alerts expected from the 2026-10-20 weekly pull. See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff` → brainstorm → spec → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` → `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
