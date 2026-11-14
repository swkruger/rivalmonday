# phase-18e — Wider sources 5: competitor social (ScrapeCreators) + Jev-only AI decisions

**Kind:** build   **Worktree:** ../CompetitorSpy-wt/phase-18e   **Base:** main @ d9ff7b87
**Spec:** [2026-11-13-phase-18e-social-jev-design](../superpowers/specs/2026-11-13-phase-18e-social-jev-design.md)   **Plan:** [2026-11-13-phase-18e-social-jev](../superpowers/plans/2026-11-13-phase-18e-social-jev.md)   **Probe:** [docs/research/2026-11-13-phase-18e-social-probe.md](../research/2026-11-13-phase-18e-social-probe.md)

## Status (overwrite)
SDD complete: Tasks 1-13 done, final review + fix wave + re-review clean (last fix ba179f3f: franchise guard also needs a matching " - City" tail). Ask cassette re-recorded (55ffe698). Suites green on the rebased branch: `test:affected` exit 0, web E2E --full 154 passed; typecheck clean. Nothing uncommitted; SDD workspace deleted.

## Next (overwrite)
1. Owner: `pnpm copy:review` sign-off for the new copy (social brief lines, `post_weekly` play, AI decisions card), then `/rm-merge phase-18e` on go-ahead (flip site compare row `social` + ledger `cap-social`; update the root CLAUDE.md decision line per spec B6; fold this file into STATE/BACKLOG/ARCHITECTURE).
2. After merge: migrate 0110, deploy the worker, then web; staging checks below.

## Interfaces this branch adds or changes
- **Migration 0110:** `social_account` (competitor, network facebook|instagram, handle, `external_id`, url, status confirmed|suggested|rejected, `confirmed_by`, `confirmed_by_user` text, `gated`, `last_pulled_at`; one confirmed per competitor+network), `social_post`, packs v10 (`social` flag, `social_gap` rule, type weights), `platform_setting` `ai_decision_mode`.
- **Collectors (`social/`):** `makeScClient` (`scSearchCompanies`, `scFacebookProfile`, `scFacebookPosts`, `scInstagramProfile`), `siteHost`/`confirmsDomain`, `discoverSocialAccounts`/`pickCandidate`, `pullSocial` (`FB_MAX_PAGES` 3, `SOCIAL_COLLECTOR_VERSION` `social/1`), `socialCaptureUrl`, `runSocialPull`/`runSocialDiscover`, `syncSocialSources`/`deferSocialSource`; source kind `social`.
- **Engine:** `diffSocialCapture` (changes `promo`, `audience_growth`, `content` cadence, all brief-only, `details.surface 'social'`), `socialPostsOfConfirmedAccounts`, `socialPostCounts30d`, `socialEvidenceByCompetitor`, self rule `social_gap`, scorecard `socialPosts30d`.
- **Tools:** `get_social_activity`, `list_social_accounts`, `confirm_social_account`, `find_social_accounts` (`SOCIAL_FIND_DAYS` 7; refuses without a payable tracking client and social pack), `get_ai_decision_mode`, `set_ai_decision_mode` (`REEVAL_WINDOW_MS` 7 d).
- **AI/DB:** `AiDecisionMode` `{mode: jev_only|cascade, reevalUntil}` + state `{reevalFrom, lastWindow}` (`readAiDecisionState`, `updateAiDecisionState` FOR UPDATE), `createDecisionModeSource(db,{ttlMs,now})` = `{read, reevalCallsToday, noteReevalCall}`, `Ai` deps `decisionMode`, `REEVAL_DAILY_CALL_CAP` 2000; always-cascade tasks `ask_guard_decisions`, `ad_image_decisions`.
- **Worker:** jobs `social-discover`, `social-pull` (retryLimit 0); `WorkerDeps.discoverSocial`/`pullSocial`.
- **Web:** competitor page social accounts card (confirm/reject/paste link), client scorecard column, brief lines, `/platform/costs` "AI decisions" card.

## Assumes from other branches
Nothing in flight.

