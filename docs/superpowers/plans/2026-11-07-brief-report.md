# brief-report Implementation Plan

**Goal:** The weekly brief shows every competitor change of the week, graded Major / Notable / Minor, the same in email, app and PDF; the PDF becomes a full agency-branded weekly report and is attached to the weekly brief email.

**Spec:** `docs/superpowers/specs/2026-11-07-brief-report-design.md` (owner-approved 2026-11-07, binding; cited as §). **Work file:** `docs/work/brief-report.md` (O1–O5, C1–C3).

## Global constraints
- Grade labels exactly "Major", "Notable", "Minor". `gradeFor`: Major score ≥ T, Notable T/2 ≤ score < T, Minor score < T/2 (T = `BriefClient.briefThreshold`, default 40, frozen in the report at generation).
- Caps: email ≤ 3 Notable lines in total (Major one-liners first, same budget), Minor as one count line; app per topic Notable 10, Minor 20 (Minor in a closed `<details>`); PDF per topic 12 / 12, overflow "+N more in your dashboard". App overflow link label "See all changes this week".
- Email = highlights only (§4.7): intro → summary → grade stat line → Major items (headline + "What changed") → ≤ 3 Notable lines → "+ N minor changes" → attachment line → "Open in your dashboard" → PDF link (fallback) → feedback → contact block. No charts in the email body.
- PDF attached to the weekly brief email; render failure or > 9 MB ⇒ send without attachment, link kept, log `[briefs] pdf attach failed`. Starting-point email and PDF unchanged.
- Nothing client-facing names Rival Monday (cover, footers, PDF metadata, filenames). No model-written text for Notable/Minor (stored `event.summary` + labels only). No Ask/Friday content. No numeric scores or T on any surface, any role.
- Charts: inline SVG, roles you `#2A6BAC` + ≤ 2 rivals (`#E05A2B`, `#14936A`) + grey `#A3B1C2`; `role="img"` + `aria-label`; check the print palette with the dataviz skill.
- Read paths: `upsell_tag` never client-facing; event readers `retracted_at IS NULL`; lines only for competitors the client still tracks; page refusals 404; web reads via registered tools.
- `PDF_LAYOUT_VERSION` 5 → 6. Migrations: next free number at execution time (≥ 0100), never a fixed number.
- LF only; every commit ends `Co-Authored-By: <implementer model> <noreply@anthropic.com>`. Edit files with the Edit tool (UTF-8: `—`, `·`, `–`).
- Tests: implementers run focused tests only; the final review runs `pnpm test:affected` + `pnpm --filter @cs/web e2e:affected` once.

## Decisions
Spec §3 (O1–O5) and §6 (calls 1–15); work file C1–C3. Plan calls (marked P):
- **P1** Shared pure types live in `@cs/core` `brief-report.ts` (`Grade`, `GRADE_LABEL`, `ReportTopic`, `TOPIC_LABEL`, `ChangeLine`, `GradedChanges`, `BriefReport` zod, caps): `@cs/email` and `apps/web` cannot import `@cs/engine` types without a cycle / client bundle. Engine `briefs/graded.ts` re-exports them and owns the DB code (§4.1 file kept).
- **P2** Major one-liners (Major events without a written item) sit before Notable lines in each topic and share the Notable cap (app 10, PDF 12, email 3 total).
- **P3** One live-lines filter `liveChanges` (engine) is used at approval, delivery, PDF render and `get_brief` (inside `withTenant`, so RLS also applies): an event leaves its line when retracted, no longer visible through `clientEvents` (competitor untracked), or cited by a dropped item. Fail closed.
- **P4** The attachment is resolved by the worker's email sender at dispatch, not stored in the outbox: `BriefEmailProps.attachPdf` marks the weekly brief; the sender re-derives the key from the notification's own brief (`briefAttachment`), renders when no current-version PDF exists, and sets `attached` before rendering the email. `deliverBrief` clears `pdf_key` when the brief goes `sent`, so a PDF rendered before send (e.g. `/files/brief` while approved) is never attached stale.
- **P5** `get_brief.changes` is filled on the `web` channel only (`null` on `mcp`/`ask`): keeps Ask/MCP output, eval cassettes and d12 redaction unchanged. Backlog item if MCP should see grades.
- **P6** Changes page `from`/`to`: page params only; the read uses the smallest `days` window covering `from`, and the page filters the returned rows to `[from, to]` (client-local days) with a "Showing changes from … to …" line and "Show all dates" link. Pagination quirk (a page may show fewer rows) accepted; no `search_events` change (§4.6).
- **P7** The scorecard is stored on every weekly brief (C1) but the email body shows it only on quiet weeks (as today); the PDF summary page always shows it; the app keeps "Where you stand" on quiet weeks only (no layout change for standard weeks).
- **P8** KPI math shared: the pure helpers of `get_workspace_overview` (`isPriceCut`, `sumPoints`, week bucketing) move to engine `workspace/kpi.ts`; a tools test pins report KPIs = overview KPIs for the same client and `now`.

## File structure
- `@cs/core`: create `src/brief-report.ts` (+test), `src/charts.ts` (+test), `src/day-range.ts` (+test); modify `src/index.ts`, `src/pdf-layout.ts` (+test), `src/help/glossary.ts`.
- `@cs/engine`: create `src/briefs/graded.ts` (+test), `src/briefs/report.ts` (+test), `src/briefs/attachment.ts` (+test), `src/workspace/{pressure,ads,kpi}.ts` (+tests moved); modify `briefs/{generate,deliver,summary,review,pdf,index}.ts`, `delivery/outbox.ts`, `src/index.ts`.
- `@cs/tools`: modify `pressure.ts`, `workspace/ads.ts` (re-export shims), `tools/overview.ts`, `tools/briefs.ts`, `tools/schemas.ts`, tests.
- `@cs/db`: new migration `<n>_brief_report.sql` + snapshot/journal; `src/schema/briefs.ts`.
- `@cs/email`: create `charts/print-line-chart.tsx`, `templates/brief-report.tsx`, `templates/report-cover.tsx`, `templates/brief-highlights.tsx` (+tests); modify `labels.ts`, `types.ts`, `document.ts`, `transport.ts`, `templates/brief.tsx`, `previews.ts`, `index.ts`.
- `apps/worker`: modify `src/deps.ts`, `src/pdf.test.ts` (data-URI proof).
- `apps/web`: modify `components/views/brief-view.tsx`, `components/charts/line-chart.tsx`, `app/(app)/c/[clientId]/changes/{params,page}.ts(x)`, `lib/format/date.ts`, `help/copy/client.ts`, `scripts/e2e-affected-rules.ts`, e2e `briefs` spec; create `components/views/graded-changes.tsx` (+test).
- Docs: `docs/help/pages/client.briefs.detail.{client,agency}.md`, `docs/work/brief-report.md`.

