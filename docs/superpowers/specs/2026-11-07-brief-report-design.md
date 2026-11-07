# Brief report — design (draft)

**Date:** 2026-11-07 · **Branch:** `brief-report` · **Status:** draft for owner review · **Builds after:** `brief-signal` merges
Core spec: `2026-09-29-core-platform-design.md` §9.1–9.2 (brief, delivery), §6.3 (scoring), §8.5 (upsell). Only new decisions and interfaces here.

## 1. Intent
Today the weekly brief shows only the 0–5 written items that clear the bar; a week below it reads as "nothing happened" even when competitors changed dozens of things. Owner: *"I want the client to feel he gets his money's worth"*, *"more comprehensive even if it is an extra overview"*. So: (1) the PDF becomes a full weekly report with the overview charts, attached to the email; (2) every change of the week is shown everywhere, graded, so significance stays honest.

## 2. Goals / non-goals / anti-goals
**Goals:** G1 PDF = branded multi-page weekly report (O1). G2 One graded change list per brief, the same in email, app and PDF (O2). G3 Everything new is deterministic from stored data; no new model calls, no verifier load.

**Non-goals:** starting-point brief and email (unchanged — *my call*); quarterly report, alerts, digest; charts in the email body (mail clients strip SVG — *my call*); scoring, T, routing, verifier τ (brief-signal owns scoring).

**Anti-goals:** no model-written text for Notable/Minor; no Ask/Friday content; no Rival Monday name, logo or metadata client-facing; no padding a quiet week (Notable/Minor are labelled, nothing promoted); no email that breaks on a phone (one-line rows, no wide tables); no numeric scores on these surfaces, any role (grades only — *my call*).

## 3. Decided (owner, 2026-11-07)
- **O1** Layout "C": agency-branded cover → summary page (headline stats, top move, next steps) → one section per topic (Reviews & rating, Ads, Map rankings, Moves, Recommendations, + recent alerts if they fit), each with the client-overview chart(s) and that topic's changes this week. Ask never included.
- **O2** Grades by `event_score.score` vs the client's brief threshold T (default 40): **Major** ≥ T, **Notable** T/2 ≤ s < T, **Minor** < T/2; labels exactly "Major", "Notable", "Minor". Major = existing written, verified items. Notable/Minor = one deterministic line each from stored event summaries + evidence dates. Retracted + cosmetic hidden. Repeats grouped; per-topic cap with "+N more" to the Changes page; Minor collapsed by default in email and app. "Quiet week" = nothing Major. Amends §9.1.5 "Never pad" (labelled lines are not padding).
- **O3** Own branch after `brief-signal`.
- **O4** Email = short: summary + highlights, pointing to the full report, which is **attached** to the weekly brief email (supersedes "linked from the email, not attached" in decision 16; the PDF link stays as a fallback if the attachment is stripped). Starting-point email unchanged.
- **O5** Agencies cannot hide single Notable/Minor lines: read-only; retraction is the only recourse (backlog: hide control if pilots ask).
- Website, prices & services section (6 in §4.8) accepted.

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
// rank_change → rankings; everything else (price, promo, services, area, location, hiring, content, tier) → offers

