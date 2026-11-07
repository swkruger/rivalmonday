# Brief report — design (draft)

**Date:** 2026-11-07 · **Branch:** `brief-report` · **Status:** draft for owner review · **Builds after:** `brief-signal` merges
Core spec: `2026-09-29-core-platform-design.md` §9.1–9.2 (brief, delivery), §6.3 (scoring), §8.5 (upsell). Only new decisions and interfaces here.

## 1. Intent

The weekly brief today shows only the 0–5 written items that clear the bar; a week below the bar reads as "nothing happened" even when competitors changed dozens of things. The owner wants the client to see the whole week and the whole picture: *"I want the client to feel he gets his money's worth"*, *"more comprehensive even if it is an extra overview"*. Two moves: (1) the PDF becomes a full weekly report with the overview charts; (2) every change of the week is shown everywhere, graded, so significance stays honest.

## 2. Goals / non-goals / anti-goals

**Goals**
- G1 PDF = branded multi-page weekly report (O1).
- G2 One graded change list per brief, identical in email, app and PDF (O2).
- G3 Everything new is deterministic from stored data; no new model calls, no verifier load.

**Non-goals**
- Starting-point brief format (unchanged — *my call*).
- Quarterly report, alerts, digest.
- Charts in the email body (email clients strip SVG; the PDF and the app carry the charts — *my call*).
- Changing scoring, T, routing or verifier τ (brief-signal owns scoring).

**Anti-goals**
- No model-written text for Notable/Minor lines.
- No Ask/Friday content anywhere in the report.
- No Rival Monday name, logo or metadata on anything client-facing.
- No padding a quiet week with fake significance: Notable/Minor are labelled as such; nothing is promoted.
- No email that breaks on a phone: one-line rows, no wide tables, capped lists.
- No numeric scores shown to clients (grades only — *my call*).

## 3. Decided (owner, 2026-11-07)
- **O1** Layout "C": agency-branded cover → summary page (headline stats, top move, next steps) → one section per topic (Reviews & rating, Ads, Map rankings, Moves, Recommendations, + recent alerts if they fit), each with the client-overview chart(s) and that topic's changes this week. Ask never included.
- **O2** Grades by `event_score.score` vs the client's brief threshold T (default 40): **Major** ≥ T, **Notable** T/2 ≤ s < T, **Minor** < T/2; labels exactly "Major", "Notable", "Minor". Major = existing written, verified items. Notable/Minor = one deterministic line each from stored event summaries + evidence dates. Retracted + cosmetic hidden. Repeats grouped; per-topic cap with "+N more" to the Changes page; Minor collapsed by default in email and app. "Quiet week" = nothing Major. Amends §9.1.5 "Never pad" (graded, labelled lines are not padding).
- **O3** Own branch after `brief-signal`.

## 4. Interfaces

