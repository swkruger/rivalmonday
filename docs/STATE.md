# State of `main`

> **Overwritten, never appended. Hard cap 8 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here — each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-16

## Where `main` is
- Phases 0–2, 3a–3d, 4a, 4b, 5a–5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (MCP, Ask "Friday", knowledge base), **Phase 8** (owner-verified 2026-10-15), **Phase 12** (competitor discovery + starting-point brief; owner-verified 2026-10-16) + post-12 polish, and **Phase 9 (9a platform → agency billing, 9b agency → client billing via Stripe Connect; merged 2026-10-16, owner Stripe checks pending)** + phase-9-fixes (Subscribe after an ended subscription; auto-refresh after a Stripe return) are on `main`.
- Migrations run through **`0064`** (next free `0065`). `cs_dev` is at 0064 (migrated 2026-10-16; snapshot before it `backups/20261016-032408-cs_dev`). `cs_demo` is seeded by `pnpm demo:reset` (includes client-billing demo data).
- Tests run on the local test cluster (`scripts/local-test-db.sh`, port 5444): `pnpm test:affected` while working; full suite and full E2E at `/rm-merge` and in CI. Phase 9 at merge: 4,303 unit (every package), 72/72 E2E.
- Switches: `KB_IMPORT_ENABLED` (unset = off), `ASK_FAKE_AI` and `BILLING_FAKE_GATEWAY` (E2E only). Billing is off (gateway null) until `STRIPE_SECRET_KEY` is set. Worker env `NEON_API_KEY`, `NEON_ORG_ID` not set yet.
- **Planned, not built:** Phase 10 (`docs/work/phase-10.md`), Phase 7 deferred (parked on `phase-7-planning`).
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbook: [OPS.md](OPS.md).

## Next up
**Owner housekeeping (Phase 8c):** Neon $/CU-hour rate set (2026-10-16); set `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy.

**Checks waiting on the owner — Phase 9** (automated tests pass; these need real Stripe test mode):
- [ ] **Setup:** Stripe test account → add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED`, `STRIPE_CONNECT_WEBHOOK_SECRET` to `.env`; enable Connect; `pnpm --filter @cs/worker billing:sync-plan`. Billing stays off until the key is set.
- [ ] **phase-9-fixes:** after cancelling in Stripe, the billing page shows **Subscribe** → Checkout 4242… → page flips to Active within seconds without a reload (banner gone).
- [ ] **9a agency billing** (`stripe listen --forward-to localhost:3000/api/stripe/webhook`): checkout 4242… → active; 4th client → prorated seat line; card 4000 0000 0000 0341 → past_due + email; Portal cancel → cancelled; agency-restricted code from another agency → refused.
- [ ] **9b client billing** (`stripe listen --forward-connect-to localhost:3000/api/stripe/connect-webhook`; endpoint events: account.updated, account.application.deauthorized, checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted, charge.refunded, charge.dispute.created): connect a test Standard account; $199 default; enable billing → email link → pay 4242… → Paying + agency email; client owner "Manage payment" opens the portal (proves Stripe accepts the portal config); change default price then resend; failing card → Payment needed + both emails; auto-pause N=1 via `billing-daily`, resume, run again → stays resumed; ACH disable before the debit clears → cancels at period end; refund reflected; disconnect, reconnect reuses the account.
- [ ] **Copy sign-off:** the three agency email bodies (`agency-client-billing-notice.tsx`: payment failed / now paying / auto-paused, implementer wording) and "This client is paused. Resume it to search for competitors."
- [ ] **Demo look-through** (`pnpm demo:reset`): client billing on the main demo agency + "Prairie Growth Partners" (3 paying, 1 payment needed, 1 paused).
- [ ] **After prod deploy:** `set_seat_cap_exempt` for the owner's agency if it has > 3 active clients (backfill makes every agency a capped pilot).

**Then:**
1. **Phase 10** (agency self-serve sign-up + onboarding; `docs/work/phase-10.md`) — now unblocked; consumes `startAgencyTrial` + invite links; re-check the 9a interfaces (BACKLOG § Phase 9: `applyBillingSignal` default pilot row vs `startAgencyTrial`). **Still to plan:** Phase 11 (client onboarding wizard).
2. Phase 9 "Soon" backlog items (ACH disable race, reconcile lifting auto-pause, client page after turn-off, untracked-subscription notice, fake gateway on Vercel preview).
3. **Waiting on real data:** first real alerts expected from the 2026-10-20 weekly pull. See BACKLOG § Waiting.

## Process (short)
`/rm-start` → `/rm-kickoff` → brainstorm → spec → lean plan → owner approval → subagent-driven development → `/rm-wrap-up` → `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