## Dependencies on in-flight work
- **`brief-signal` must be merged first** (O3): scoring v4 whole-business relevance (grades are meaningless before it), migration 0099, `EVIDENCE_CHANNEL_LABEL`, evidence head `[label · detected on YYYY-MM-DD · path]`, GBP guard, `rescore` (updates `event_score.score/route` in place; `scored_at` unchanged — the graded window still holds). It touches `briefs/{writer,evidence,verify}.ts`, `score/score.ts`; this branch touches `generate.ts`, `deliver.ts`, `pdf.ts`, `summary.ts`, `review.ts`.
- Task 0 re-checks every assumption against the merged code; any mismatch is fixed in this plan's interfaces before Task 1.

## Review focus (each has an owning test)
1. **A week with 200+ changes** — grouping keeps lines bounded, caps hold on every surface, the email stays one-line rows, the PDF stays < 9 MB. Tests: T1b `groups 240 events into bounded lines`, T10 `caps a 240-event week at 12/12 per topic`, T12 `highlights show at most 3 lines for a 240-event week`.
2. **A client with 0 competitors** (and no ads/ranks/reviews) — report builds with empty series, sections omitted, no NaN/`undefined` in HTML, brief quiet. Tests: T4 `builds a report for a client with no competitors`, T10 `omits empty sections and prints no NaN`.
3. **Retraction (or AM drop) between approval and send** — the line and totals disappear, kind/summary follow C1, the attached PDF is rendered after the drop. Tests: T3 `liveChanges drops retracted, untracked and dropped-item events`, T5 `delivery turns a major-only brief quiet when its major event is retracted`, T13 `deliverBrief clears pdf_key; the sender renders a fresh PDF`.
4. **PDF render failing at send** — the email still goes, without attachment, with the link and the not-attached sentence; > 9 MB same. Tests: T13 `sends without attachment when the render throws`, `… when the PDF exceeds 9 MB`.
5. **A guest-link viewer** (`rm_guest`, client role, maybe no `dashboard` flag) — sees active lines only, no score/T/`upsell_tag`, no link to a page that would 404, and never another client's lines. Tests: T6 `client role gets lines without scores; mcp channel gets null`, isolation fixture for `get_brief`; T8 `hides "See all changes" without the dashboard feature`.

---