export interface ChangeLine {
  grade: Grade; topic: ReportTopic;
  competitorId: string; competitorName: string; changeType: string;
  channel: string | null;             // first of event.channels — keeps Google vs Meta ads apart
  count: number;                      // 1 = single event
  text: string;                       // deterministic, 4.2
  firstAt: string; lastAt: string;    // min/max event.occurred_at
  eventIds: string[]; evidenceIds: string[];
}
export interface GradedChanges {
  v: 1; threshold: number;            // T used (frozen at generation)
  /** Includes Major events without a written item (verifier drop, select cap): one line each, grade 'major'. */
  lines: ChangeLine[];                // sorted: grade, topic order, max score desc, lastAt desc
  totals: Record<Grade, number>;      // event counts incl. written Major items' events
}
export async function gradedChanges(deps: { db: Db }, c: BriefClient, period: { start: Date; end: Date }, writtenEventIds: Set<string>): Promise<GradedChanges>;
export function groupChanges(rows: GradableEvent[], threshold: number): ChangeLine[];
```
**Source rows:** `event_score` for `client_id = c.id`, **any route**, `scored_at` in (start, end], joined to `event` with `retracted_at IS NULL`, `change_type <> 'cosmetic'`, `occurred_at > end − BRIEF_EVENT_MAX_AGE_DAYS` (as `gatherBriefCandidates`), excluding this brief's written items' events and `featuredBefore` (an event is shown once). Competitor still tracked (`client_competitor`).

### 4.2 Line text and grouping (deterministic)
- Group key = `grade + competitorId + changeType + channel`; group grade = grade of its max score.
- `count = 1`: `` `${competitorName}: ${changeTypeLabel(type)} — ${summary}` ``, `summary` = stored `event.summary` (already `redactForModel`-redacted at tag time), ≤ 140 chars. Date from `lastAt` in the viewer/client tz.
- `count ≥ 2`: `` `${competitorName}: ${count} ${GROUP_PHRASE[type](channel)}` `` e.g. "Lakeview: 6 Google ads stopped". `GROUP_PHRASE` = decided copy in `@cs/email` `labels.ts` (one per `CHANGE_LABELS` key; fallback `` `${count} ${label} changes` ``). Dates "Nov 3–6".
- No number, name or quote that is not in the stored event/competitor rows.

### 4.3 Caps
Email: ≤ 3 Notable lines **in total**, Minor as one count line (4.7). App per topic: Notable 10, Minor 20 in a closed `<details>`. PDF per topic: 12 / 12, overflow as plain "+N more in your dashboard". Overflow link label "See all changes this week" (*my call*).

### 4.4 Report snapshot — `packages/engine/src/briefs/report.ts`, migration **0100**
`ALTER TABLE brief ADD COLUMN report jsonb;` (nullable; service-role written like `trend`/`scorecard`; existing `brief` RLS covers it).
```ts
export const BriefReport = z.object({
  v: z.literal(1), asOf: iso,                  // = period.end
  changes: GradedChanges,
  kpis: { changes7d, alerts7d, priceMoves7d, priceCuts7d, activeAds, activeAds7dAgo, ratingSelf, ratingAvg,
          weekly: { changes: number[8], priceMoves: number[8], activeAds: (number|null)[8] } },
  pressure: { competitorId, name, score, level, reason: string | null }[] (≤ 5),
  rating: { months: string[12], series: ChartSeries[] },   // monthly avg rating, you + rivals (reviewBenchmark)
  ads: { weeks: string[12], series: ChartSeries[] },       // adWeeklySeries to asOf
  rankings: null | { scanAt, prevScanAt: iso | null, keywords: { keyword, you: RankMetric, prev: RankMetric | null, rivals: { name, metric }[] }[] (≤ 5),
                     map: null | { keyword, objectKey, bounds, width, height, points: { lat, lng, rank: number | null }[] } },
  moves: { id, competitorName, moveType, label, status, firstDetectedAt }[] (open, ≤ 6),
  recommendations: { id, title, status, createdThisWeek }[] (todo/in_progress, ≤ 8; never upsell_tag),
  alerts: { headline, competitorName, deliveredAt }[] (delivered in period, ≤ 5),
});
export async function buildBriefReport(deps: { db: Db; packs: PackLoader }, c: BriefClient, period, writtenEventIds): Promise<BriefReport>;
```
- **Computed at generation** in `generateBrief` (beside `trendSnapshot`) and stored, so the AM approves what is sent. A report failure never fails the brief (null, logged).
- **At delivery and read time** (C2, *my call*): events now retracted or belonging to an AM-dropped `brief_item` are removed from `lines` and `totals` (derived from `brief_item.status` + `retracted_at`, never written back); a dropped item's events are never re-added as lines. Charts/KPIs are not recomputed.
- `adWeeklySeries` (`tools/workspace/ads.ts`), `pressureByClient` + `MOVE_LABELS` (`tools/pressure.ts`) move into `@cs/engine` (tools import them; engine cannot import tools). Ranks via engine `rankMetrics`. Service DB filtered by `client_id` (worker has no web ctx) — *my call* over tools with a synthetic context.
- Old briefs (`report = null`): PDF = today's body + cover; email/app show no graded block. No backfill (*my call*).

### 4.5 Kind, quiet, scorecard (C1, *my call*)
`kind = 'quiet'` only with no written items **and** no Major line. Only Major one-liners ⇒ `standard`, summary "<n> major competitor change(s) this week" (new copy, sign-off). The scorecard ("Where you stand") is built and stored for **every** weekly brief, not only quiet ones (closes backlog L395). `finalBriefSummary` at delivery applies the same rule after drops/retractions.

### 4.6 Tool + app
- `BriefDetail` gains `changes: GradedChangesView.nullable()` (keeps `evidenceIds` for `EvidenceChips`, after the 4.4 read-time filter); same for agency and client roles. `report` itself is not exposed by tools (*my call*).
- `brief-view.tsx`: after Major items, **"Other changes this week"**: per topic, Notable lines (chip "Notable", neutral tint), then a closed `<details>` "Minor (N)". Read-only (O5). "See all changes this week" → `/c/<id>/changes?route=all&from=<periodStart date>&to=<periodEnd date>` (C3, *my call*).
- Changes page: page-level `from`/`to` (YYYY-MM-DD) params only, mapped onto its existing feed read; **no change to `search_events`** (shared with MCP/Ask), no brief-scoped filter, no new link target.
- Help: tip `client.briefs.detail.grades`; glossary "Major change", "Notable change", "Minor change"; update the `page:client.briefs.detail` guide.

### 4.7 Email (`templates/brief.tsx`, weekly only)
"Highlights" (*my call*): intro → summary line → one headline-stat line (e.g. "3 Major · 7 Notable · 22 Minor changes") → each Major item as headline + one-line "What changed" (no full cards) → ≤ 3 Notable lines in total → "+ N minor changes" → "Your full report is attached (PDF)." → "Open in your dashboard" → PDF link (fallback) → feedback → contact block. Links reuse existing signed targets (`brief`, `brief_item`, `brief_pdf`); the email's "See all changes this week" is the `brief` link (the in-app brief links on to Changes). Previews: `brief:highlights`, `brief:quiet-highlights`.

**Attachment (O4) — builder consequences:**
- `deliverBrief` needs the PDF before sending: render (or reuse a current-version `pdfKey`) **before** the send transaction, then attach the bytes (`application/pdf`, "<client> weekly report <date>.pdf"). Needs an attachment field on `EmailPayload`, the Postmark transport and the file outbox.
- Render fails at send time (*my call*): send without the attachment, keep the link, log `[briefs] pdf attach failed`; the existing hourly catch-up (`listBriefsMissingPdf`) stays.
- Postmark: 10 MB per message. Keep the PDF ≪ 10 MB: map image ≤ ~300 KB, no other raster; PDF > 9 MB ⇒ same no-attachment fallback.
- Sending already runs in the worker (hourly tick), which owns the Playwright renderer; no web-side render.

### 4.8 PDF (`renderBriefPdf`, new `@cs/email` `templates/brief-report.tsx`, `renderBriefReportDocument`)
Order (CSS `break-before: page` per section; Letter, current margins):
1. **Cover** — agency logo (allow-listed as today), agency name, "Weekly competitor report", client, week of `deliveryDate`; `Branding` colours (ink band). No Rival Monday.
2. **Summary** — 4 KPI stats (titles as `kpiCards`), summary, top move (first Major headline, else "No major moves this week"), next steps (Major items' actions, else open recommendations, ≤ 3), competitive pressure bars (≤ 5), grade totals, scorecard.
3. **Reviews & rating** — 12-month rating chart; `TrendTable`; Major items + lines for `reviews`.
4. **Ads** — 12-week active-ads chart; items + lines for `ads`.
5. **Map rankings** — Stadia image inlined as `data:` URI (`store.get(objectKey)`), rank-dot SVG overlay, `STADIA_ATTRIBUTION`; keyword table (you vs ≤ 2 rivals, vs previous scan); items + lines. Omitted without a scan.
6. **Website, prices & services** — no chart; items + lines for `offers`.
7. **Moves** — open moves; move-based Major items.
8. **Recommendations** — open ones, "new this week" marked.
9. **Recent alerts** — only when ≥ 1 in the period.
- A section with neither data nor changes is omitted. Short sections may share a page.
- Charts: pure helpers move to `@cs/core` `charts.ts` (`foldSeries`, `chartRole(series, all, { lowerIsBetter })` → `'you' | 'rival1' | 'rival2' | 'context'`, ticks, path). Web `LineChart` maps roles to CSS vars; `@cs/email` `charts/print-line-chart.tsx` to hex (`#2A6BAC`, `#E05A2B`/`#14936A`, `#A3B1C2`). Static SVG, `role="img"` + `aria-label`.
- `PDF_LAYOUT_VERSION` 5 → 6. Metadata as decision 16; title "<client> — weekly competitor report <date>".
- `allowUrls` unchanged (logo only). *My guess:* Playwright `page.route('**/*')` does not intercept `data:` URLs — verify with a renderer test first.