## Decisions (owner-approved)
- 2026-11-13: owner skipped the questions ("yes continue"): every brief recommendation accepted — probe first, Facebook + Instagram, suggest-and-confirm handles, self tracked, pack flag, weekly, brief-only, no new page (scorecard + brief lines + tool).
- 2026-11-13: owner adds a second track to 18e: confidence in the Jev evals is now high, so add a setting to run review decisions on **Jev only** (no LLM step), with an option to **re-evaluate with all models** (today's Jev → LLM cascade / shadow comparison). Touches CLAUDE.md decision "Review decisions stay on Jev until pilot gold labels; verifier τ 0.85" and the cascade Jev → LLM → human.

- 2026-11-13 final-review rulings (controller): one account identity = `social_account.id` (observation key `<network>:<id>`, payload `accountId`, reader joins; capture url stays `socialCaptureUrl`). Posts count only for measured accounts (confirmed, not gated, ok capture in 8 days), else null; `social_gap` cites self's capture. Auto-confirm uses the **FB website only** (IG `external_url` confirmation not built; IG confirms via the same search row only when FB auto-confirmed), and only with token-equal names and a domain host no other competitor row shares (franchise rule). Agencies can reject confirmed accounts on the competitor page.

## New backlog (target -> item)
- `[ ] Later -> social: social credits not counted toward client USD spend guards (vendor_call cost_usd null, like Meta via ScrapeCreators); price units if pilots need it` - *18e final review M2*
- `[ ] Later -> social: a page shared across two competitor rows loses posts to the global (network, post_id) unique on social_post; the second row counts 0` - *18e final review I2(d)*
- `[ ] Later -> social: rollout credit burst (first discovery + pull for every tracked competitor in one week); stagger next_due_at on insert` - *18e final review M6*
- `[ ] Polish -> copy: tag/structured.ts brief summaries (social and older ones) are outside copy-review SOURCES` - *18e final review M4*
- `[ ] Later -> social: FB stop watermark is per competitor x network, not per account (a switched page's first pull may stop early)` - *18e final review M5*
- Polish → evals: pin the Ask turn deadline to the eval clock so a slow live record can't store a forced `toolChoice: 'none'` step (replay miss) — *18e Task 13*
- `[ ] Later -> social: IG ScrapeCreators 200 with success:false throws; record as a failed pull instead` - *18e Task 3 review*
- `[ ] Later -> social: discovery has no equality-first pass; an IG-rejected handle also skips the FB candidate` - *18e Task 4 review*
- `[ ] Later -> social: "gated" flag persists only on a successful profile call, so a failed pull pays the gated retry again` - *18e Task 5 review*
- `[ ] Later -> social: concurrent confirm of two accounts hits the unique index (23505); map to a conflict refusal` - *18e Task 9 review*
- `[ ] Later -> social: unbounded follower history scan in the trend reader; cap by window` - *18e Task 9 review*
- `[ ] Later -> AI mode: re-eval counter bumps before the ledger write and has no in-flight dedupe or backoff` - *18e Task 11 review*
- `[ ] Later -> AI mode: a later window start overwrites an expired never-stopped window (lastWindow lost)` - *18e Task 12 review*
- `[ ] Polish -> social: skip rendering a non-http(s) account href; validate the form clientId; empty-state copy when social is off for the vertical` - *18e Task 10 review*
- `[ ] Polish -> social: "weekly" claim in copy needs a claim-check once the site is live; demo handles contain "demo"` - *18e Task 10 review*
- `[ ] Polish -> manual pause shows the spend-guard copy for a social source` - *18e Task 9 review*
- `[ ] Later -> social: add TikTok / other networks and engagement only if pilots ask (out of 18e)` - *18e brief*

## Owner verification steps
1. **Copy review:** run `pnpm copy:review` and sign off the new 18e drafts (social card, scorecard column, brief lines, AI decisions card, help guides); never names the vendor.
2. **Deploy order:** migrate 0110, deploy worker, then web (CI `DEPLOY_ENABLED`). Confirm `SCRAPECREATORS_API_KEY` is set on the worker.
3. **Staging (live vendors):** pick one hospitality or social-pack client; run the first social pull (Check/weekly); expect discovery then pull, 3-5 credits per rival. Confirm a suggested account on the competitor page, pull again, see the scorecard count and a brief line.
4. **Credits:** run the OPS "Credits used" query (`docs/OPS.md` Social (18e)) and compare with the vendor balance on `/platform/costs`.
5. **AI decisions:** open the `/platform/costs` AI decisions card, confirm default Jev only, start "Re-evaluate with all models", check samples with reason `reeval` and `<task>:reeval` ledger rows after a day, stop the window, reset if needed.
