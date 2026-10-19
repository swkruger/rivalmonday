# phase-7 — scope per sub-phase (Brief §1 + §4)

Companion to [phase-7.md](phase-7.md). Items are verbatim from `docs/BACKLOG.md` (section in brackets) unless marked *owner list* (owner direction 2026-10-19). "(part)" = only that part of a longer backlog line.

## 7a — Production & security (core §10.2, §11, §4.5, §9.4, §8.3–8.4, §3)
**Deploy blockers** [Phase 7 › Deployment / Scale]
- [ ] Vercel file tracing for `packages/ai/config/ai.yaml` and `packages/verticals/packs/` — *from Phase 1 review* (14a: packs become seed + fixtures; re-check what still loads at runtime)
- [ ] `@cs/core` uses `node:crypto` (not Edge-safe) — *from Phase 1 review*
- [ ] Deploy note: migration `0025`'s `client_score_thresholds_check` fails on any existing malformed row — check before applying to a DB with real clients — *from 3d final review*
- [ ] Deploy note: `magicLink({ storeToken: 'hashed' })` invalidates links issued before the cutover (15-min window) — *from 5b-2 final review Minor 7*
- [ ] Page latency on the remote Neon DB: pages took 28–36 s in E2E (…) — look before launch — *from 5c-2*
- [ ] Align Postgres versions (Neon 18 vs CI/compose `pgvector/pgvector:pg16`) — *from Phase 1 review*
- [ ] Add `drizzle-kit check` to CI — *from Phase 1 review*
- [ ] Per-task AI HTTP timeouts (60 s × 3 worst case, `packages/ai/src/http.ts`) — *from Phase 1 review (Vercel)*
- [ ] Set `"agentGuidance": false` in `turbo.json` if AGENTS.md churns — *from Phase 1 review*
- *owner list:* observability = the parked 7a deploy/observability spec (re-validated, see phase-7.md §2).

**Security** [Phase 7 › Security & data / Phase 6 follow-ups]
- [ ] Least-privilege worker role (worker uses the owner `DATABASE_URL`); must cover the 8 Phase 4b delivery jobs; web `jobStatus` reads `pgboss.job` with the owner URL — *from Phase 1, 3d, 4b, 5b-1*
- [ ] Renderer-level SSRF guard: Playwright `page.route` resolved-IP check or pinned resolver; covers KB import/sync, competitor URLs, robots fetch, `www.`/port redirects; treat SIIT `::ffff:0:0/96` as non-public — *from 6c final review*
- [ ] Ask scope: generic `search`/`fetch` on the `ask` channel can still reach another in-scope client's events/evidence — pin `clientId` to the thread — *from 6b/6c*
- [ ] Ask parked (part): no content-type/Origin check on `/api/ask/turn`; request body-size cap; body parsed before feature/scope checks (400 vs 404) — *from 6b*
- [ ] Ask hardening (part): allowlist `action.tool` vs `ASK_WRITE_TOOLS` + action `clientId` = thread's; per-call model budget — *from 6b*
- [ ] Tier gating of `mcp`/`ask`; MCP `manage` scope for client roles — *from 6a/6c* (ANN index part → 7c)
- [ ] KB robustness (part): `sourceUrl` not http(s)-restricted; validate scope before `kb-import` enqueue — *from 6c*
- [ ] Object store `put` can overwrite (fs `wx` flag; R2 `IfNoneMatch: '*'` once verified live) — *from 2a review*
- [ ] Support audit: direct service reads in sessions (`listTeam`, `listClientRecipients`, `getAgencyBranding`, `listWebhooks`, `/go`, evidence/PDF bytes) aren't session-audited; `end_support_session` audit lands in the operator's home agency — *from 8b*

**Data lifecycle**
- [ ] Postmark bounce/complaint webhooks deactivate contacts (a hard bounce just fails that send today) — *from 4b*
- [ ] Soft-delete/archival before any delete feature — audit/ledger rows cascade-delete with agency/client today — *from Phase 1 review*
- [ ] Retention keeps `brief_item.evidence_ids`, `recommendation.evidence_ids` and `alert.evidence_ids` evidence for the brief's/alert's lifetime — *from 4a/4b cross-phase*
- [ ] Owner decision: verified leads never accepted/declined (incl. pool) keep name/email/phone/message forever; set a retention cap (e.g. 180 d) — *11c*
- [ ] (part of 9a ledger) stale digest/outbox items delivered after reactivation (no age cap — owner call)

**White-label leftovers** — likely **drop from 7a** (15a shipped `{page} · {displayName}` titles + `authBranding()`; 13a P22/Task 5 own the rest):
- [ ] Per-agency browser-tab titles on client pages (…) — *9b R18* → verify closed by 15a, delete
- [ ] Phase 13: sign-in page uses host default branding (…) — *phase-11* → 13a Task 5