## 5. Left to the builder
- SVG geometry, label density, page breaks, phone layout of the email.
- `GROUP_PHRASE` wording, summary-page and email copy (owner sign-off).
- Rating series fold (likely `foldSeries` `aggregate: 'mean'`, `pin: ['you']`).
- Query shapes/indexes (`event_score_client_route_idx` is `client_id, route, scored_at`; any-route may want `(client_id, scored_at)` — measure).
- Tests: `gradeFor` boundaries, grouping, caps, retraction/drop filter, quiet rule, attachment fallback, old-brief PDF, no "Rival Monday" in HTML, no `upsell_tag`, isolation.

## 6. Calls I made
1. Starting-point brief and email keep their format; no graded block (*my call*).
2. Report computed at generation, stored on `brief.report` (0100) (*my call*).
3. Data built in engine from the service DB; ad series/pressure/move labels move from tools (*my call*).
4. No charts in the email body (*my call*).
5. Major events without a written item appear as one-line "Major" rows (*my call*).
6. C1 quiet only with no written item and no Major line; scorecard on every weekly brief (*my call*).
7. C2 AM-dropped items' and retracted events leave lines and totals at delivery/read time (*my call*).
8. C3 "See all changes this week" = Changes page with the period's dates; no `search_events` change, no new link target (*my call*).
9. Email highlights as in 4.7; caps: email 3 Notable total, app 10/20, PDF 12/12 (*my call*).
10. Attachment render failure ⇒ send with link only, log; > 9 MB same (*my call*).
11. Grades only, never numeric scores (*my call*).
12. Old briefs not backfilled (*my call*).
13. Chart helpers in `@cs/core`; print chart in `@cs/email` (*my call*).
14. Map image as `data:` URI (*my guess* — verify).
15. Competitive pressure on the summary page (*my call*).
