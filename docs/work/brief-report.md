# brief-report — weekly brief becomes a full report; every change graded Major / Notable / Minor

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/brief-report   **Base:** main @ bd58dd62
**Spec:** `docs/superpowers/specs/2026-11-07-brief-report-design.md` (owner-approved 2026-11-07) · **Plan:** `docs/superpowers/plans/2026-11-07-brief-report.md` (Tasks 0–15, lean)

## Status (overwrite)
All tasks 0–14 implemented and reviewed (SDD); final whole-branch review clean after one fix wave. Gates green 2026-11-09: test:affected (only the launch-gate parity snapshot needed `changes: null`, updated), e2e:affected 154/154, profile-gate max 7 DB stages (brief page 5, approvals 6), eval:replay no misses ($0), design-lint 0, LF/UTF-8 clean.

## Next (overwrite)
Owner verification (steps below), `pnpm copy:review` sign-off, then `/rm-merge` with the owner's go-ahead (full unit + E2E there).

## Interfaces this branch adds or changes
- Migration `0103_brief_report`: `ALTER TABLE brief ADD COLUMN report jsonb` only. No `(client_id, scored_at)` index (EXPLAIN on the empty test DB used `event_score_client_route_idx`; judged usable). Revisit only if the `profile-gate.sh` brief-page run is hot.
- `@cs/core` `brief-report.ts`: `Grade`, `GRADE_LABEL`, `ReportTopic`, `TOPIC_LABEL`, `gradeFor`, `topicOf`, `ChangeLine`, `GradedChanges`, `GradedChangesView`, `GradeTotals`, `BriefReport` (zod), `REPORT_CAPS`, `capTopic`, `totalsOf`; `ChartSeries` (single zod definition; web `LineChart` imports it); `day-range.ts` `formatDayRange`; `charts.ts` (`foldSeries`, `chartRole`, `niceMax`, `yTicks`, `linePath`); `PDF_LAYOUT_VERSION` = 6; glossary `major-change`, `notable-change`, `minor-change`.
- `@cs/engine`:
  - `briefs/graded.ts`: `groupChanges`, `gradedChanges`, `liveChangesFrom`, `loadLiveChanges` (replaces the planned `liveChanges`).
  - `briefs/report.ts`: `buildBriefReport`, `briefReportProps`, `briefHighlights`; rank map via `loadMapImage(store, clientId, report)`, key `rank-map/<clientId>/<hex>.png`.
  - `briefs/attachment.ts`: `briefAttachment`, `attachmentName`, `MAX_ATTACHMENT_BYTES`; `ensureBriefPdf`; `majorSummary`; `finalBriefSummary(b, items, liveMajorEvents)`; `createEmailSender({ attachment? })`.
  - `getBrief` returns `activeItemEventIds` / `droppedItemEventIds` (internal only; never in tool output).
  - `workspace/{scope,pressure,ads,kpi}.ts` moved from `@cs/tools` (tools keep re-export shims). `scope.ts` moves only the pure helpers (`eventJoin`, `clientEvents`, `liveEventCount`). `kpi.ts` also exports `kpiEventReads`, `kpiGlobalReads`, `workspaceKpis` (shared with `get_workspace_overview`); `weekIndex` / `isPriceCut` extracted from `tools/overview.ts`.
  - Copy review scans engine `briefs/summary.ts` too.
- `brandInk` / `mixHex` live in `@cs/email/branding` (`@cs/ui` re-exports them).
- `@cs/email`: `GROUP_PHRASE` / `groupPhrase` (with explicit entries for the 18a types), `PrintLineChart` (`yDomain`, `yStep`), `renderBriefReportDocument`, `BriefReportDocumentProps`, `BriefEmailProps.{highlights, attachPdf, attached}`, `OutgoingEmail.attachments` (Postmark / file / memory transports); previews `brief.highlights`, `brief.quiet_highlights`, `brief.highlights_not_attached`, `document.brief_report*`.
- `@cs/tools`: `BriefDetail.changes` / `BriefReview.changes` (`GradedChangesView`, web channel only, O6). `get_brief` shows `scorecard` only on quiet briefs, on all channels (standard briefs hide it).
- Worker: `deliver-once` CLI attaches the PDF (`apps/worker/src/cli/deliver-once.ts`).
- Web: `GradedChanges` view on the brief page (takes a prebuilt `changesHref`); Changes page `from` / `to` params; help tip `client.briefs.detail.grades`.

