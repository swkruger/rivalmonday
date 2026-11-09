# brief-report — weekly brief becomes a full report; every change graded Major / Notable / Minor

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/brief-report   **Base:** main @ bd58dd62
**Spec:** `docs/superpowers/specs/2026-11-07-brief-report-design.md` (owner-approved 2026-11-07) · **Plan:** `docs/superpowers/plans/2026-11-07-brief-report.md` (Tasks 0–15, lean)

## Status (overwrite)
Executing (SDD); Task 0 done.

## Next (overwrite)
Task 1a onward (SDD). Apply the Task 0 findings below to the plan interfaces as each task starts.

## Interfaces this branch adds or changes
- Migration `0103_brief_report`: `brief.report jsonb` nullable; no `event_score` index (Task 0 EXPLAIN).
- `@cs/core` `brief-report.ts`: `Grade`, `GRADE_LABEL`, `ReportTopic`, `TOPIC_LABEL`, `gradeFor`, `topicOf`, `ChangeLine`, `GradedChanges`, `GradedChangesView`, `GradeTotals`, `BriefReport` (zod), `REPORT_CAPS`, `capTopic`, `totalsOf`; `day-range.ts` `formatDayRange`; `charts.ts` (`ChartSeries`, `foldSeries`, `chartRole`, `niceMax`, `yTicks`, `linePath`); `PDF_LAYOUT_VERSION` 6; glossary `major-change`, `notable-change`, `minor-change`.
- `@cs/engine`: `briefs/graded.ts` (`groupChanges`, `gradedChanges`, `liveChanges`), `briefs/report.ts` (`buildBriefReport`, `briefReportProps`, `briefHighlights`), `briefs/attachment.ts` (`briefAttachment`, `attachmentName`, `MAX_ATTACHMENT_BYTES`), `ensureBriefPdf`, `majorSummary`, `finalBriefSummary(b, items, liveMajorEvents)`; `workspace/{scope,pressure,ads,kpi}.ts` moved from `@cs/tools` (tools keep re-export shims); `createEmailSender({ attachment? })`.
- `@cs/email`: `GROUP_PHRASE`/`groupPhrase`, `PrintLineChart`, `renderBriefReportDocument`, `BriefReportDocumentProps`, `BriefEmailProps.{highlights, attachPdf, attached}`, `OutgoingEmail.attachments` (Postmark/file/memory); previews `brief.highlights`, `brief.quiet_highlights`, `brief.highlights_not_attached`, `document.brief_report*`.
- `@cs/tools`: `BriefDetail.changes` / `BriefReview.changes` (`GradedChangesView`, web channel only); `briefDetail(..., { changes })`.
- Web: `GradedChanges` view on the brief page; Changes page `from`/`to` params; help tip `client.briefs.detail.grades`.

## Assumes from other branches
- `brief-signal` merged: whole-business relevance + re-score (grades are meaningless before it), migration 0099, `EVIDENCE_CHANNEL_LABEL`, evidence head format. Re-check its final `score.ts`/`gather.ts` at plan time.

## Decisions (owner-approved 2026-11-07)
- **O6** `get_brief` graded `changes` on the web channel only for now (MCP/Ask unchanged, no eval re-record); revisit later (owner, 2026-11-07).
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

