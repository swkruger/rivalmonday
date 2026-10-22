# State of `main`

> **Overwritten, never appended. Hard cap 8 KB.** Updated by `/rm-merge` (and `/rm-wrap-up` when run on `main`).
> In-flight work is NOT recorded here - each branch keeps `docs/work/<branch>.md`; `/rm-start` lists them.
> History lives in git and in `docs/archive/`.

**Updated:** 2026-10-21

## Where `main` is
- Phases 0-2, 3a-3d, 4a, 4b, 5a-5c-2, demo data / dev panel / snapshots, Phase 5 polish, Phase 6 (MCP, Ask "Friday", KB), **Phase 8**, **Phase 12** + polish, **Phase 9** + fixes (owner-verified), **Phase 10** (2026-10-16), **Phase 11** (2026-10-17), **phase-11-fixes** (2026-10-18), **Phase 13b** (2026-10-17; owner-closed 2026-10-19 with a polish: `osm_bright` map, see-through 60% cells, 1-2× zoom) + **Ask fixes** (2026-10-19: guard sees the previous reply so "yes" isn't refused; own-business evidence backs recommendations; agency name instead of Rival Monday without a displayName) **Phase 15a** (UX/IA: context switcher Platform/Agency/Client, grouped menus, `/agency/settings/*` + `/c/<id>/settings/*`, `PageHeader`, Briefs & reports; merged 2026-10-19) and **Phase 14** (14a vertical catalogue, 14b runbooks; merged 2026-10-19) and **Phase 15b-1** (help system; merged 2026-10-20) and **Phase 15b-2** (help content on every page, server-side per-audience help copy, "topic" wording; merged 2026-10-21) are on `main`. Owner verification pending for 10, 11, 11-fixes, 15a, 14, 15b-1, 15b-2. **Phase 13 is not finished: 13a (white-label) is unbuilt.**
- Migrations run through **`0080`** (next free `0081`; 15b-2 added none). `cs_dev` at 0080 + `kb:seed` run 2026-10-21 (15b-2 guides). `cs_demo` is seeded by `pnpm demo:reset` (it lagged the schema at 2026-10-18 - re-run before demoing).
- Tests on the local test cluster (`scripts/local-test-db.sh`, port 5444). At the 15b-2 merge (2026-10-21): full unit suite 6,447 tests, 15/16 packages first pass (59 min) - the one `@cs/web` failure, PinPageSwitch, passes alone 4/4 (load flake, BACKLOG); full E2E 121/121 (8.7 min).
- Switches: `KB_IMPORT_ENABLED`, `ASK_FAKE_AI`, `BILLING_FAKE_GATEWAY`, `SETUP_FAKE_LOOKUP` (E2E only). Billing off until `STRIPE_SECRET_KEY`; Turnstile faked until its keys; `STADIA_API_KEY` set in `.env` (dev); unset = rank grids without a map; existing maps refetch once (style change) on the next Sunday `rank-schedule` or a rank-settings save. Worker env `NEON_API_KEY`, `NEON_ORG_ID` not set yet.
- **In flight:** `phase-7` must **rebase onto main** and renumber its migrations to **0081+** (plus `llm_call.vertical_id`, catalogue/runbook tools and `runbook-tailor` in the isolation suite, and the new help tools `get_page_guide`/`list_help_guides`). Next: 15b-3 (topic rename), 15c (rebases on 15b-2). 13a (white-label hosts) not started. `phase-7-planning` parked.
- `main` pushed to `origin/main` 2026-10-21 (through the 15b-2 merge).
- Built: [ARCHITECTURE.md](ARCHITECTURE.md). Runbook: [OPS.md](OPS.md).

## Next up
**Owner - Phase 15b-1 + 15b-2 verification** (`kb:seed` done on `cs_dev` 2026-10-21; `pnpm demo:reset` picks up `docs/help`):
1. Sign off the four copy docs `docs/archive/phase-15b2-copy-signoff-{client,agency,platform-account,terminology}.md` incl. their "Decisions for the owner" (Business type relabel, neutral Platform access label, agency-only alert-cap line, quiet-hours hint, "First moves" vs "First steps").
2. Client owner on any `/c/<id>` page: "? Guide" opens the client version, `?` tips, no agency wording (routing, upsell, seats); agency admin sees the agency versions; tips name the client.
3. White-label agency without a display name: "your agency" + its assistant name, never "Rival Monday".
4. Help pages (`/c/<id>/help`, `/agency/help`, `/platform/help`): search, "Your account" group, glossary client terms only to clients; `/platform/themes` reads "Topic proposals".
5. "Ask {assistant} about this page" auto-sends (hidden in support sessions).

**Owner - Phase 14 verification** (after 0077-0079 on `cs_dev`): run `pnpm --filter @cs/worker runbook:backfill --dry-run`, then for real, **before the next brief run**. Then: (1) look up and draft a real distillery (quotes match the profile), create it, finish setup; a second distillery preselects it; approve it in `/platform/verticals`; merge a duplicate; `/platform/costs` shows the draft cost. (2) After the backfill, existing clients' next briefs are unchanged. (3) A Distillery client's runbook is tailored; quotes make sense. (4) Customise a play; the next brief uses it. (5) An agency edit shows "Update available" on the client. (6) A platform runbook edit reaches agencies as an update. Copy sign-off: [archive/phase-14-copy-signoff.md](archive/phase-14-copy-signoff.md).

**Owner - Phase 15a verification** (no migrations):
1. Operator: sidebar switcher Platform ↔ Agency ↔ client (search, pin, Recent, Ctrl/Cmd+K); Platform view has Rival Monday branding and lists only your agencies; Health hidden.
2. Agency admin / scoped account manager: Portfolio · Work · Growth · Agency settings; badges on Approvals / Alert review / Leads; AM sees only their clients.
3. Client view: Ask Friday first, Insights / Act groups, Briefs & reports (tabs, Older/Newer, Previous/Next, "Brief archive →"), Client settings tabs ("Business profile").
4. Client owner: no switcher, no Platform; avatar menu (name, role, Notification settings, Switch account, Sign out); bell count.
5. Old bookmarks `/agency/team`, `/agency/branding/logo`, `/agency/webhooks` land on `/agency/settings/*`.
6. White-label client sign-in via a client link shows agency branding; no "Rival Monday" in tab titles; evidence says "captured by our monitoring service".
7. Phone (390px): drawer has the switcher, long client list scrolls, drawer closes after navigation.
8. Copy/ruling sign-off: group labels, "Lead pool", "Billing & plans", "Ask reviews" (no badge), "Business profile", Briefs & reports empty states, Ask disclosure "…reviewed by our support team…" (no displayName), Overview h1 "Overview", Previous = older.

**Owner - phase-11-fixes re-test:** pilot-link refusal on `/platform/billing`; `/onboarding` profile intro + red error box; duplicate-listing lookup cards on `/agency/clients/new` and `/start`; empty-suggestions note; copy in [archive/phase-11-fixes-copy-signoff.md](archive/phase-11-fixes-copy-signoff.md).

**Owner - Phase 11 verification:** 11a lookup → suggestions → search (<= $3) → pick → starting point in 48 h; owner invite; 14:00 UTC reminder; `DATAFORSEO_LOGIN`/`_PASSWORD` on Vercel. 11b Postmark Cc; invite → accept → first brief; billing step on Stripe test. 11c real Turnstile; dental preview; accept → prospect → invite; `/start` branding. Clean up CS Dev Verification Agency/Client first. Copy: [archive/phase-11-copy-signoff.md](archive/phase-11-copy-signoff.md).

**Owner - Phase 10 verification:** `.env` `TURNSTILE_*`, `SUPPORT_REPLY_TO`, `POSTMARK_BROADCAST_STREAM`; incognito sign-up → wizard → checklist; pilot invite "Email it"; pause sign-ups; day-1 tip + unsubscribe; open-trial second client refused until Checkout; copy (R20 intro, four email templates).

**Owner housekeeping:** `NEON_API_KEY` + `NEON_ORG_ID` in the worker env at deploy; `set_seat_cap_exempt` for the owner's agency at prod deploy if > 3 active clients.

**Then:**
1. 13a1 → 13a2 (owner first: neutral domain, Vercel wildcard + `mcp.` host, Postmark `mail.<neutral>`, tokens).
2. `/rm-kickoff phase-15b3` (topic rename, [15b-2 spec](superpowers/specs/2026-10-20-phase-15b2-help-content-design.md) C7) and `/rm-kickoff phase-15c` (audit page fixes) - [spec](superpowers/specs/2026-10-18-phase-15-ux-ia-design.md) §4, [audit](research/2026-10-18-phase-15-ux-audit.md).
3. Phase 9/10/11/15 "Soon" backlog items. **Waiting on real data:** first real alerts from the 2026-10-20 weekly pull.

## Process (short)
`/rm-start` -> `/rm-kickoff` -> brainstorm -> spec -> lean plan -> owner approval -> subagent-driven development -> `/rm-wrap-up` -> `/rm-merge` (owner's go-ahead). Details: root `CLAUDE.md`.
