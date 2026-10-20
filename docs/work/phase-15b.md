# phase-15b — help system and per-page help

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-15b   **Base:** main @ b38e36ba
**Spec:** [2026-10-19-phase-15b-help-system-design.md](../superpowers/specs/2026-10-19-phase-15b-help-system-design.md). **Plan/spec:** inputs [15 spec](../superpowers/specs/2026-10-18-phase-15-ux-ia-design.md) §1 D6–D7, §2.7, §4 · [audit](../research/2026-10-18-phase-15-ux-audit.md) · [inventory](../research/2026-10-18-phase-15-page-inventory.md) · [6c KB spec](../superpowers/specs/2026-10-12-phase-6c-knowledge-design.md). 15b spec addendum + plan: not written.

## Status (overwrite)
2026-10-20: **15b-1 built and reviewed — ready to merge after owner copy sign-off.** Tasks 0–11 done (SDD, per-task reviews + final whole-branch review on the most capable model, one fix wave). `pnpm test:affected --base main` 15/15 packages (6,119 tests) green; `e2e:affected --base main --full` 117/117 (E2E_PORT=3101). Test DB `cs_phase_15b_test`.

## Next (overwrite)
1. Owner: sign off [archive/phase-15b1-copy-signoff.md](../archive/phase-15b1-copy-signoff.md) (10 questions at the end) — B3 merge gate; copy edits go in before merge.
2. `/rm-merge phase-15b` with the owner's go-ahead (phase-7 then renumbers its migrations to 0081+).
3. 15b-2 plan after merge (content wave; first decide where `page:account.*` guides list, enforce the coverage test from spec §8).

## Interfaces this branch adds or changes
- Migration **0080** `kb_help_key`: `kb_article.help_key` (nullable), `audience` (`all|agency|client|operator`, default `all`), partial unique index (help_key, audience, level, agency). phase-7 must start at **0081**.
- `@cs/core`: `help/*` — `HelpAudience`, `ViewerAudience`, `visibleAudiences`, `viewerAudience`, `GlossaryTerm`, `GLOSSARY` (26 terms), `glossaryFor`, `filterGlossary`; `renderKbText` `{{client}}` (fallback "your business" for client audience, "the client" otherwise); `NEUTRAL_AGENCY_NAME`.
- `@cs/tools`: web-only `get_page_guide`, `list_help_guides` (context-prefixed `page:<context>.%`); audience filter on `search_knowledge` (+ optional `context`, honoured on web only; `platform` = operator-only), `get_kb_article`, `fetch knowledge:`, workspace `search`; `kb/audience.ts` (`roleAudience`, `helpAudienceFor`); `kbNamesFor(..., { clientFacing })`; `seedKnowledge(db, dir, userId, { glossary? })` also seeds `docs/help/pages/*.md` + glossary rows (`SaveExtra` gains helpKey/audience/clientVisible).
- Web: `components/help/*` (`HelpProvider`/`useHelp`, `HelpTip`, `FieldHint`, `EmptyState`, `PageGuide`, `help-index`, `ClientHelpName`), `help/copy/*` (`PAGE_COPY`, `renderCopy`, `OPEN_PAGE_GUIDE_EVENT`), `server/help.ts` (`helpGuides`, `helpClientName`, `helpAgencyName`), `loadPageGuide` action; `PageHeader` `guide?`; new `c/[clientId]/layout.tsx` (client name for help copy); Help pages `/platform/help`, `/agency/help`, `/c/<id>/help`; avatar menu Help link (`AvatarMenu` requires `switcher`); `NavRoleFlags.clientAi` (support viewers see the AI connection tab); switcher pin button outside `role=option`.
- E2E: `@help` tag, `e2e/help.spec.ts`; E2E seed runs `seedKnowledge` on `docs/help`; demo coverage seeds `docs/help`.

## Assumes from other branches
- None open (phase-14b merged; rebased on main b38e36ba).

## Decisions (owner-approved)
B1–B10 in the spec §1: split 15b-1 system / 15b-2 content; audience all/agency/client/operator; Claude drafts, owner signs off per batch; Help pages per context; guides citable by Ask/MCP (audience-filtered); 15b-1 after 14b merges; guides = repo Markdown via kb:seed; short copy = TS constants, glossary = typed list in @cs/core; placeholders + neutral fallback; tour/override editor/analytics/new hints → backlog.


**Execution rulings (Claude, 15b-1 SDD — reversible):** R1 `HelpAudience` type created in Task 1 (db→core dependency). R2 tool shapes per plan (flat `list_help_guides`, markdown sections, `context` input). R3 glossary seed key `glossary:<id>#<audience>`. R4 "Ask about this page" uses `?q=` (auto-sends). R5 migration 0080 claimed. R6 no "Open full article" in platform context. R7 `HelpProvider` mounted in app-shell. R8 nested client-name provider via new `c/[clientId]/layout.tsx`. R9 platform Help links open `/platform/knowledge/<id>` (seed rows read-only there). R10 final fix wave included cheap hardening (context-prefixed guide list, shared agency-name helper, "the client" fallback, seed key regex, EmptyState audience guard).

## New backlog (target → item)
15b-2 → decide where `page:account.*` guides list; `EmptyState` everywhere with audience; strip Markdown from Help search excerpts; Help search button focus ring check. Soon → `c/[clientId]/layout.tsx` adds an audited `get_client_profile` read per agency request (resolve the name from the switcher list instead); seed imports `PAGE_HELP_KEY` from `tools/help` (move to a shared module); `docs/help/asking-the-assistant.md` "Cancelled." spelling.
Unscheduled → product tour; agency guide override editor; console editor for platform guides; help-usage analytics; first-visit "new" hints (B10).

## Owner verification steps
After merge: `pnpm db:migrate` on `cs_dev` (0080), then `pnpm kb:seed` (guides + glossary; the hourly `kb-embed` sweep fills vectors). `pnpm demo:reset` picks up `docs/help`.
1. Client owner on Overview / Changes / Reviews: "? Guide" opens the client version; no agency wording (routing, upsell, seats); `?` tips open on click/tap/Enter and hover; "More in the guide →" jumps to the section.
2. Agency admin on the same pages: agency version of the Overview guide; tips mention the client by name.
3. White-label agency without a display name: guides/tips/Help pages say "your agency" and the agency's assistant name, never "Rival Monday".
4. `/c/<id>/help` and `/agency/help`: search finds guides; glossary A–Z shows client terms only for client owners ("Upsell tag" only for agency); "Contact your agency" uses the agency sender email when set.
5. "Ask {assistant} about this page" sends "Explain the Overview page" (auto-sends, ruling R4). Hidden in support sessions.
6. `/platform/help` as operator; Avatar menu → Help opens the current context's page.
7. Support session: AI connection settings tab visible read-only; switcher pin button still works by mouse and Tab.
8. Copy sign-off doc answered.

## Brief
Superseded by the [15b spec](../superpowers/specs/2026-10-19-phase-15b-help-system-design.md) and [15b-1 plan](../superpowers/plans/2026-10-19-phase-15b1-help-system.md); kickoff brief is in git history (5fa1d0e4). 15b-2 inputs: audit §2–§3 items tagged 15b ([audit](../research/2026-10-18-phase-15-ux-audit.md)), 14b pages (Business types, platform/agency/client Runbook, new-business-type panel).
