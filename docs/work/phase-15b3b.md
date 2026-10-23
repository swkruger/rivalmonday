# phase-15b3b — topic rename, surfaces (MCP/Ask tools, routes, help key, web names)

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15b3b   **Base:** main @ bf4ce990
**Plan/spec:** [15b-3 spec](../superpowers/specs/2026-10-21-phase-15b3-topic-rename-design.md) §4 (D1–D6, §3); plan *to be written* (lean, short).

## Status (overwrite)
Kicked off 2026-10-23; brief below. No code.

## Next (overwrite)
Owner answers Brief §6 → spec addendum only if needed (spec §4 already decides most) → lean plan.

## Interfaces this branch adds or changes
Planned (no aliases): `get_topic_benchmark` (was `get_theme_benchmark`), `search_reviews.topicId`, `/platform/topics`, `?topic=`, `page:platform.topics`. No migration expected.

## Assumes from other branches
- **phase-15c2** (planning, docs only): its theme-file tasks (`/platform/themes`, `theme-heatmap.tsx`, Reviews `?theme=`) go last (15c C7); second to merge rebases.
- **phase-7-planning** (docs only): 7c isolation suite / MCP `tools/list` / Ask evals must use the new tool names if they land after us.

## Decisions (owner-approved)
None new yet; 15b-3 D1–D6 bind.

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope
Roadmap row 15 ("15b-3b surfaces *to be written*"). Spec 2026-10-21 15b-3 **D1** (3b = MCP/Ask names+fields, routes, query params, help key + guide, web file/component names, tool descriptions, errors), **D3** (no aliases/redirects; supersedes 15b-2 C7), **§3** exceptions, **§4** (the 3b list), core §6.4/§6.5/§8.2/§8.5. Build:
- **MCP/Ask:** rename `get_theme_benchmark` → `get_topic_benchmark`, output `themes`→`topics`, `themeId`→`topicId`; `search_reviews` `themeId`→`topicId`, output `topics`, "Unknown topic"; delete `toLegacyThemeFields` (15b-3a P3); descriptions say "topic"; `ask/labels.ts`; `mcp/prompts.ts` if it names the tool.
- **Web:** `(platform)/platform/themes/` → `platform/topics/` (`ThemeQueue`, `decideThemeAction`, `ThemeProposalsPage`), nav href; Reviews `?theme=` → `?topic=` (`THEME` regex, select `name`); `ThemeHeatmap` → `TopicHeatmap` (file `topic-heatmap.tsx`); competitor `sections.tsx`, `review-item.tsx` field reads.
- **Help:** key `page:platform.topics`, copy key + tip ids, guide file rename; `kb:seed`'s stale sweep (`tools/src/kb/seed.ts:180`) already deletes the old row.
- **Tests:** MCP `tools/list` new names only, old names unknown; E2E `/platform/topics` + Reviews `?topic=`; `/platform/themes` 404; tighten `terminology.test.ts` allow-list (drop `/platform/themes`, `?theme=`, `page:platform.themes`).
- **Done:** review-sense `theme` grep finds only §3 exceptions, UI theming, history.

**15b-3a did** (migration 0084, ARCHITECTURE "15b-3a"): DB + jsonb backfill, packs, engine `reviews/topics.ts`, `topic_*`/`fix_topic`/`{{topic}}`; tools `list_topic_proposals`, `decide_topic_proposal`, nav counts `topics`; schemas `TopicProposalView`, `TopicBenchmarkView` (inner fields still `themes`/`themeId`); `findTopicLeftovers`. **Already done in 3a** although the backlog line lists them: `nav-counts` description ("pending topic proposals") and the `vertical-draft` prompt (`vertical-draft.test.ts` asserts no "theme").