## 7b — Money (core §11 budgets, §7.5, §10.6; Phase 9 spec)
[Phase 9 › Soon] — all six:
- [ ] `disable_client_billing`: re-check the row inside the tx (race with an ACH Checkout completing → subscription never cancelled) — *9b R27*
- [ ] Daily reconcile `payment_needed → active` doesn't lift a `paused_by='auto'` pause or set `last_paid_at` — *9b final M3*
- [ ] Client billing page after "turn off" (cancel at period end): shows "Not set up" next to "Your plan ends on …", Billing nav disappears while still paying; same for disconnected rows; amounts ignore `agency_connect.currency` — *9b M4*
- [ ] `checkout_completed` for a second live subscription is only logged (R11) → queue an agency notice for a live `untracked_subscription` (real double charge) — *9b M8*
- [ ] Billing pages auto-refresh after **every** Stripe round trip (…) — reuse `RefreshUntilChanged` — *owner, 2026-10-16*
- [ ] `BILLING_FAKE_GATEWAY` accepted on Vercel preview and by the worker (refuse when `VERCEL_ENV` is set; worker ignores it) — *9a final re-review*

[Phase 7 › Budget & cost / others]
- [ ] Enforce caps (pause Ask/jobs at 100 %) and allocate shared collection cost to clients — *from 5b-2 (decision 18)*
- [ ] Prospect snapshots: add a cooldown (≈ $0.10–0.15 per re-run) and attribute GBP/ads pulls to the prospect — *from 5b-2 final review Minor 3*
- [ ] Switch `cost_usd` (`packages/db/src/schema/ledger.ts`, `doublePrecision`) to `numeric` before real spend data — *from Phase 1 review*
- [ ] `couponFor` ignores `max_redemptions` (…) — *phase-10*; (part of 9a ledger) `redeem_discount_code` doesn't check `discount_code.max_redemptions` on direct coupon attach
- [ ] Failing PDF render re-enqueued hourly for 7 days (≤ ~500 attempts) — add a failure counter/backoff — *from 4b final review*
- [ ] Failing move recommendations retry nightly with no backoff — *from 4a*
- [ ] Anthropic batch: submit precedes `model_batch` insert (orphans not auto-reconciled); apply not idempotent; `collectModelBatches` no per-item try/catch; no `ok:false` ledger row on submit/status/results throw — *from 3d Tasks 8–9, 4a*

## 7c — Scale & pilot (core §12, §1.4, roadmap row 7)
- [ ] Worker concurrency: let `rival-search` (vendor-bound) run 3–5 jobs at once inside the single worker (pg-boss local concurrency), then shorten `RIVAL_MONTHLY_SPACING_SECONDS` — *from owner Q 2026-10-15*
- [ ] Multiple worker replicas / autoscaling on queue depth: move per-host crawl politeness (`collectors/src/web/rate-limit.ts`) and vendor rate limits into Postgres, check every cron job tolerates a second runner, optionally split crawler vs API-only workers; then lift the one-replica rule — *from owner Q 2026-10-15*
- [ ] Cross-replica rate limiter before scaling the worker; one host's large Crawl-delay blocks the single sequential capture queue; robots.txt fetch isn't paced by the limiter — *from 2a review*
- [ ] `listBriefDueClients` scans every client with one lookup each — set-based query — *from 4a cross-phase*
- [ ] Flaky Neon connections in tests (`ECONNRESET`/`connect ETIMEDOUT` …); one un-bisected `@cs/collectors` full-suite failure — add retry/pool settings or bisect — *from 5c-2 / demo runs*
- *roadmap row 7:* AI eval sets in CI (§12: ~300 changes, ~200 reviews, ~50 briefs, ~50 Ask), tenant-isolation suite across all tools + RLS, E2E incl. Ask, MCP contract.
- [ ] MCP tests: cross-agency, P18 scoped member, review cross-client leak, page-level `/sign-in` OAuth, exact client-role `tools/list` — *from 6a* (isolation suite)
- [ ] Tier gating (part): ANN vector index (events, pages, `kb_chunk`) — *from 6a/6c*
- [ ] Run `jev.live.test.ts` once with a real `TYPESAFE_API_KEY` — *from Phase 1 review*
- [ ] Exercise `/link-other-account` live (never run live) — *from 5a*
- [ ] Review/rename/remove the `CS Dev Verification Agency`/`Client` (`aaf5e009-…`/`25f99947-…`) before real onboarding — *from HANDOVER §5 item 5*
- *owner list:* pilot runbook/checklist (§1.4; reuse `docs/OPS.md`).

**Not folded** (stay where they are): Phase 11/13b/15a/10 "Soon" polish, 8c costs-job items, MCP hardening remainder, Ask grounding, KB robustness remainder.