## Assumes from other branches
- `brief-signal` (fix) merged before `/rm-merge`: whole-business relevance + re-score (grades are meaningless without it), migration 0099, `EVIDENCE_CHANNEL_LABEL`. Re-check its final `score.ts` / `gather.ts` at merge.

## Decisions (owner-approved 2026-11-07)
- **O6** `get_brief` graded `changes` on the web channel only for now (MCP/Ask unchanged, no eval re-record); revisit later.
- **O1** Brief PDF = full weekly report (layout "C"): agency-branded cover (never Rival Monday), summary page (headline stats, top move, next steps), one page per topic (Reviews & rating, Ads, Map rankings, Moves, Recommendations, recent alerts if they fit), each with its chart(s) and that topic's changes. **Ask Friday never included.**
- **O2** Graded changes everywhere (email, in-app brief, PDF): every competitor change of the period, graded by `event_score.score` vs the client's brief threshold T (default 40): **Major** ≥ T, **Notable** T/2 ≤ s < T, **Minor** < T/2. Notable/Minor are one line each, deterministic from stored summaries + evidence dates (no model text; verifier never drops them). Retracted + cosmetic hidden. Repeats grouped; cap per topic with "+N more" → app Changes page; Minor collapsed by default. "Quiet week" = nothing Major.
- **O3** Own branch; builds after `brief-signal` merges.
- **O4** Email = short (summary + highlights) pointing to the full report, which is **attached** to the weekly brief email (supersedes "linked, not attached"; PDF link kept as fallback). Starting-point email unchanged.
- **O5** Agencies cannot hide single Notable/Minor lines; read-only, retraction is the only recourse.
- Website, prices & services section accepted.
- Controller calls: **C1** quiet only with no written item and no Major line; scorecard on every weekly brief. **C2** AM-dropped/retracted events leave lines and totals at delivery/read. **C3** "See all changes this week" = Changes page with the period's dates (page params only, no `search_events` change, no new link target); email highlights + attachment fallback (render fails or > 9 MB ⇒ link only, logged).

## New backlog (target → item)
- (later) → agency control to hide a single Notable/Minor line, if pilots ask (O5).
- (later) → graded changes on MCP/Ask `get_brief` (plan P5).
- (later) → `search_events` date bounds if the Changes week view (page-side filter) misleads (plan P6). "See all changes this week" filters by occurred day while graded lines are windowed by `scored_at` (events up to 30 days older can be missing from the linked page); client tz vs viewer tz day boundaries can also differ.
- (later) → darker print grey for context series if pilots find it faint (`#A3B1C2` is 2.18:1 on white; try ~`#8796A8`). Kept as the design-system role colour for now; the text legend carries the series.

## Owner verification steps
1. `pnpm db:migrate` on cs_dev; `SELECT count(*) FROM brief WHERE report IS NOT NULL;` grows after the next Thursday run.
2. `pnpm copy:review`: sign the tip, glossary, highlights, report and banner strings (previews `brief.highlights`, `brief.quiet_highlights`, `brief.highlights_not_attached`, `document.brief_report*`).
3. `pnpm --filter @cs/worker deliver-once --brief <id> pdf` on cs_dev; open the PDF on a phone and print it. Cover shows the agency only; metadata (File → Properties) names the agency.
4. Staging: one live week after brief-signal's re-score; open the email on a phone (attachment present, one-line rows), the app brief page (Minor folded), and "See all changes this week".
5. Old PDFs re-render once at v6 when opened.
6. `EXPLAIN ANALYZE` the graded read (`event_score` any-route by `client_id` + `scored_at` window) on cs_dev; add a `(client_id, scored_at)` index if it seq-scans or sorts.
7. Sign the new copy: `pnpm copy:review` in this worktree (glossary, labels, guides, help, emails, documents, app-client). This includes the new PDF strings (chart titles, table caption/headers, "In progress", "· {Status} since").