## Task 0 findings (2026-11-08)
Rebased onto local main bd58dd62 (origin/main identical); `pnpm install` ok; `npx turbo run typecheck --concurrency=1` green (19/19).
- **Migration number: 0103** (main ends 0102_web_readiness). Use `0103_brief_report` for `<n>`.
- **Unchanged since the plan's base (✓):** `gather.ts` (scoredAt window `gt start, lte end`, `BRIEF_EVENT_MAX_AGE_DAYS = 30` on `occurredAt`, `featuredBefore`, cosmetic/retracted excluded; existing read filters `route IN ('brief','alert')`, Task 3's any-route read drops that), `loadBriefClient().briefThreshold`; `generate.ts` (commit block `committableItems`, `kind = items > 0 ? standard : quiet`, scorecard only when quiet), `summary.ts` `finalBriefSummary(b, items)`, `review.ts` `dropRetractedItems`/`approveBriefTx`, `deliver.ts` `loadBriefView`/`briefEmailProps`/`deliverBrief`, `pdf.ts` (`renderBriefPdf`, `briefPdfKey`, `PdfDeps {db, store, pdf}`), `delivery/outbox.ts` (`notify`, `dispatchDue`, `createEmailSender({transport, fromAddress})`). phase-18a did not touch them; only `score/*` (rescore, whole-business relevance) changed.
- `ObjectStore.get` returns `Uint8Array | null` ✓. `OutgoingEmail` has no `attachments` yet (as planned); Postmark/file/memory transports in `packages/email/src/transport.ts` ✓. `PDF_LAYOUT_VERSION` is 5 now, so 6 is right.
- `event.channels` = `CHANNELS` in `@cs/core` `domain.ts` (`web, google_ads, meta_ads, google_business_profile, google_reviews, google_jobs, rank`); `EVIDENCE_CHANNEL_LABEL` lives in `@cs/engine` `briefs/evidence.ts` (not exported from core); labels differ from the plan's `GROUP_PHRASE` needs, keep `groupPhrase` in `@cs/email`.
- **MISMATCH Task 2:** `@cs/tools` `workspace/scope.ts` mixes pure helpers with `ToolDeps`-based ones (`workspaceClient`, `requireVisibleClient`, `firstVisibleEvent*`, `requireVisibleEvent`, `allInOrder`). Move only `eventJoin`, `clientEvents`, `liveEventCount` (+ `escapeLike` not needed) to `packages/engine/src/workspace/scope.ts`; tools' `scope.ts` keeps the rest and re-exports the three. `@cs/tools` already depends on `@cs/engine` (no new dep). `pressure.ts` imports `liveEventCount` from `./workspace/scope` and `changeTypeLabel` from `@cs/email` (engine has `@cs/email`). `workspace/ads.ts` is self-contained.
- **MISMATCH Task 2 (kpi.ts):** `isPriceCut` and `weekIndex` are closures local to `tools/overview.ts` (`weekIndex` closes over `now`/`TREND_WEEKS`), not exports; Task 2 extracts them as new pure functions (`weekIndex(now, at, weeks)`), and `overview.ts` must be edited to use them.
- **MISMATCH Task 13:** `createEmailSender` is also constructed in `apps/worker/src/cli/deliver-once.ts` (line ~73) and in two web E2E specs (`client-setup-invite.spec.ts`, `intake.spec.ts`); `attachment` is optional so E2E specs need no change, but add `deliver-once.ts` to Task 13's files so the CLI attaches too (worker `deps.ts` has `getStore`, `getPdf` ✓ at lines 291/325).
- **`@cs/engine` already depends on `@cs/email`** (`package.json`), so Task 1b's `groupPhrase`/`changeTypeLabel` import needs no dep change.
- **`ChartSeries` in `apps/web/src/components/charts/line-chart.tsx`:** `interface ChartSeries { key: string; name: string; points: (number | null)[]; you?: boolean }`. The planned zod `ChartSeries` (`key, name, points: z.array(z.number().nullable()), you: z.boolean().optional()`) matches exactly; the web component should import the `@cs/core` type (type-only) instead of redeclaring.
- **`get_brief` channels:** `tools/briefs.ts` lists `['web','mcp','ask']` at lines 25 and 85 (both read tools) and `['web']` at 98; Task 6 adds `changes` to the web channel only (O6).
- **EXPLAIN (any-route graded read), migrated test DB (PG 18):** plan used `event_score_client_route_idx (client_id, route, scored_at)` as an Index Scan with `Index Cond: client_id = $1 AND scored_at > .. AND scored_at <= ..` (both with seq scan on and off; event side `event_pkey`). Empty tables only (no superuser for bulk seeding), so judged on usability: the index serves it on the `client_id` prefix and PG 18 skip scan covers the missing `route`; on PG < 18 it would scan the client's index range and filter `scored_at`, bounded by one client's rows (hundreds to low thousands) plus the PK `(client_id, event_id)`. **Decision: no `(client_id, scored_at)` index; Task 5's migration is `ALTER TABLE "brief" ADD COLUMN "report" jsonb;` only.** Revisit only if the `profile-gate.sh` brief-page run shows the read hot.