### Task 0: Pre-flight
**Goal:** Start from `main` with `brief-signal` merged; prove the plan's assumptions.
**Steps:** `git fetch && git rebase origin/main` (brief-signal merged); `pnpm install`; per-worktree test DB up (`bash scripts/local-test-db.sh start`, worktree `.env` `TEST_*`). Re-check and note mismatches in `docs/work/brief-report.md` (fix the plan's interfaces before Task 1):
- `gather.ts` `gatherBriefCandidates` predicates (`scoredAt` window, `BRIEF_EVENT_MAX_AGE_DAYS`, `featuredBefore`, cosmetic/retracted), `loadBriefClient().briefThreshold`.
- `generate.ts` commit block, `summary.ts` `finalBriefSummary`, `review.ts` `approveBriefTx`/`dropRetractedItems`, `deliver.ts` `deliverBrief`/`loadBriefView`/`briefEmailProps`, `pdf.ts`.
- `delivery/outbox.ts` `notify`/`createEmailSender`/`dispatchDue`; `@cs/email` `OutgoingEmail`, Postmark/file/memory transports; `ObjectStore.get` returns `Uint8Array | null`.
- `@cs/tools` `pressure.ts`, `workspace/ads.ts`, `workspace/scope.ts` (`clientEvents`, `eventJoin`, `liveEventCount`), `tools/overview.ts`, `tools/briefs.ts` (`get_brief` channels `web,mcp,ask`).
- `event.channels` values (`google_ads`, `meta_ads`, …), `EVIDENCE_CHANNEL_LABEL` (brief-signal).
- Next free migration number: `ls packages/db/migrations | tail -1` → use n+1 everywhere this plan says `<n>`.
- `EXPLAIN` the any-route graded read (Task 2 query) on the test DB with `event_score_client_route_idx`; record whether `(client_id, scored_at)` is needed (Task 5 adds it only if so).
**Done when:** `pnpm typecheck` (serial: `npx turbo run typecheck --concurrency=1`) green on the rebased branch; findings recorded in the work file.

### Task 1a: Grades, topics, caps, labels (pure, `@cs/core` + `@cs/email`)
**Goal:** Shared grade/topic vocabulary, caps, group phrases.
**Files:** create `packages/core/src/brief-report.ts`, `brief-report.test.ts`, `packages/core/src/day-range.ts` (+test); modify `packages/core/src/index.ts`, `packages/email/src/labels.ts` (+test).
**Interfaces (`@cs/core`):**
```ts
export const GRADES = ['major', 'notable', 'minor'] as const; export type Grade = (typeof GRADES)[number];
export const GRADE_LABEL: Record<Grade, string> = { major: 'Major', notable: 'Notable', minor: 'Minor' };
export const REPORT_TOPICS = ['reviews', 'ads', 'rankings', 'offers', 'moves'] as const; export type ReportTopic = (typeof REPORT_TOPICS)[number];
export const TOPIC_LABEL: Record<ReportTopic, string> = { reviews: 'Reviews & rating', ads: 'Ads', rankings: 'Map rankings', offers: 'Website, prices & services', moves: 'Moves' };
export const gradeFor = (score: number, t: number): Grade => (score >= t ? 'major' : score >= t / 2 ? 'notable' : 'minor');
export const topicOf = (changeType: string): ReportTopic; // rating_change, review_spike → reviews; ad_started, ad_stopped → ads; rank_change → rankings; else offers
export const ChangeLine = z.object({ grade: z.enum(GRADES), topic: z.enum(REPORT_TOPICS), competitorId: z.uuid(), competitorName: z.string(), changeType: z.string(), channel: z.string().nullable(), count: z.number().int().min(1), text: z.string().max(400), firstAt: z.iso.datetime(), lastAt: z.iso.datetime(), eventIds: z.array(z.uuid()).min(1), evidenceIds: z.array(z.uuid()) });
export const GradeTotals = z.object({ major: z.number().int(), notable: z.number().int(), minor: z.number().int() });
export const GradedChanges = z.object({ v: z.literal(1), threshold: z.number(), lines: z.array(ChangeLine), totals: GradeTotals });
export const GradedChangesView = z.object({ lines: z.array(ChangeLine), totals: GradeTotals }); // no threshold/score
// every zod const also exports its same-named `z.infer` type
export const REPORT_CAPS = { app: { lines: 10, minor: 20 }, pdf: { lines: 12, minor: 12 }, emailLines: 3 } as const; // `lines` = Major one-liners + Notable (P2)
export function capTopic(lines: ChangeLine[], topic: ReportTopic, caps: { lines: number; minor: number }): { lines: ChangeLine[]; moreLines: number; minor: ChangeLine[]; moreMinor: number };
export function totalsOf(lines: ChangeLine[], writtenMajorEvents: number): GradeTotals; // event counts (line.count), + written items' live events to major
export function formatDayRange(firstIso: string, lastIso: string, tz: string): string; // "Nov 3" | "Nov 3–6" | "Oct 30 – Nov 2"
```
`@cs/email` `labels.ts`: `GROUP_PHRASE: Record<string, (channel: string | null) => string>`, `groupPhrase(type, channel, count)`.
**Decided copy — `GROUP_PHRASE` (count ≥ 2, `${count} ${phrase}`):** price_change "price changes"; promo "new promotions"; new_service "new services"; service_removed "services removed"; service_area_change "service area changes"; new_location "new locations"; hiring "new job posts"; ad_started google_ads "Google ads started", meta_ads "Meta ads started", else "new ads"; ad_stopped "Google ads stopped" / "Meta ads stopped" / "ads stopped"; review_spike "complaint spikes in reviews"; rating_change "rating changes"; rank_change "local ranking changes"; tier_change "tier changes"; content "website changes"; fallback `${label} changes` (label = `CHANGE_LABELS[type]` lower-case, else humanised).
**Tests (TDD):** core `gradeFor boundaries` (T=40: 40→major, 39.9→notable, 20→notable, 19.9→minor; T=30: 15→notable); `topicOf maps every CHANGE_LABELS key`; `capTopic splits shown/more per grade, majors before notable`; `totalsOf counts events and adds written majors`; `formatDayRange same day / same month / across months / tz shift`; email `GROUP_PHRASE has an entry for every CHANGE_LABELS key`, `ad phrases name Google and Meta by channel`.
**Done when:** `pnpm --filter @cs/core exec vitest run brief-report day-range`; `pnpm --filter @cs/email exec vitest run labels`.

### Task 1b: Grouping (`@cs/engine`, pure)
**Goal:** Deterministic line building from gradable events.
**Files:** create `packages/engine/src/briefs/graded.ts`, `graded.test.ts`.
**Interfaces:** `graded.ts`: re-export the core names; `export interface GradableEvent { eventId; competitorId; competitorName; changeType; channel: string | null; score: number; summary: string; occurredAt: Date; evidenceIds: string[] }`; `export function groupChanges(rows: GradableEvent[], threshold: number): ChangeLine[]`.
**Behaviour (full code — grouping):**
```ts
const SUMMARY_MAX = 140;
const clip = (s: string) => { const cp = [...s.replace(/\s+/g, ' ').trim()]; return cp.length > SUMMARY_MAX ? `${cp.slice(0, SUMMARY_MAX - 1).join('')}…` : cp.join(''); };
export function groupChanges(rows: GradableEvent[], threshold: number): ChangeLine[] {
  const groups = new Map<string, { grade: Grade; rows: GradableEvent[] }>();
  for (const r of rows) {
    const grade = gradeFor(r.score, threshold);
    const k = `${grade}|${r.competitorId}|${r.changeType}|${r.channel ?? ''}`;
    const g = groups.get(k) ?? { grade, rows: [] };
    g.rows.push(r); groups.set(k, g);
  }
  const lines = [...groups.values()].map(({ grade, rows: rs }) => {
    const sorted = [...rs].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.eventId.localeCompare(b.eventId));
    const first = sorted[0]!, last = sorted[sorted.length - 1]!;
    const text = rs.length === 1
      ? `${first.competitorName}: ${changeTypeLabel(first.changeType)} — ${clip(first.summary)}`
      : `${first.competitorName}: ${groupPhrase(first.changeType, first.channel, rs.length)}`;
    return { line: { grade, topic: topicOf(first.changeType), competitorId: first.competitorId, competitorName: first.competitorName, changeType: first.changeType,
      channel: first.channel, count: rs.length, text, firstAt: first.occurredAt.toISOString(), lastAt: last.occurredAt.toISOString(),
      eventIds: sorted.map((r) => r.eventId), evidenceIds: [...new Set(sorted.flatMap((r) => r.evidenceIds))].sort() } satisfies ChangeLine,
      max: Math.max(...rs.map((r) => r.score)) };
  });
  const gi = (g: Grade) => GRADES.indexOf(g), ti = (t: ReportTopic) => REPORT_TOPICS.indexOf(t);
  return lines.sort((a, b) => gi(a.line.grade) - gi(b.line.grade) || ti(a.line.topic) - ti(b.line.topic) || b.max - a.max
    || b.line.lastAt.localeCompare(a.line.lastAt) || a.line.competitorName.localeCompare(b.line.competitorName, 'en') || a.line.changeType.localeCompare(b.line.changeType)).map((x) => x.line);
}
```
**Tests (TDD):** `single event line uses label and clipped summary`; `six stopped Google ads → "Lakeview: 6 Google ads stopped"`; `Google and Meta ads stay separate lines`; `same competitor+type split by grade`; `sort is grade, topic, max score, lastAt`; `deterministic for shuffled input`; `groups 240 events into bounded lines` (≤ competitors × types × channels × 3, every eventId exactly once); `line text contains no number absent from the stored summary or count`.
**Done when:** (engine dir) `npx vitest run src/briefs/graded`.

### Task 2: Move overview helpers into `@cs/engine`
**Goal:** Engine can compute pressure, ad series and KPIs without importing tools; tools behaviour unchanged.
**Files:** create `packages/engine/src/workspace/{scope,pressure,ads,kpi}.ts` (+ moved tests); modify `packages/engine/src/index.ts`; `packages/tools/src/pressure.ts`, `workspace/ads.ts`, `workspace/scope.ts` → re-export shims from `@cs/engine`; `tools/overview.ts` uses `kpi.ts`.
**Interfaces:** unchanged signatures: `pressureByClient(tx: Tx | Db, clientIds, now)`, `MOVE_LABELS`, `combinePressure`, `PRESSURE_WINDOW_DAYS`, `adWeeklySeries(db, competitorIds, now, weeks)`, `clientEvents(clientId)`, `eventJoin`, `liveEventCount`. New `kpi.ts`: `isPriceCut(f: NumericChange): boolean`, `sumPoints(points): number | null`, `weekIndex(now: Date, at: Date, weeks: number): number`, `weeklyCounts(rows: { scoredAt: Date }[], now: Date, weeks: number): number[]`.
**Behaviour:** pure move; the "twin of `adActivity`" comment now sits beside `adActivity` in the same package. `@cs/tools` keeps its import paths via shims (no importer edits). Engine barrel stays node-only (client components never import `@cs/engine`).
**Follow pattern:** `packages/tools/src/pressure.ts` (moved verbatim), `briefs/scorecard.ts` (engine service-DB reads).
**Tests:** moved tests pass unchanged; `tools overview KPIs unchanged` (existing `overview.test.ts`).
**Done when:** (engine dir) `npx vitest run src/workspace`; `pnpm --filter @cs/tools exec vitest run overview pressure competitor-profile portfolio moves events`.

### Task 3: Graded reader and live-lines filter
**Goal:** Read the period's gradable events from the service DB; filter stored lines at read/delivery time (C2).
**Files:** modify `packages/engine/src/briefs/graded.ts`, `graded.test.ts`, `briefs/index.ts`.
**Interfaces:**
```ts
export async function gradedChanges(deps: { db: Db }, c: BriefClient, period: { start: Date; end: Date }, writtenEventIds: Set<string>): Promise<GradedChanges>;
export async function liveChanges(conn: Conn, clientId: string, changes: GradedChanges, opts: { activeItemEventIds: string[]; droppedItemEventIds: string[] }): Promise<z.infer<typeof GradedChangesView>>;
const regroupText = (l: ChangeLine, n: number): string; // n ≥ 2 → group phrase with n; n = 1 → `${name}: ${changeTypeLabel(type)}` (the dropped events' summaries are never reused)
```
**Behaviour:**
- Source rows exactly §4.1: `event_score.client_id = c.id`, any route, `scored_at ∈ (start, end]`, `retracted_at IS NULL`, `change_type <> 'cosmetic'`, `occurred_at > end − BRIEF_EVENT_MAX_AGE_DAYS`, `NOT featuredBefore`, not in `writtenEventIds`, competitor in `client_competitor` for the client. `channel` = `event.channels[0] ?? null`. Evidence ids only (no evidence text load). `summary` = stored `event.summary` (already `redactForModel`-redacted at tag time; never re-sent to a model).
- Major events without a written item stay as `major` lines (§6.5). `totals = totalsOf(lines, writtenEventIds.size)`.
- `liveChanges` (security-sensitive, full code): one query for live ids; works on a service tx and inside `withTenant` (RLS narrows further).
```ts
export async function liveChanges(conn: Conn, clientId: string, changes: GradedChanges, opts: { activeItemEventIds: string[]; droppedItemEventIds: string[] }) {
  const ids = [...new Set([...changes.lines.flatMap((l) => l.eventIds), ...opts.activeItemEventIds])];
  const live = ids.length === 0 ? new Set<string>() : new Set((await conn.select({ id: changeEvent.id }).from(eventScore)
    .innerJoin(changeEvent, eventJoin.change).innerJoin(clientCompetitor, eventJoin.tracked)
    .where(and(clientEvents(clientId), inArray(changeEvent.id, ids)))).map((r) => r.id));
  const dropped = new Set(opts.droppedItemEventIds);
  const lines = changes.lines.flatMap((l) => {
    const keep = l.eventIds.filter((id) => live.has(id) && !dropped.has(id));
    return keep.length === 0 ? [] : [keep.length === l.eventIds.length ? l : { ...l, count: keep.length, eventIds: keep, text: regroupText(l, keep.length) }];
  });
  return { lines, totals: totalsOf(lines, opts.activeItemEventIds.filter((id) => live.has(id)).length) };
}
```
`clientEvents`/`eventJoin` come from the engine copy created in Task 2 (`workspace/scope.ts`; tools re-exports). A line left with one event keeps no summary of another event (test pins it).
**Tests (TDD, test DB via engine fixtures):** `reads any route in the scoredAt window`; `excludes cosmetic, retracted, featured, written, too-old, untracked`; `major events without an item become major lines`; `liveChanges drops retracted, untracked and dropped-item events` (and recomputes count/text/totals); `liveChanges keeps a line identical when nothing changed`; `liveChanges with no lines and no items makes no query`.
**Done when:** (engine dir) `npx vitest run src/briefs/graded`.

### Task 4: Report data builder
**Goal:** `buildBriefReport` assembles every PDF/section datum from stored data, deterministic, service DB filtered by `client_id`.
**Files:** create `packages/engine/src/briefs/report.ts`, `report.test.ts`; modify `packages/core/src/brief-report.ts` (+ `BriefReport` zod), `briefs/index.ts`; test in `packages/tools/src/tools/overview.test.ts` (P8 parity).
**Interfaces:** `BriefReport` zod in `@cs/core` exactly §4.4 (with `ChartSeries = z.object({ key, name, points: z.array(z.number().nullable()), you: z.boolean().optional() })`, `RankMetric = z.object({ avgRank: z.number().nullable(), top3Share: z.number(), points: z.number() })`). Engine:
```ts
export async function buildBriefReport(deps: { db: Db; packs: PackLoader }, c: BriefClient, period: { start: Date; end: Date }, writtenEventIds: Set<string>): Promise<BriefReport>;
```
**Behaviour:**
- `changes` = `gradedChanges(...)`. `asOf` = `period.end`. KPIs mirror `get_workspace_overview` at `now = asOf` via Task 3 helpers (`TREND_WEEKS` = 8).
- `pressure` ≤ 5 from `pressureByClient(db, [c.id], asOf)` (name, score, level, first reason or null).
- `rating`: 12 months to `asOf` from `reviewBenchmark` monthly series, every business unfolded (`you: true` on self); the PDF folds at render (Task 10, `foldSeries(…, 5, { aggregate: 'mean', pin: [selfKey] })` from Task 9).
- `ads`: 12 weeks to `asOf`, `adWeeklySeries`. `rankings`: latest `rank_scan` `done` ≤ `asOf` + previous; ≤ 5 keywords, you vs ≤ 2 rivals by `rankMetrics` (follow `briefs/scorecard.ts`); `map` from `rank_map_image` (objectKey, bounds, size) + grid points of the latest scan for the first keyword; null when absent.
- `moves`: open (`emerging|active`, live event) ≤ 6 with `MOVE_LABELS`; `recommendations`: `todo|in_progress` ≤ 8 (`id, title, status, createdThisWeek`) — select those columns only, never `upsell_tag`; `alerts`: delivered in period ≤ 5.
- Every list sorted deterministically; every number finite (no NaN; empty arrays for no data).
**Tests (TDD):** `builds a report for a client with no competitors` (parses, empty series, rankings null, quiet changes); `report parses with the zod schema for a seeded week`; `recommendations never carry upsell_tag` (key absent); `alerts only from the period, delivered only`; `retracted events never counted in kpis or lines`; tools `report KPIs equal get_workspace_overview KPIs at the same now` (P8).
**Done when:** (engine dir) `npx vitest run src/briefs/report`; `pnpm --filter @cs/tools exec vitest run overview`.

### Task 5: Migration, store at generation, C1/C2 kind and summary
**Goal:** `brief.report` stored at generation; scorecard on every weekly brief; quiet = no written item and no live Major line, at generation, approval and delivery.
**Files:** `packages/db/src/schema/briefs.ts`; generated `packages/db/migrations/<n>_brief_report.sql` (+ meta); modify `packages/engine/src/briefs/{generate,summary,review,deliver}.ts` + tests.
**Migration (generate with `pnpm --filter @cs/db generate --name=brief_report`; expected SQL):**
```sql
ALTER TABLE "brief" ADD COLUMN "report" jsonb;
```
Plus, only if Task 0's EXPLAIN showed a seq scan / sort on the any-route read: `CREATE INDEX "event_score_client_scored_idx" ON "event_score" USING btree ("client_id","scored_at");` (declared in the Drizzle schema so the snapshot matches). No grant/RLS change: `brief` RLS covers the column, service role writes it like `trend`. No new table ⇒ no `TABLE_CLASS` change; confirm `isolation-world.test.ts` still passes.
**Interfaces:** `brief.report: jsonb('report').$type<Record<string, unknown> | null>()`. `finalBriefSummary(b, items, liveMajorEvents: number)`. `export const majorSummary = (n: number) => \`${n} major competitor change${n === 1 ? '' : 's'} this week.\`` (decided copy). Helper `loadLiveChanges(tx, briefRow): Promise<GradedChangesView | null>` (parses `report.changes`, collects active/dropped item event ids, calls `liveChanges`).
**Behaviour:**
- `generateBrief`: after verify, `report = buildBriefReport(..., writtenEventIds = events of verified items)` in try/catch (failure → `null` + `console.warn('[briefs] report skipped: …')`, never fails the brief). Scorecard built for every weekly brief (closes backlog L395). In the commit tx, after `committableItems`: `majors = report ? report.changes.lines.filter(major).reduce(count) : 0`; `kind = items > 0 || majors > 0 ? 'standard' : 'quiet'`; summary = verified / count / `majorSummary(majors)` (no items) / `QUIET_SUMMARY`. Store `report`, `scorecard` always.
- Items dropped at commit time: their events are not re-added as lines (they were excluded as written).
- `finalBriefSummary`: starting point unchanged; `active = 0 && liveMajorEvents = 0` → quiet; `active = 0 && liveMajorEvents > 0` → standard, `majorSummary`; any dropped → `countSummary(active)`; else unchanged. `approveBriefTx` and `deliverBrief` pass `liveMajor` from `loadLiveChanges` (after `dropRetractedItems`).
- `report = null` (old briefs, report failure) ⇒ `liveMajorEvents = 0`: today's behaviour.
**Tests (TDD):** db `migration adds nullable brief.report` (existing schema drift test passes, `generate` reports no changes); engine `stores report and scorecard on a standard week`; `report failure leaves the brief ready with report null`; `major-only week is standard with the major summary`; `delivery turns a major-only brief quiet when its major event is retracted`; `approval keeps standard when a written item drops but a major line lives`; `starting point unchanged`; `old brief with null report keeps today's rule`.
**Done when:** `pnpm --filter @cs/db exec vitest run schema migrations isolation-world`; (engine dir) `npx vitest run src/briefs/generate src/briefs/summary src/briefs/review src/briefs/deliver`.

### Task 6: `get_brief` returns graded changes
**Goal:** `BriefDetail.changes` for agency and client roles on the web channel, after the live filter.
**Files:** modify `packages/tools/src/tools/schemas.ts`, `tools/briefs.ts`, `tools/review.ts` (`BriefReview` gets `changes` too), `tools/briefs.test.ts`, `src/isolation/fixtures.ts` (assert only, entry exists), `access-marks` snapshot only if output keys are snapshotted.
**Interfaces:** `BriefDetail` gains `changes: GradedChangesView.nullable()`. `report` itself is never in tool output.
**Behaviour:**
- `briefDetail(deps, ctx, briefId, opts: { changes?: boolean } = {})`: `get_brief` passes `changes: meta.channel === 'web'` (P5), `get_brief_review` (web-only) passes `true`; `fetch-item` and the sample page pass nothing. `changes = null` unless requested and `brief.report` parses; else `liveChanges` inside the **same** `withTenant` transaction as the name reads (`Promise.all`, launch-gate: no new stage), with `activeItemEventIds`/`droppedItemEventIds` from all items (agency sees dropped items; their events stay out of lines for every role).
- Client roles: identical lines (O5 read-only); no score, threshold or `upsell_tag` anywhere in `changes`.
- Starting point: `changes = null`.
**Tests (TDD):** `client role gets lines without scores; mcp channel gets null` (JSON of `changes` has no `score`/`threshold`/`upsell` keys); `dropped item's events never appear as lines`; `untracked competitor's line is hidden`; `brief with report null returns changes null`; isolation suite passes with tenant B never seeing A's lines (`pnpm --filter @cs/tools exec vitest run isolation`); MCP/Ask output unchanged ⇒ `pnpm eval:replay` has no miss (if it misses, re-record in this PR, ≤ $5, `record --fill` first).
**Done when:** `pnpm --filter @cs/tools exec vitest run briefs isolation channels access-marks`; `pnpm eval:replay`.

### Task 7: Changes page `from`/`to`
**Goal:** "See all changes this week" lands on the week's changes without touching `search_events`.
**Files:** modify `apps/web/src/app/(app)/c/[clientId]/changes/params.ts`, `params.test.ts`, `page.tsx`, `page.test.tsx`, `feed.tsx` (banner only).
**Interfaces:** `ChangesParams` adds `from?: string; to?: string` (`YYYY-MM-DD`, valid calendar dates, `from ≤ to`, span ≤ 31 days, else both dropped); `ORDER` gets them after `days`; `changesHref` emits them.
**Behaviour (P6):** with `from`, the read's `days` = smallest of 7/30/90/365 whose window covers `from` (else 365); rows are kept when `localDay(occurredAt, viewer tz) ∈ [from, to]`. Banner "Showing changes from {from} to {to}." (`formatDate`) + link "Show all dates" (`changesHref` without from/to). Filter bar submits keep from/to. Empty filtered page with `hasMore` shows the existing "older" pager. No new tool, no `search_events` input change.
**Tests (TDD):** `parses valid from/to; drops reversed, malformed or > 31 days`; `changesHref round-trips from/to`; `page picks the smallest covering days window`; `rows outside the range are hidden and the banner shows`.
**Done when:** `pnpm --filter @cs/web exec vitest run changes/params changes/page changes/feed`.

### Task 8: App brief page — "Other changes this week"
**Goal:** Graded, read-only list under the Major items; Minor collapsed.
**Files:** create `apps/web/src/components/views/graded-changes.tsx`, `graded-changes.test.tsx`; modify `components/views/brief-view.tsx`, `lib/format/date.ts` (`formatDayRange` wrapper), `app/(app)/c/[clientId]/briefs/[briefId]/page.tsx` (pass `canSeeChanges = hasFeature(ctx, 'dashboard')`), `help/copy/client.ts` (tip with Task 14's decided copy), `scripts/e2e-affected-rules.ts`, `e2e/briefs*.spec.ts` (one tagged test).
**Interfaces:** `GradedChanges({ clientId, changes, timezone, periodStart, periodEnd, changesHref: string | null, evidenceHref? })` server component; `BriefView` new prop `changesLinkAllowed: boolean`.
**Behaviour:**
- Rendered only on `surface="reading"` when `brief.changes` is non-null and has ≥ 1 line. Heading `h2` "Other changes this week" + `HelpTip tip="client.briefs.detail.grades"` in `titleAside`; grade totals line ("3 Major · 7 Notable · 22 Minor").
- Per topic (`REPORT_TOPICS` order, empty topics skipped, `h3` = `TOPIC_LABEL`): `capTopic(..., REPORT_CAPS.app)`; each line: `StatusChip`/`Tag` "Major" or "Notable" (fixed neutral tint, never orange), text, `formatDayRange` in the viewer tz, `EvidenceChips` with the line's evidence ids; then `<details>` (closed) `<summary>Minor (N)</summary>` with ≤ 20 lines. Overflow: "+N more" text plus link "See all changes this week" → `changesHref(clientId, { route: 'all', from: periodStart day, to: periodEnd day })` — only when `changesLinkAllowed` (guest/client without `dashboard` gets no link: the page would 404).
- No controls, no write guard needed (read-only, O5). Tokens only; design-lint stays 0; no card-in-card (Section > rows).
**Follow pattern:** `brief-view.tsx` item rows, `components/evidence-chips.tsx`, `@cs/ui` `Section`/`StatusChip`/`Tag`.
**Tests (TDD):** `renders topics in order with Major lines before Notable`; `Minor lines are in a closed details with the count`; `caps a topic at 10 lines and shows +N more`; `hides "See all changes" without the dashboard feature`; `nothing when changes is null or empty`; `no score text in the output`; e2e `@briefs` "client sees graded changes and opens Minor" (seeded report).
**Done when:** `pnpm --filter @cs/web exec vitest run graded-changes brief-view briefs`; `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`; `bash scripts/design-lint.sh`; `bash apps/web/scripts/profile-gate.sh --seed` (brief page ≤ 8 DB stages).

### Task 9: Shared chart logic + print line chart
**Goal:** One chart-role rule for web and print; a static SVG line chart for the PDF.
**Files:** create `packages/core/src/charts.ts`, `charts.test.ts`; modify `apps/web/src/components/charts/line-chart.tsx` (imports from core, re-exports `foldSeries`/`ChartSeries` for existing callers); create `packages/email/src/charts/print-line-chart.tsx`, `print-line-chart.test.tsx`.
**Interfaces (`@cs/core`):** `ChartSeries`; `foldSeries(series, max?, opts?: FoldOptions)` (moved verbatim); `chartRole(s, all, { lowerIsBetter? }): 'you' | 'rival1' | 'rival2' | 'context'` (= today's `seriesColor` rule); `niceMax(v)`; `yTicks(max, n)`; `linePath(points: (number|null)[], x: (i) => number, y: (v) => number): string` (breaks at nulls). Web: `seriesColor = (s, all, o) => ROLE_VAR[chartRole(s, all, o)]`. Email: `PRINT_ROLE_HEX = { you: '#2A6BAC', rival1: '#E05A2B', rival2: '#14936A', context: '#A3B1C2' }`; `PrintLineChart({ title, labels: string[], series: ChartSeries[], lowerIsBetter?, width = 640, height = 220, yFormat? })`.
**Behaviour:** static SVG, `role="img"`, `aria-label` = title + latest values per series; legend as text rows (name + swatch), "(you)" marker; grid `#EDF1F5`, axis text `#5B6B80`; you drawn last (on top); nulls break lines; all-null series → legend says "no data yet"; no JS, no external refs. Run the dataviz skill's palette check on the print hexes on white; record the result in the work file.
**Tests (TDD):** core `chartRole matches the old seriesColor for ≤2 and >2 rivals, lowerIsBetter, other`; `foldSeries unchanged` (moved tests); `linePath breaks at nulls`; web `line-chart` tests unchanged; email `print chart has role img and aria-label`, `uses role hexes`, `renders no NaN for all-null series`.
**Done when:** `pnpm --filter @cs/core exec vitest run charts`; `pnpm --filter @cs/web exec vitest run line-chart`; `pnpm --filter @cs/email exec vitest run print-line-chart jsx-pragma`.

### Task 10: PDF report document (cover, summary, topic sections)
**Goal:** `renderBriefPdf` produces the layout-"C" report for weekly briefs with a report; old weekly briefs get cover + today's body; starting points unchanged.
**Files:** create `packages/email/src/templates/report-cover.tsx`, `templates/brief-report.tsx`, `brief-report.test.ts`; modify `types.ts` (`BriefReportDocumentProps`), `document.ts` (`renderBriefReportDocument`), `index.ts`, `previews.ts` (`document.brief_report`, `document.brief_report_quiet`, `document.brief_legacy_cover`); `packages/engine/src/briefs/pdf.ts`, `pdf.test.ts`; `packages/core/src/pdf-layout.ts` (6) + test.
**Interfaces:** `BriefReportDocumentProps = { branding; clientName; deliveryDate; periodLabel: string; kind; summary; items: (BriefEmailItem & { topic: ReportTopic })[]; changes: GradedChangesView | null; report: BriefReport | null; scorecard: ScorecardModel | null; trend: TrendSnapshot | null; timezone: string; mapImage: { dataUri: string; attribution: string } | null; legacy?: BriefEmailProps }`. Engine `briefReportProps(v: BriefDeliveryView, live: GradedChangesView | null, mapImage)`; `loadBriefView` adds `timezone` (client tz). Item topic = topic of its first event's type (move items → `moves`).
**Behaviour:** order §4.8 1–9 with `break-before: page` per section (short sections may share a page); cover: logo (allow-listed as today), agency name, "Weekly competitor report", client name, "Week of {deliveryDate}", ink band from `Branding`. Summary: 4 KPI tiles (titles as `kpiCards`), summary, "Top move" (first Major headline, else "No major moves this week"), "Next steps" (Major items' actions, else open recommendations, ≤ 3), "Competitive pressure" bars (≤ 5, no numbers beyond what the overview shows), grade totals line, "Where you stand" scorecard. Topic sections: chart (`PrintLineChart`), `TrendTable` on Reviews, Major items (headline + What changed + Why it matters + What to do, no links), then lines via `capTopic(..., REPORT_CAPS.pdf)`, overflow "+N more in your dashboard", "No changes this week." when the topic has a chart but no change. A section with neither data nor changes is omitted. No feedback line, no contact block, no Ask, no "Rival Monday", no link targets. PDF metadata title "{client} — weekly competitor report {date}", subject "Weekly competitor report", author agency display name. `PDF_LAYOUT_VERSION = 6`.
**Tests (TDD):** `cover names the agency and never Rival Monday` (whole HTML: no `/rival\s*monday/i`); `omits empty sections and prints no NaN` (0-competitor report); `caps a 240-event week at 12/12 per topic`; `no upsell_tag, score or threshold in the HTML`; `old brief (report null) renders cover + legacy body`; `starting point renders exactly the old document`; engine `renderBriefPdf uses the report document and the new title`; core `PDF_KEY_SUFFIX is .v6.pdf`; demo coverage test re-run (`pnpm --filter @cs/demo exec vitest run coverage` — old keys re-render).
**Done when:** `pnpm --filter @cs/email exec vitest run brief-report previews jsx-pragma`; (engine dir) `npx vitest run src/briefs/pdf`; `pnpm --filter @cs/core exec vitest run pdf-layout`.

### Task 11: Map rankings section with an inlined image
**Goal:** The Stadia map renders inside the network-blocked PDF.
**Files:** modify `apps/worker/src/pdf.test.ts` (first), `packages/email/src/templates/brief-report.tsx`, `packages/engine/src/briefs/pdf.ts`, tests.
**Behaviour:**
- **First** a renderer test: `data: image/png URI renders while every request is aborted` — render HTML with a 2×2 PNG `data:` URI and an `https://example.invalid/x.png` image under `createPdfRenderer`, assert the route handler saw no `data:` request and the PDF bytes contain an image XObject (`/Subtype /Image`) — only the data one. **If it fails** (data URIs intercepted/blocked): the map image is omitted (keyword table only) and the plan's map bullet is dropped; record it in the work file. Do not widen `allowUrls`.
- Engine: `mapImage` = `store.get(report.rankings.map.objectKey)`; refuse > 400 KB or non-PNG/JPEG magic bytes (→ null, log `[briefs] map image skipped`); `data:image/png;base64,…`. Key comes from `rank_map_image` of this client only (the report was built from it); never a user-supplied URL.
- Template: image + SVG overlay of rank dots projected with `@cs/core` geo projection from `bounds`/`width`/`height` (follow `apps/web/src/components/charts/geo-grid.tsx`), dot labels = rank or "–"; `STADIA_ATTRIBUTION` caption; keyword table you vs ≤ 2 rivals vs previous scan. Section omitted without a scan.
**Tests (TDD):** worker data-URI test above; email `map section has image, overlay and attribution`; `no map image ⇒ table only`; engine `oversized or non-image object ⇒ mapImage null`.
**Done when:** `pnpm --filter @cs/worker exec vitest run src/pdf`; `pnpm --filter @cs/email exec vitest run brief-report`; (engine dir) `npx vitest run src/briefs/pdf`.

### Task 12: Email highlights
**Goal:** Short weekly email per §4.7; previews for sign-off.
**Files:** create `packages/email/src/templates/brief-highlights.tsx`, `brief-highlights.test.ts`; modify `templates/brief.tsx`, `types.ts`, `previews.ts`; `packages/engine/src/briefs/deliver.ts` (`briefEmailProps`).
**Interfaces:** `BriefEmailProps` adds `highlights?: BriefHighlights | null; attachPdf?: boolean; attached?: boolean`; `BriefHighlights = { totals: GradeTotals; lines: { grade: 'major' | 'notable'; text: string; dates: string }[]; moreLines: number; minor: number }`. Engine `briefHighlights(live: GradedChangesView, tz): BriefHighlights` (lines: Major one-liners then Notable, ≤ `REPORT_CAPS.emailLines`).
**Behaviour:** weekly briefs with `highlights` render the highlights body in the email variant; scorecard only on quiet weeks (P7); trend table not in the email. Without `highlights` (old brief) the current body is unchanged. Decided copy: heading "Highlights"; stat line `${major} Major · ${notable} Notable · ${minor} Minor changes`; Major items "{n}. {headline}" + "What changed: …" + "See the evidence" link; lines "{Grade}: {text} ({dates})"; `+ ${n} minor change${n === 1 ? '' : 's'}` (only when > 0); `+ ${moreLines} more notable change${…}` when over the cap; attachment line `attached ? 'Your full report is attached (PDF).' : 'Your full report is ready to download as a PDF.'`; then "Open in your dashboard" button, "Download as PDF" link (fallback), feedback line, contact block. The email's "See all changes this week" is the `brief` link (button). Phone-safe: one-line rows, no tables.
**Tests (TDD):** `highlights show at most 3 lines for a 240-event week`; `stat line counts`; `attached and not-attached sentences`; `quiet week with notable lines keeps the quiet intro`; `old brief without highlights renders today's body`; `no Rival Monday, scores or upsell in the email`; previews `brief.highlights`, `brief.quiet_highlights`, `brief.highlights_not_attached` exist (exhaustiveness test).
**Done when:** `pnpm --filter @cs/email exec vitest run brief brief-highlights previews`; (engine dir) `npx vitest run src/briefs/deliver`.

### Task 13: PDF attachment at dispatch
**Goal:** Weekly brief emails carry the PDF; any failure falls back to the link.
**Files:** modify `packages/email/src/transport.ts` (+test), `packages/engine/src/delivery/outbox.ts` (+test), create `packages/engine/src/briefs/attachment.ts` (+test); modify `briefs/deliver.ts`, `briefs/pdf.ts` (`ensureBriefPdf`), `apps/worker/src/deps.ts`.
**Interfaces:** `export interface OutgoingAttachment { name: string; contentType: 'application/pdf'; content: Uint8Array }`; `OutgoingEmail.attachments?: OutgoingAttachment[]`; Postmark body `Attachments: [{ Name, Content: base64, ContentType }]`; file transport writes `<id>-<i>.pdf` beside the `.json` and lists names; memory keeps them. `createEmailSender({ transport, fromAddress, attachment?: (n: NotificationRow) => Promise<OutgoingAttachment | null> })`. `ensureBriefPdf(deps: PdfDeps, briefId): Promise<string | null>`. `MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024`.
**Behaviour:**
- `deliverBrief`: email props `attachPdf: kind !== 'starting_point'`; the `sent` update also sets `pdfKey: null` (P4). The hourly `brief-pdf` catch-up stays.
- Sender: if `p.template === 'brief' && p.props.attachPdf`, call `attachment(n)`; `p.props.attached = !!att`; render; send with `attachments: att ? [att] : undefined`. Resolver errors never fail the send.
- Resolver (security-sensitive, full code):
```ts
export function briefAttachment(deps: PdfDeps) {
  return async (n: NotificationRow): Promise<OutgoingAttachment | null> => {
    try {
      if (n.kind !== 'brief' || n.subjectType !== 'brief' || !n.clientId) return null;
      const [b] = await deps.db.select({ id: brief.id, kind: brief.kind, status: brief.status, deliveryDate: brief.deliveryDate, clientName: client.name })
        .from(brief).innerJoin(client, eq(client.id, brief.clientId))
        .where(and(eq(brief.id, n.subjectId), eq(brief.agencyId, n.agencyId), eq(brief.clientId, n.clientId)));
      if (!b || b.kind === 'starting_point' || b.status !== 'sent') return null;
      const key = await ensureBriefPdf(deps, b.id);
      if (key !== briefPdfKey(n.agencyId, b.id)) return null; // only this brief's current-version PDF, never another key
      const bytes = await deps.store.get(key);
      if (!bytes || bytes.byteLength > MAX_ATTACHMENT_BYTES) { console.warn(`[briefs] pdf attach failed: ${b.id}: ${bytes ? 'too large' : 'missing'}`); return null; }
      return { name: attachmentName(b.clientName, b.deliveryDate), contentType: 'application/pdf', content: bytes };
    } catch (err) {
      console.warn(`[briefs] pdf attach failed: ${n.subjectId}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };
}
export const attachmentName = (clientName: string, date: string): string => {
  const safe = clientName.normalize('NFKC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Client';
  return `${safe} weekly report ${date}.pdf`;
};
```
- Worker `deps.ts`: email sender gets `attachment: briefAttachment({ db: getDb(), store: getStore(), pdf: getPdf() })`. Rendering happens at most once per brief (later recipients reuse `pdf_key`).
**Tests (TDD):** transport `postmark sends Attachments base64`, `file outbox writes the pdf`; engine `deliverBrief clears pdf_key; the sender renders a fresh PDF`; `sends without attachment when the render throws`; `… when the PDF exceeds 9 MB`; `never attaches for a starting point, an alert, or another agency's brief`; `attachmentName strips path and control characters`; `attached flag reaches the rendered email`.
**Done when:** `pnpm --filter @cs/email exec vitest run transport`; (engine dir) `npx vitest run src/briefs/attachment src/briefs/deliver src/delivery/outbox`; `pnpm --filter @cs/worker exec vitest run deps`.

### Task 14: Help, glossary, copy ledger
**Goal:** Every new client-facing string is documented and pending owner sign-off.
**Files:** modify `apps/web/src/help/copy/client.ts`, `packages/core/src/help/glossary.ts` (+ `glossary.test.ts` passes), `docs/help/pages/client.briefs.detail.client.md`, `client.briefs.detail.agency.md`; run `pnpm kb:seed` locally only if the guide test requires.
**Decided copy:**
- Tip `client.briefs.detail.grades` (`// source: packages/core/src/brief-report.ts:gradeFor`): title "Major, Notable and Minor"; body "Every competitor change this week gets a grade. Major changes matter most to {client} and are written up above with what to do. Notable changes are worth knowing about. Minor changes are listed for completeness and folded away. Grades are worked out the same way every week."
- Glossary (no placeholders; `audience: 'all'`; `seeAlso: ['change', 'brief']`): `major-change` "Major change" — "A competitor change that clears the bar for the weekly brief. It is written up with why it matters and what to do."; `notable-change` "Notable change" — "A competitor change that reaches at least half the brief's bar. It is listed in one line in the brief and the weekly report, without advice."; `minor-change` "Minor change" — "A competitor change below half the brief's bar. It is listed for completeness and folded away by default."
- Guides: client guide adds a "Other changes this week" paragraph (grades, Minor folded, read-only, the attached PDF report); agency guide adds that lines cannot be hidden one by one (retraction is the only recourse, O5) and that grades follow the client's brief threshold.
- Changes banner: "Showing changes from {from} to {to}." / "Show all dates".
**Behaviour:** new strings appear as pending in `pnpm copy:review` (owner signs; never edit `docs/copy/signoff.json` by hand). Client roles never get agency help (guide audience files as today).
**Tests:** `help/coverage.test.ts`, `help/copy/copy.test.ts`, core `glossary.test.ts` (no placeholders), `help/copy-bundle.test.ts`.
**Done when:** `pnpm --filter @cs/web exec vitest run help`; `pnpm --filter @cs/core exec vitest run glossary`.

### Task 15: Docs and owner verification
**Goal:** Work file ready for merge; final gates.
**Files:** `docs/work/brief-report.md` only (shared docs change at `/rm-merge`).
**Behaviour:** Status/Next/Interfaces; new backlog: "(later) agency hide control for single lines (O5)", "(later) graded changes on MCP/Ask (P5)", "(later) `search_events` date bounds if the Changes week view misleads (P6)". Owner verification steps:
1. `pnpm db:migrate` on cs_dev; `SELECT count(*) FROM brief WHERE report IS NOT NULL;` grows after the next Thursday run.
2. `pnpm copy:review`: sign the tip, glossary, highlights, report and banner strings (previews `brief.highlights`, `brief.quiet_highlights`, `brief.highlights_not_attached`, `document.brief_report*`).
3. `pnpm --filter @cs/worker deliver-once --brief <id> pdf` on cs_dev; open the PDF on a phone and print it: cover shows the agency only; metadata (File → Properties) names the agency.
4. Staging: one live week after brief-signal's re-score; open the email on a phone (attachment present, one-line rows), the app brief page (Minor folded), "See all changes this week".
5. Old PDFs re-render once at v6 when opened.
**Final review (controller):** `pnpm test:affected`; `pnpm --filter @cs/web e2e:affected`; `bash apps/web/scripts/profile-gate.sh --seed`; `pnpm eval:replay`; `bash scripts/design-lint.sh`; `git ls-files --eol | grep crlf` empty; `iconv -f utf-8 -t utf-8` over changed files.
**Done when:** all of the above green; work file committed.