### 4.1 Grades — `packages/engine/src/briefs/graded.ts`
```ts
export type Grade = 'major' | 'notable' | 'minor';
export const GRADE_LABEL: Record<Grade, string> = { major: 'Major', notable: 'Notable', minor: 'Minor' };
/** T = BriefClient.briefThreshold. */
export const gradeFor = (score: number, briefThreshold: number): Grade =>
  score >= briefThreshold ? 'major' : score >= briefThreshold / 2 ? 'notable' : 'minor';

export type ReportTopic = 'reviews' | 'ads' | 'rankings' | 'offers' | 'moves';
export const TOPIC_OF: Record<string, ReportTopic>; // rating_change, review_spike → reviews; ad_started, ad_stopped → ads;
// rank_change → rankings; price_change, promo, new_service, service_removed, service_area_change, new_location,
// hiring, content, tier_change → offers; unknown → offers

export interface ChangeLine {
  grade: Grade; topic: ReportTopic;
  competitorId: string; competitorName: string; changeType: string;
  /** Primary channel (first of event.channels) — groups Google vs Meta ads apart. */
  channel: string | null;
  count: number;              // 1 = single event
  text: string;               // deterministic, see 4.2
  firstAt: string; lastAt: string; // ISO dates of event.occurred_at (min/max)
  eventIds: string[];         // for re-filtering retractions at delivery
  evidenceIds: string[];
}
export interface GradedChanges {
  v: 1; threshold: number;     // T used (frozen at generation)
  /** Major events without a written item (verifier drop, select cap): one line each, grade 'major'. */
  lines: ChangeLine[];         // sorted: grade, topic order, max score desc, lastAt desc
  totals: Record<Grade, number>; // event counts incl. written Major items' events
}
export async function gradedChanges(deps: { db: Db }, c: BriefClient, period: { start: Date; end: Date }, writtenEventIds: Set<string>): Promise<GradedChanges>;
export function groupChanges(rows: GradableEvent[], threshold: number): ChangeLine[];
```
**Source rows:** `event_score` for `client_id = c.id`, **any route**, `scored_at` in (period.start, period.end], joined to `event` with `retracted_at IS NULL`, `change_type <> 'cosmetic'`, `occurred_at > period.end − BRIEF_EVENT_MAX_AGE_DAYS` (same window as `gatherBriefCandidates`), excluding events in this brief's written items (`writtenEventIds`) and `featuredBefore` (an event is shown once). Competitor must still be tracked (`client_competitor`).

### 4.2 Line text and grouping (deterministic)
- Group key = `grade + competitorId + changeType + channel`. Group grade = grade of the max score in the group.
- `count = 1`: `` `${competitorName}: ${changeTypeLabel(type)} — ${summary}` `` with `summary` = stored `event.summary` (already `redactForModel`-redacted at tag time), truncated to 140 chars. Date shown by the renderer from `lastAt` in the viewer/client tz.
- `count ≥ 2`: `` `${competitorName}: ${count} ${GROUP_PHRASE[type](channel)}` `` e.g. "Lakeview: 6 Google ads stopped". `GROUP_PHRASE` is decided copy in `@cs/email` `labels.ts` (one entry per `CHANGE_LABELS` key; fallback `` `${count} ${label} changes` ``). Dates = "Nov 3–6".
- No number, name or quote is introduced that is not in the stored event/competitor rows.

### 4.3 Caps
`GRADE_CAPS = { email: { notable: 3, minor: 0 }, app: { notable: 10, minor: 20 }, pdf: { notable: 12, minor: 12 } }` per topic (count of lines, not events). Overflow → "+N more" (N = hidden lines). Email Minor shows only a count line per brief ("+ 14 minor changes"), since `<details>` is not reliable in mail clients — that is "collapsed" for email (*my call*). App Minor = `<details>` closed by default. PDF: no links; "+N more in your dashboard" plain text.

