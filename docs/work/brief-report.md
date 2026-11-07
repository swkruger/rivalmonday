# brief-report — weekly brief becomes a full report; every change graded Major / Notable / Minor

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/brief-report   **Base:** main @ 16d20199
**Spec:** `docs/superpowers/specs/2026-11-07-brief-report-design.md` (owner-approved 2026-11-07) · **Plan:** `docs/superpowers/plans/2026-11-07-brief-report.md` (Tasks 0–15, lean)

## Status (overwrite)
Plan drafted; awaiting owner approval; execution after brief-signal merges.

## Next (overwrite)
Owner approves the plan (plan calls P1–P8 in its Decisions). After brief-signal merges: `superpowers:subagent-driven-development` from Task 0 (rebase, re-check, next free migration number).

## Interfaces this branch adds or changes
- Migration `<n>_brief_report` (next free number at execution, ≥ 0100): `brief.report jsonb` nullable; `(client_id, scored_at)` index on `event_score` only if Task 0's EXPLAIN needs it.
- `@cs/core` `brief-report.ts`: `Grade`, `GRADE_LABEL`, `ReportTopic`, `TOPIC_LABEL`, `gradeFor`, `topicOf`, `ChangeLine`, `GradedChanges`, `GradedChangesView`, `GradeTotals`, `BriefReport` (zod), `REPORT_CAPS`, `capTopic`, `totalsOf`; `day-range.ts` `formatDayRange`; `charts.ts` (`ChartSeries`, `foldSeries`, `chartRole`, `niceMax`, `yTicks`, `linePath`); `PDF_LAYOUT_VERSION` 6; glossary `major-change`, `notable-change`, `minor-change`.
- `@cs/engine`: `briefs/graded.ts` (`groupChanges`, `gradedChanges`, `liveChanges`), `briefs/report.ts` (`buildBriefReport`, `briefReportProps`, `briefHighlights`), `briefs/attachment.ts` (`briefAttachment`, `attachmentName`, `MAX_ATTACHMENT_BYTES`), `ensureBriefPdf`, `majorSummary`, `finalBriefSummary(b, items, liveMajorEvents)`; `workspace/{scope,pressure,ads,kpi}.ts` moved from `@cs/tools` (tools keep re-export shims); `createEmailSender({ attachment? })`.
- `@cs/email`: `GROUP_PHRASE`/`groupPhrase`, `PrintLineChart`, `renderBriefReportDocument`, `BriefReportDocumentProps`, `BriefEmailProps.{highlights, attachPdf, attached}`, `OutgoingEmail.attachments` (Postmark/file/memory); previews `brief.highlights`, `brief.quiet_highlights`, `brief.highlights_not_attached`, `document.brief_report*`.
- `@cs/tools`: `BriefDetail.changes` / `BriefReview.changes` (`GradedChangesView`, web channel only); `briefDetail(..., { changes })`.
- Web: `GradedChanges` view on the brief page; Changes page `from`/`to` params; help tip `client.briefs.detail.grades`.

## Assumes from other branches
- `brief-signal` merged: whole-business relevance + re-score (grades are meaningless before it), migration 0099, `EVIDENCE_CHANNEL_LABEL`, evidence head format. Re-check its final `score.ts`/`gather.ts` at plan time.

