# launch-gate results (2026-11-04)

From the launch-gate work file at merge. Recipe: `apps/web/CLAUDE.md` § Page profiler; checklist: `docs/DEPLOY.md`.

### Gate (local cluster 5444, E2E seed)
- **Baseline** (Task 1, 2026-11-03): 58 of 68 pages over 8, max 23 (`/platform`, `/platform/reviews`), median 14; 3 param routes unprofiled. (app) shell ~12 stages per page, (platform) 18-23.
- **Final** (Task 6c, `1371acaf`): exit 0, 71/71 profiled, max **7**, median 4.
- **What moved it:** Tasks 2-3 web-read audit inserts deferred with `after()` (D2), billing row + hold state in one stage; Task 4 `startShellReads` (shell-only pages ~12 → 4); Task 5 platform layout in one stage, `loadCostState` 3 queries instead of 1 + 2 × 6 (platform 18-23 → 1-6); Task 6a `withTenant` pipelining, billing snapshot beside the plan read, tool reads overlapped (`allInOrder`, parity snapshots recorded on the old code); 6b rank/alert/runbook tools, branding on the membership, page reads started with their inputs; 6c evidence/compare tools, one-statement `competitorLinked`, seeded param rows.
- **Reading the numbers:** removing the shell waterfall made some page chains *look* longer (overlapping spans had hidden them); 404/307 rows are ±1-2 noisy (the previous visit's tail spans). `dbStages` is a lower bound on depth: it counts gaps in the union of overlapping spans, and the page and its layouts run twin access chains concurrently, so wall time on Neon is the real check.

### Latency (Neon dev `cs_dev`, Task 7, 2026-11-04)
`bash apps/web/scripts/profile-gate.sh --db neon-dev --skip-build -- --cookie FILE` with `PROFILE_SEED_ADMIN_EMAIL` = the admin of `CS Dev Verification Agency` (client `CS Dev Verification Client`, every feature on). Local `next start` with the E2E server env + cs_dev URLs; signed in once by magic link through the file outbox (`POSTMARK_SERVER_TOKEN` blank). Exit 1: `/c/[clientId]/recommendations` 10 dbStages (data-dependent, backlog) and 5 param routes with no cs_dev row/link (`alerts/[alertId]`, `reports/[reportId]`, `agency/prospects/[clientId]`, `platform/agencies/[id]`, `platform/knowledge/[id]`). `/platform/*` 404s (that admin is not in the E2E `PLATFORM_ADMIN_EMAILS`), so it is out of the budget.
- **wallMs (median of 3), 45 agency/workspace 200 pages:** p50 1158, **p75 1476**, mean 1288, **max 3188**. Agency + account pages (22): p75 918, max 1906 (`/agency`). Workspace `/c/` pages (23): p75 1679, max 3188.
- **Per stage:** mean wall ≈ **198 ms per (db + auth) stage**; app query median 97 ms (p90 200), auth query median 43 ms. This box → Neon is about twice the ~50 ms the 7a numbers assumed.
- **Pool fan-out shows:** median query time barely moves (93 → 109 ms), but mean wall climbs with queries per page: < 30 q 753 ms, 30-50 q 1413 ms, 50-80 q 2007 ms, ≥ 80 q 3131 ms. One request holds up to 5 service connections (pool max 5): ~110 queries × ~130 ms / 5 ≈ 2.9 s. Rankings (67 q) 2348 ms; settings pages 0.8-1.6 s (no spike).
- **D7:** p75 passes (1476 ≤ 1500); "every page ≤ 3 s" fails on 2 pages → New backlog.

<details><summary>Per-route table (71 routes): dbStages baseline → final (local), local ms, Neon dev dbStages and ms; sorted by Neon ms</summary>

| route | db base → local | local ms | Neon db | Neon ms |
|---|---|---|---|---|
| /c/[clientId]/competitors/[competitorId] | 20 → 4 | 153 | 7 | **3188** |
| /c/[clientId] | 20 → 5 | 148 | 5 | **3073** |
| /c/[clientId]/recommendations | 13 → 4 | 67 | 10 | 2785 |
| /c/[clientId]/rankings | 10 → 6 | 109 | 7 | 2348 |
| /c/[clientId]/changes | 22 → 6 | 95 | 7 | 1963 |
| /agency | 8 → 6 | 121 | 3 | 1906 |
| /c/[clientId]/reviews | 13 → 4 | 97 | 4 | 1710 |
| /c/[clientId]/moves | 7 → 4 | 86 | 5 | 1647 |
| /c/[clientId]/pitch-snapshot (404) | 18 → 6 | 65 | 7 | 1622 (404) |
| /c/[clientId]/settings/ai | 8 → 5 | 82 | 6 | 1608 |
| /c/[clientId]/ads | 8 → 3 | 91 | 4 | 1554 |
| /c/[clientId]/briefs/[briefId] | 8 → 5 | 71 | 5 | 1484 |
| /c/[clientId]/competitors | 10 → 3 | 79 | 4 | 1476 |
| /c/[clientId]/ask/[threadId] | — → 6 | 85 | 5 | 1468 |
| /agency/approvals | 11 → 4 | 60 | 8 | 1386 |
| /c/[clientId]/setup | 17 → 4 | 59 | 5 | 1385 |
| /c/[clientId]/pricing | 13 → 6 | 77 | 7 | 1382 |
| /c/[clientId]/ask | 11 → 4 | 70 | 5 | 1355 |
| /c/[clientId]/briefs | 13 → 3 | 76 | 4 | 1268 |
| /c/[clientId]/settings/billing (404) | 19 → 7 | 61 | 8 | 1254 (404) |
| /c/[clientId]/evidence/[evidenceId] | — → 6 | 96 | 4 | 1229 |
| /c/[clientId]/settings/profile | 13 → 3 | 67 | 4 | 1190 |
| /c/[clientId]/settings/alerts | 11 → 3 | 63 | 4 | 1173 |
| /c/[clientId]/settings/runbook | 9 → 5 | 81 | 4 | 1173 |
| /agency/settings/billing | 15 → 3 | 48 | 7 | 1158 |
| /agency/settings/usage | 11 → 5 | 57 | 4 | 1114 |
| /c/[clientId]/settings/delivery | 12 → 3 | 93 | 4 | 1098 |
| /c/[clientId]/settings/usage | 12 → 3 | 60 | 4 | 1087 |
| /c/[clientId]/help | 13 → 3 | 57 | 4 | 1082 |
| /agency/approvals/[briefId] | 10 → 6 | 60 | 5 | 1063 |
| /agency/leads | 16 → 3 | 49 | 3 | 923 |
| /agency/settings/intake/preview | 14 → 3 | 52 | 4 | 901 |
| /settings/profile | 15 → 4 | 80 | 4 | 879 |
| /agency/settings/intake | 13 → 5 | 58 | 3 | 856 |
| /agency/settings/runbook | 14 → 4 | 62 | 4 | 853 |
| /agency/settings/slack-teams | 16 → 5 | 61 | 3 | 847 |
| /agency/settings/team | 15 → 4 | 62 | 4 | 803 |
| /agency/settings/branding | 16 → 4 | 47 | 3 | 802 |
| /agency/alerts | 15 → 3 | 54 | 2 | 791 |
| /agency/settings/ai | 15 → 4 | 45 | 3 | 790 |
| /kb/[id] | 16 → 4 | 49 | 3 | 787 |
| /inbox | 16 → 4 | 48 | 3 | 777 |
| /agency/settings/platform-access | 15 → 4 | 57 | 3 | 767 |
| /agency/help | 16 → 4 | 43 | 4 | 752 |
| /agency/prospects | 14 → 3 | 52 | 2 | 741 |
| /platform/knowledge/new | 22 → 3 | 85 | 2 | 720 (404) |
| /platform/ask/[threadId] | 18 → 1 | 71 | 2 | 707 (404) |
| /platform/knowledge | 18 → 1 | 63 | 1 | 706 (404) |
| /platform/waitlist | 22 → 2 | 62 | 2 | 706 (404) |
| /platform/verticals | 21 → 2 | 64 | 2 | 699 (404) |
| /platform/reviews | 23 → 3 | 68 | 1 | 698 (404) |
| /platform/costs | 14 → 3 | 76 | 1 | 691 (404) |
| /platform/billing | 16 → 4 | 64 | 2 | 684 (404) |
| /agency/clients/new | 7 → 3 | 41 | 3 | 678 |
| /platform/health | 18 → 3 | 101 | 1 | 678 (404) |
| /platform/topics | 22 → 3 | 53 | 2 | 675 (404) |
| /platform/ask | 18 → 1 | 60 | 1 | 673 (404) |
| /platform/runbook | 22 → 3 | 64 | 2 | 667 (404) |
| /platform/help | 22 → 2 | 62 | 1 | 663 (404) |
| /platform/agencies | 22 → 3 | 69 | 2 | 662 (404) |
| /agency/prospects/new | 7 → 3 | 32 | 3 | 661 |
| /c/[clientId]/setup/competitors (307) | 6 → 3 | 39 | 4 | 659 (307) |
| /platform/leads | 21 → 1 | 68 | 1 | 654 (404) |
| /platform | 23 → 3 | 75 | 2 | 646 (404) |
| /paused (307) | 10 → 6 | 31 | 4 | 570 (307) |
| /onboarding (307) | 5 → 3 | 31 | 3 | 397 (307) |
| /agency/prospects/[clientId] | 14 → 3 | 60 | — | — |
| /c/[clientId]/alerts/[alertId] | 8 → 4 | 69 | — | — |
| /c/[clientId]/reports/[reportId] | — → 4 | 79 | — | — |
| /platform/agencies/[id] | 10 → 3 | 113 | — | — |
| /platform/knowledge/[id] | 22 → 2 | 62 | — | — |
</details>


### Latency (staging, Vercel iad1 + Neon pooled, 2026-11-04 owner crawl)
`profile:pages --base https://staging.rivalmonday.app --cookie FILE --strict-routes` (wall time only): agency/workspace 200 pages (43) p50 **509 ms**, **p75 648 ms**, **max 1259 ms** (`/agency/settings/billing`); `/c/[clientId]` 1031, `/c/[clientId]/competitors/[competitorId]` 1020; platform max 775. 404s all by design (`settings/billing`, `pitch-snapshot`, both `settings/ai`: staging plan has no MCP). Unprofiled (no staging rows): `agency/prospects/[clientId]`, `alerts/[alertId]`, `reports/[reportId]`. D7 passes.