### 4.4 Report snapshot — `packages/engine/src/briefs/report.ts`, migration **0100**
`ALTER TABLE brief ADD COLUMN report jsonb;` (nullable; service-role written like `trend`/`scorecard`; no RLS change — `brief` policies already cover the row).
```ts
export const BriefReport = z.object({
  v: z.literal(1),
  asOf: iso,                                   // = period.end
  changes: GradedChanges,                      // 4.1
  kpis: z.object({ changes7d, alerts7d, priceMoves7d, priceCuts7d, activeAds, activeAds7dAgo, ratingSelf, ratingAvg,
                   weekly: { changes: number[8], priceMoves: number[8], activeAds: (number|null)[8] } }),
  pressure: z.array({ competitorId, name, score, level, reason: string | null }).max(5),
  rating: { months: string[12], series: ChartSeries[] },     // you + rivals monthly avg rating (reviewBenchmark)
  ads: { weeks: string[12], series: ChartSeries[] },         // adWeeklySeries, 12 weeks to asOf
  rankings: null | { scanAt: iso, prevScanAt: iso | null, keywords: { keyword, you: RankMetric, prev: RankMetric | null, rivals: { name, metric }[] }[] (≤ 5),
                     map: null | { keyword, objectKey, bounds, width, height, points: { lat, lng, rank: number | null }[] } },
  moves: { id, competitorName, moveType, label, status, firstDetectedAt }[] (open, ≤ 6),
  recommendations: { id, title, status, createdThisWeek: boolean }[] (todo/in_progress, ≤ 8; no upsell_tag),
  alerts: { headline, competitorName, deliveredAt }[] (delivered in period, ≤ 5),
});
export async function buildBriefReport(deps: { db: Db; packs: PackLoader }, c: BriefClient, period, writtenEventIds): Promise<BriefReport>;
```
- **Computed at generation** in `generateBrief` (same place as `trendSnapshot`), stored on the brief, so the AM approves exactly what is sent. A report failure never fails the brief (stored null, logged) — same rule as the quiet scorecard.
- **At delivery** (`deliverBrief`, existing tx): drop `changes.lines` whose `eventIds` are now all retracted; recompute `totals`. Charts/KPIs are not recomputed.
- Moves `adWeeklySeries` (`tools/workspace/ads.ts`), `pressureByClient` + `MOVE_LABELS` (`tools/pressure.ts`) into `@cs/engine` (tools re-export/import; engine cannot import tools). Rank metrics via engine `rankMetrics`. All reads use the service DB filtered by `client_id` (worker has no web ctx) — *my call* over calling tools with a synthetic context.
- Old briefs: `report = null` → PDF renders today's layout (cover added) and email/app show no graded block. No backfill (*my call*).

### 4.5 Kind / quiet
`kind = 'quiet'` iff no written items **and** no `major` line. Quiet email/app/PDF keep the scorecard + trend (§9.1.5) and add the graded Notable/Minor block under "Other changes this week". `QUIET_SUMMARY` wording may need a tweak ("No major competitor moves this week") — copy sign-off.

### 4.6 Tool + app
- `BriefDetail` gains `changes: GradedChangesView.nullable()` (lines without `eventIds`/`evidenceIds`? — keep `evidenceIds` for `EvidenceChips`). Same for agency and client roles; `report` itself is not exposed by tools (PDF only — *my call*).
- `brief-view.tsx`: after Major items, section **"Other changes this week"**: per topic, Notable lines (grade chip "Notable", neutral tint), then a closed `<details>` "Minor (N)". "+N more" → `/c/<id>/changes?brief=<briefId>`.
- Changes page: new param `brief=<uuid>` → window = that brief's period, `route=all`; brief must be readable by the viewer (`get_brief` rules), else ignored.
- Help: tip `client.briefs.detail.grades`; glossary terms "Major change", "Notable change", "Minor change"; guide `docs/help/pages/` for `page:client.briefs.detail` updated.

### 4.7 Email (`templates/brief.tsx`)
Order: intro → heading → summary → Major item cards (unchanged) → **"Other changes this week"** (Notable lines grouped by topic, ≤ 3 per topic, "+N more" link; one "+ N minor changes" line with link) → scorecard/trend (quiet) → "Open in your dashboard" → **"Download the full report (PDF)"** (renamed, *my call*) → feedback → contact block. Links: new `LinkTarget` `brief_changes` (id = brief id) → `destinationPath` `/c/<client>/changes?brief=<id>`; `goDestination` applies the client status filter (fixes backlog L244 for this target). New previews in `previews.ts`: `brief:graded`, `brief:quiet-graded`.