## Decisions (owner-approved 2026-11-07)
- **O1** Brief PDF = full weekly report (layout "C"): agency-branded cover (never Rival Monday), summary page (headline stats, top move, next steps), one page/section per topic — Reviews & rating, Ads, Map rankings, Moves, Recommendations (+ recent alerts if they fit) — each with the client-overview chart(s) and that topic's changes this week. **Ask Friday never included.** Owner: "I want the client to feel he gets his money's worth", "more comprehensive even if it is an extra overview".
- **O2** Graded changes everywhere (email, in-app brief, PDF): every competitor change of the period, graded by `event_score.score` vs the client's brief threshold T (default 40): **Major** ≥ T (existing written, verified items), **Notable** T/2 ≤ s < T, **Minor** < T/2. Labels exactly "Major", "Notable", "Minor". Notable/Minor one line each, deterministic from stored event summaries + evidence dates (no model text; verifier never drops them). Retracted + cosmetic hidden. Repeats grouped ("Lakeview: 6 Google ads stopped"); cap per topic with "+N more" → app Changes page; Minor collapsed by default in email and app. "Quiet week" = nothing Major.
- **O3** Own branch; builds after `brief-signal` merges (scoring fix: whole-business relevance).
- **O4** Email = short (summary + highlights) pointing to the full report, which is **attached** to the weekly brief email (supersedes decision 16's "linked, not attached"; PDF link kept as fallback). Starting-point email unchanged.
- **O5** Agencies cannot hide single Notable/Minor lines; read-only, retraction is the only recourse.
- Website, prices & services section accepted.
- Controller calls (my call, spec §4.4–4.7): C1 quiet only with no written item and no Major line, scorecard on every weekly brief; C2 AM-dropped/retracted events leave lines + totals at delivery/read; C3 "See all changes this week" = Changes page with the period's dates (page params only, no `search_events` change, no new link target); email highlights + attachment fallback (render fails or > 9 MB ⇒ link only, logged).

## New backlog (target → item)
- (later) → agency control to hide a single Notable/Minor line, if pilots ask (O5).
- (later) → graded changes on MCP/Ask `get_brief` (plan P5).
- (later) → `search_events` date bounds if the Changes week view (page-side filter, plan P6) misleads.

## Owner verification steps
See plan Task 15: migrate cs_dev; sign the new copy in `pnpm copy:review`; render one PDF (`deliver-once`) and open it on a phone + print (agency-only cover and metadata); one live staging week (email with attachment on a phone, Minor folded in the app, "See all changes this week"); old PDFs re-render once at v6.

## Brief

### Scope
O1 + O2 above. Starting-point brief keeps its current format (my call). No new model calls.

### Already built — reuse
- PDF: `packages/engine/src/briefs/pdf.ts` `renderBriefPdf` → `@cs/email` `renderBriefDocument` (`document.ts`, `BriefEmail` `variant: 'document'`) with `briefEmailProps` + `loadBriefView` (`briefs/deliver.ts`); worker `apps/worker/src/pdf.ts` (Playwright, JS off, every request blocked but the logo; `cleanPdfMetadata` = decision 16). Key `briefs/<agency>/<id>.v<N>.pdf`; `apps/web/src/server/files.ts` re-renders older keys.
- Snapshot precedent: `brief.trend` / `brief.scorecard` jsonb (generate.ts), quarterly `trend_report.data` (`reports/quarterly.ts` `computeTrendReport`).
- Data: `trendSnapshot`/`reviewBenchmark`/`monthKeys`/`ratingStats` (engine), `adActivity` (engine) + `adWeeklySeries` (tools twin), `pressureByClient` (tools `pressure.ts`), `rankMetrics`/`competitorMatcher` (engine), `rank_map_image` (Stadia image key + bounds), `STADIA_ATTRIBUTION`.
- Overview page `apps/web/src/app/(app)/c/[clientId]/page.tsx`: `overview-kpis.ts` `kpiCards`, pressure bars, `LineChart` + `foldSeries`/`seriesColor` (`components/charts/line-chart.tsx`), moves, recs, alerts.
- Email `packages/email/src/templates/brief.tsx` (+ `scorecard.tsx`, `trend-table.tsx`), `changeTypeLabel`/`CHANGE_LABELS` (`labels.ts`), `previews.ts`.
- In-app: `briefs/[briefId]/page.tsx` + `components/views/brief-view.tsx`; `get_brief` → `briefDetail` (`packages/tools/src/tools/briefs.ts`), `BriefDetail` (`tools/schemas.ts`).
- Gather: `gather.ts` (scoredAt window, `featuredBefore`, retracted + cosmetic excluded), `loadBriefClient().briefThreshold`.
- Links: `personalLink` (`delivery/outbox.ts`), `LINK_TARGETS` (`@cs/core` `links.ts`), `destinationPath`/`goDestination` (`apps/web/src/server/links.ts`); Changes page params `changes/params.ts`.

### Binding constraints
- White-label: nothing client-facing names Rival Monday; agency branding on cover/footers/PDF metadata (decision 16, `cleanPdfMetadata`).
- Design system `docs/design-system/` (09 § 5.4 chart roles: you #2A6BAC/`--you` + ≤ 2 rivals `#E05A2B`/`#14936A` + grey `#A3B1C2`); charts = inline SVG; check colours with the dataviz skill.
- Copy: owner signs in `pnpm copy:review` (`docs/copy/signoff.json`); new email variants ⇒ `@cs/email` `previews.ts`; email CLAUDE.md: intro says who/what/do; contact block email-only.
- Help: `page:client.briefs.detail` guide + new tip/glossary terms (one `@cs/core` list).
- `redactForModel` (event summaries are already redacted at tag time), `upsell_tag` never client-facing, event readers `retracted_at IS NULL`, client lists `client.status = 'active'`, page refusals 404.
- Raise `PDF_LAYOUT_VERSION` on any PDF look change (email CLAUDE.md).
- Launch gate: brief page ≤ 8 app DB stages (`profile-gate.sh`).
- Core spec §9.1.5 "Never pad" — amended by O2 (graded lines are labelled, not padding).

### Backlog to fold in (`docs/BACKLOG.md`)
- L395 "standard → quiet-at-delivery brief has no scorecard" (quiet definition changes here).
- L212 13a comprehensive branding for emails/PDF (cover uses it; header-colour override, dark logo).
- L244 `/go` skips client-facing status filters (reused `brief` links in the new email must respect them).
- L400 read-path conventions (strip upsell, status filters, sort by `ord`).
- L150 "First moves still open" vs glossary wording (scorecard copy on the summary page).

### In-flight overlaps
- `brief-signal` (fix): `briefs/{writer,evidence,verify}.ts`, `score/score.ts`, vendor diff, migration 0099, rescore CLI. This branch touches `generate.ts`, `deliver.ts`, `pdf.ts`, new files; rebase after it merges.