### 2. Already built — remaining `theme` identifiers (counts = lines)
- **Tools:** `packages/tools/src/tools/reputation.ts` (15: tool name, descriptions, `themeId`, `toLegacyThemeFields`, "Unknown theme", `getThemeBenchmark` export) + `reputation.test.ts` (33); `schemas.ts:344-369` (`TopicBenchmarkView.themes`, `businesses[].themes[].themeId`, review view `themes`); `workspace-fixtures.ts:283,296` `analysis.themes`; `paged-lists.test.ts` (6), `channels.test.ts` (4).
- **MCP/Ask (externally visible):** tool names in `packages/mcp/src/{server,integration}.test.ts`, `packages/ask/src/labels.ts:17`, `packages/mcp/src/prompts.ts:21`; `packages/demo/src/coverage.ts:231,270,366,393` + `demo/README.md` (3).
- **Web:** `(platform)/platform/themes/*` (17); `c/[clientId]/reviews/page.tsx` (12); `charts/theme-heatmap.tsx` (9) + test (13); `competitors/[competitorId]/{sections,page}.tsx`, `reviews/review-item.tsx` (+tests); `shell/nav-items.ts:123` (+test); `e2e/workflow.spec.ts:112`; `scripts/e2e-affected-rules.ts:170,195,217`.
- **Help:** `help/copy/platform.ts:8,237` (tips `platform.themes.{source,decide,decided,queue}`), `copy/client.ts:87` (comment), `docs/help/pages/platform.themes.operator.md`, `help-platform.test.tsx` (10), `kb/help-content.test.ts:42,45,378`, `terminology.test.ts`.
- **Docs:** `ARCHITECTURE.md` (update at merge); `docs/research/*phase-15*` (history, leave).
- **Leave:** C7 keys (`themeKey`, `THEME_BATCH_*`, `theme_proposal` schema name, `review_themes`, `model-ops/report.ts`); UI theming (`themeVars`, `themeForViewer`, `server/theme.ts`, `shell-theme.tsx`, `@cs/ui`).
- **Externally visible:** MCP tool names/fields (no aliases, D3), `/platform/themes` (404, D3), `kb_article` help_key row (seed sweep). Stored Ask history keeps old names.

### 3. Binding decisions
- 15b-3 D1 (two sub-phases, 3b = surfaces), D3 (**no aliases, no redirects**), D4 (no dual-read), D6 + §3 (C7 exceptions keep `theme`, with `// kept:` comments).
- Root CLAUDE.md: users see "topic"; reads = tools, writes via `runTool`; refusals → 404; every `PageHeader` page has help key + guides; help copy `server-only`, audience-filtered; owner signs off copy; `hasChannel` gates Ask/MCP. Lean plan; next free migration 0085 (none expected).

### 4. Backlog to fold in (verbatim)
- [ ] **15b-3b** topic rename, surfaces (3a data & engine merged): routes `/platform/themes` → `/platform/topics` + `?theme=` → `?topic=`, help key `page:platform.themes` (+ guide file, `kb:seed`), MCP/Ask tool names (`get_theme_benchmark`, `search_reviews` `themeId`), delete `toLegacyThemeFields`; `workspace-fixtures.ts` `seedReview` `analysis.themes` → `topics` (test-only, with `reputation.test.ts`); tool descriptions + 'Unknown theme' (`reputation.ts`), `nav-counts` description, `vertical-draft` prompt — *phase-15b3*
- [ ] `docs/OPS.md:9` says "Latest migration `0037`" (stale) — *phase-15b3*
- Related (Q4): 14a "batch theme discovery untagged", "generic theme `technician_professionalism`"; 3c "theme approved mid-window not asked of older reviews". (4a `playbooks.ts` `themeName` fallback: gone since 3a, close it.)

### 5. In-flight workstreams
- **phase-15c2** (1 docs commit, its work file). 15c spec C7: our renamed pages are its **last** tasks; second merger rebases. Overlap: `platform/themes/*`, `theme-heatmap.tsx`, Reviews `page.tsx`, `help/copy/platform.ts`, `nav-items.ts`; its new tools touch `tools/all.ts`, `channels.test.ts`, `mcp/server.test.ts`, `demo/coverage.ts`; may take 0085.
- **phase-7-planning** (docs: 7b/7c specs). No code overlap; 7c isolation/`tools/list`/Ask evals must use the new names.

### 6. Open questions for the owner
1. **Split into sub-phases?** (a) one branch, one plan (~8–10 tasks: tools+MCP/Ask, web route, Reviews param + heatmap, help key/guide, tests/docs sweep); (b) 3b-1 MCP/Ask tools, 3b-2 web/help; (c) fold 3b into 15c-2. **Rec: (a)** — small, mechanical, one review.
2. **Ordering vs 15c-2.** (a) run 15b-3b first and merge fast (days), 15c-2 builds on renamed files; (b) parallel, second merger rebases (15c C7); (c) 15b-3b waits until 15c-2 merges. **Rec: (a)** — cheapest rebase; 15c-2 is still in brainstorming.
3. **Rename the `TopicBenchmarkView` inner fields in the web too (heatmap/sections/review-item), or keep a web-side adapter?** (a) rename end to end (`topics`/`topicId`) in one task; (b) adapter in web. **Rec: (a)** — D3/D4 say no dual names.
4. **Fold related theme-named backlog** (14a batch discovery untagged, `technician_professionalism`, 3c mid-window)? (a) none, just close the stale 4a `themeName` item; (b) fold all; (c) only `technician_professionalism`. **Rec: (a)** — behaviour, not naming.
5. **Help tip ids `platform.themes.*` and copy sign-off.** (a) rename ids with the key, copy text unchanged, no sign-off doc; (b) also review guide wording with a sign-off doc. **Rec: (a)** — text already says "topic" (15b-2).