### 4.8 PDF (`renderBriefPdf`, new `@cs/email` `templates/brief-report.tsx`, `renderBriefReportDocument`)
Page order (CSS `break-before: page` per section; Letter, current margins):
1. **Cover** — agency logo (allow-listed URL as today), agency display name, "Weekly competitor report", client name, week of `deliveryDate`; colours from `Branding` (ink band). No Rival Monday anywhere.
2. **Summary** — 4 KPI stats (same titles as `kpiCards`), `summary` text, top move (first Major item headline, else "No major moves this week"), next steps (recommended actions of Major items, else open recommendations, ≤ 3), competitive pressure bars (≤ 5), grade totals ("3 Major · 7 Notable · 22 Minor"). Quiet: scorecard here.
3. **Reviews & rating** — 12-month rating line chart; trend table (`TrendTable`); Major items + lines for `reviews`.
4. **Ads** — 12-week active-ads line chart; items + lines for `ads`.
5. **Map rankings** — map (Stadia image inlined as `data:` URI from `store.get(objectKey)`; rank dots SVG overlay; `STADIA_ATTRIBUTION` printed) + keyword table (you vs ≤ 2 rivals, vs previous scan); items + lines for `rankings`. Omitted when no scan exists.
6. **Website, prices & services** — no chart; items + lines for `offers` (*my call*: these changes need a home).
7. **Moves** — open moves list; move-based Major items.
8. **Recommendations** — open recommendations, "new this week" marked.
9. **Recent alerts** — only when ≥ 1 in period; otherwise omitted.
- A section with neither data nor changes is omitted (never padded). Sections may share a page when short (builder may drop forced breaks for < ⅓ page).
- Charts: pure helpers move to `@cs/core` `charts.ts` (`foldSeries`, `chartRole(series, all, { lowerIsBetter })` returning `'you' | 'rival1' | 'rival2' | 'context'`, ticks, path). Web `LineChart` maps roles to CSS vars; `@cs/email` `charts/print-line-chart.tsx` maps to hex (`you` = `#2A6BAC`, rivals `#E05A2B`/`#14936A`, context `#A3B1C2`). Static SVG, no JS, `role="img"` + `aria-label`.
- `PDF_LAYOUT_VERSION` 5 → 6. Metadata unchanged (decision 16): title "<client> — weekly competitor report <date>".
- `deps.pdf(html, meta, { allowUrls: [logo] })` unchanged; map bytes inlined so no new allow-list entry. *My guess:* Playwright `page.route('**/*')` does not intercept `data:` URLs — verify with a renderer test first.

## 5. Left to the builder
- Exact SVG geometry, label density, page-break tuning, phone layout of the email block.
- `GROUP_PHRASE` table wording (then owner sign-off) and summary-page copy.
- Whether `ChartSeries` for rating uses `foldSeries` mean (likely yes, `aggregate: 'mean'`, `pin: ['you']`).
- Query shapes, indexes (`event_score_client_route_idx` covers `client_id, route, scored_at`; an any-route window may want `(client_id, scored_at)` — measure first).
- Test list: `gradeFor` boundaries (T, T/2, odd T), grouping, caps, retraction re-filter, quiet rule, PDF without report (old brief), white-label (no "Rival Monday" in HTML), no `upsell_tag` in props, isolation (`get_brief` changes only for the brief's client).

## 6. Calls I made
1. Starting-point brief keeps its current format; no graded block (*my call*).
2. Report snapshot computed at generation and stored on `brief.report` (migration 0100); delivery only re-filters retracted lines (*my call*).
3. Data built in engine from the service DB; `adWeeklySeries`/`pressureByClient`/`MOVE_LABELS` move from tools to engine (*my call*).
4. No charts in the email body; charts in PDF (and existing app pages) (*my call*).
5. Major-score events without a written item appear as one-line "Major" rows; quiet = no written item and no Major line (*my call*).
6. Extra topic "Website, prices & services" for price/promo/service/content/location/hiring changes (*my call*).
7. Caps: email Notable 3/topic, Minor as one count line; app Notable 10/Minor 20 (Minor in closed `<details>`); PDF 12/12 (*my call*).
8. "+N more" → Changes page via new `brief=<id>` param and `brief_changes` link target (*my call*).
9. Grades only, never numeric scores, for every role on these surfaces (*my call*).
10. Old briefs (report null) are not backfilled; they render with the cover + old body (*my call*).
11. Chart helpers shared via `@cs/core` `charts.ts`; separate print chart in `@cs/email` (*my call*).
12. Map image inlined as `data:` URI (*my guess* that the renderer allows it — verify).
13. Competitive pressure lives on the summary page, not its own section (*my call*).
