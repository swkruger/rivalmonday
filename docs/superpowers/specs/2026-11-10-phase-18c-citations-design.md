# Phase 18c-1 — Directory listings (citations) (design)

**Date:** 2026-11-10 · **Branch:** `phase-18c` · **Brief:** `docs/work/phase-18c.md`
Core spec §1.5, §2.2, §4.3, §4.4, §6.2/§6.3, §6.5, §8.2, §8.5, §10.5. New decisions only.

## Intent
Owner: find the client's missing or wrong citations; a rival's new listing is a Minor change. 18c-1 uses
**Google results only**: listed per vertical directory, and do title/snippet show the same name and phone.

**Anti-goals:** no mismatch without evidence; never "not listed"; no listing-page reads; no Yelp/Healthgrades/Zocdoc/Nextdoor data; no vendor name.

## Decisions
| # | Decision |
|---|---|
| C1 | **Scope:** presence + name/phone from organic results (existing `/serp/google/organic/live/advanced`). Address **not checked** (no column). 18c-2 = backlog after prod + `/bot` + `WEB_MONITORING_ENABLED`. |
| C2 | **Two searches per business.** Stage 1: `"<name>" "<NNN-NNN-NNNN>"`, US-wide, depth **20** ($0.004); hosts read from results and classified against the catalogue. Stage 2 (B2): **one** `"<name>" <city>` search (no city when null), depth 20 ($0.004), classifying every catalogue host stage 1 missed; no `site:` (the vendor ignores it, bills $0.01). Host still absent = `not_found`. No phone (or stage 1 failed) → stage 1 skipped, `phone_match` null. |
| C3 | **Task 0 probe: done** (2026-11-10, $0.078). Recall 67 % (≥ 50 %); depth 50 failed (40101) → depth 20; Bing Places and Apple Maps had 0 hits → removed; `site:` ignored (B2). Details: work file § Task 0 results. |
| C4 | **Directory groups (owner 2026-11-10).** `generic.yaml` defines `citations.directory_groups` (`general`, `home_services`, `dental_health`); each vertical picks `citations.groups`. Shipped: hvac_plumbing = general + home_services, dental = general + dental_health; DB verticals default `[general]` (inherited via `assemblePack`), operators tick groups when reviewing a vertical. Catalogue = union of picked groups (≤ 15 hosts). Never search a directory the vertical didn't pick. Google is the source, not a directory. |
| C5 | **Storage (ours):** global `citation_listing` (competitor × host, public facts, RLS like `gbp_post`) + tenant `citation_audit_run` (cadence, cost, "checked on"). Self and rivals in one table. |
| C6 | **Matching (ours, deterministic, no model).** Host (B1): organic `url`/`domain` are google.com/goto wrappers, so `parseSerp` sets `domain` from `breadcrumb` (`https://www.angi.com › TX › Granbury` → `angi.com`), else a `WEBSITE_NAME_HOSTS` map (`website_name` "Facebook" → facebook.com, "Angie's List" → angi.com …), else keeps the vendor domain; `listing_url` = `https://<host>` + the breadcrumb path when parseable, else `https://<host>` (goto links expire). Candidate = an organic item on a catalogue host (subdomains count); `nameHit` = `normaliseName(title before " - "/" \| ", city)` contains every token of `normaliseName(name, city)`, or the reverse. `phoneHit` = title+description hold the business's phone. **Listed (B3)** = `phoneHit`, or `nameHit` ∧ the city appears in title/snippet (same-name businesses elsewhere are common); no city known → `nameHit` alone. `name_match` (B4): true if `nameHit`; **false only if** the snippet holds exactly one phone, it is the business's, `¬nameHit` and the title is not a category page; else null. `phone_match` true if `phoneHit`; **false only if** `nameHit` ∧ the snippet holds a US phone with other digits; else null. |
| C7 | **Change type `citation_added`** (pack scoring v7): a **tracked rival** newly found (`listed` after an earlier completed audit had `not_found` for that host). First audit = silent baseline. Self: none (§6.5). No two-audit hold (monthly cadence; wording "now found"). Listed → not_found: none. |
| C8 | **Minor, brief-only (ours):** deterministic score = `thresholds.brief / 4`, route **always `archive`** (factor `citationMinor`). `gradedChanges` reads every route → a **Minor** line (T > 0), grouped per rival; never an item, alert or live Major. |
| C9 | **Client-facing:** self-rule `citation_gap` + play `fix_citations` (add-listing links; no prefilled NAP); page **Listings** (`/c/<id>/listings`); tool `get_citation_audit` (web, MCP, Friday). No scorecard row. |
| C10 | **Cadence:** first audit once `client_setup.competitors_done_at` is set (or no setup row = staff/legacy client), then every 30 days. Audited = self + **Top-rival tier** (`competitor_signal.tier = 'top'`, by `overlap`, ≤ 3). No "check now". A competitor checked < 25 days ago (any client) is reused, not searched. |
| C12 | **"Also found on" (owner 2026-11-10).** Stage-1 hits on hosts outside the catalogue are kept as `in_catalogue = false` rows when **both** `nameHit ∧ phoneHit` (stricter than C6), host ≠ the business's own domain, not banned, not in `NOT_DIRECTORY_HOSTS` (google.*, youtube.com, wikipedia.org, the client's own site); ≤ 10 per business. Informational only: no gap, no recommendation, no event, self only on the page. OPS.md SQL lists common uncatalogued hosts to promote (platform page = backlog). |
| C11 | **Channel (ours):** `CHANNELS` += `'directories'` ("Online directories"); capture `source 'directories'` under the audited competitor; not in `vendor-diff` `DIFFERS`. |

## Interfaces (binding)

### Pack (`packages/verticals/src/schema.ts`, `packs/*.yaml`)
```ts
const directory = z.strictObject({ host: z.string().regex(/^[a-z0-9.-]+$/), label: z.string().min(1), add_listing_url: z.url() });
citations: z.strictObject({
  directory_groups: z.record(z.enum(['general','home_services','dental_health']), z.array(directory)).optional(), // generic.yaml only
  groups: z.array(z.enum(['general','home_services','dental_health'])).min(1).default(['general']),
  min_missing: z.number().int().min(1).default(3),
}).default({ groups: ['general'], min_missing: 3 }),
// citationCatalogue(pack): Directory[] = union of picked groups, unique hosts, ≤ 15 (assembled-pack refine)
```
Refine: hosts in `BANNED_CITATION_HOSTS = ['yelp.com','healthgrades.com','zocdoc.com','nextdoor.com']` are a schema error.
Starting lists (labels OK in client text; `add_listing_url` hand-checked at Task 0):
- **general** group: facebook.com (Facebook), bbb.org (Better Business Bureau), yellowpages.com (Yellow Pages), manta.com (Manta),
  foursquare.com (Foursquare), mapquest.com (MapQuest). Bing Places and Apple Maps removed at Task 0 (no search hits, C3).
- **home_services** group: angi.com (Angi), homeadvisor.com (HomeAdvisor), thumbtack.com (Thumbtack), houzz.com (Houzz), porch.com (Porch).
- **dental_health** group: findadentist.ada.org (ADA Find-a-Dentist). Review-hosting/booking health directories (WebMD Care, Vitals, Sharecare, Opencare) are out (§2.2 spirit).

### Migration `0107_citations` (next free number at execution time)
```sql
CREATE TABLE citation_listing (
  competitor_id uuid NOT NULL REFERENCES competitor(id) ON DELETE CASCADE,
  host text NOT NULL,
  status text NOT NULL CONSTRAINT citation_listing_status_check CHECK (status IN ('listed','not_found','not_checked')),
  name_match boolean, phone_match boolean,
  listing_url text, listing_title text,
  shown_phone text,                    -- digits shown when phone_match = false (evidence-backed), else null
  capture_id uuid REFERENCES capture(id),
  newly_found_at timestamptz,          -- set on not_found → listed (catalogue rows); read by the diff
  first_seen_at timestamptz, last_seen_at timestamptz,   -- listed spans
  in_catalogue boolean NOT NULL DEFAULT true,   -- false = "Also found on" (C12)
  checked_at timestamptz NOT NULL,
  PRIMARY KEY (competitor_id, host)
);
REVOKE INSERT, UPDATE, DELETE ON citation_listing FROM app_user;
ALTER TABLE citation_listing ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_listing FORCE ROW LEVEL SECURITY;
CREATE POLICY citation_listing_visible ON citation_listing FOR SELECT USING (app_competitor_visible(competitor_id));

CREATE TABLE citation_audit_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL, client_id uuid NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('setup','monthly')),
  status text NOT NULL CHECK (status IN ('running','done','capped','failed')),
  competitor_ids uuid[] NOT NULL, calls int NOT NULL DEFAULT 0, est_usd numeric(8,4) NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX citation_audit_run_one_live ON citation_audit_run (client_id) WHERE status = 'running';
CREATE INDEX citation_audit_run_client_idx ON citation_audit_run (client_id, started_at DESC);
-- RLS/grants: identical to serp_snapshot (tenant_client).
-- backfill (pattern 0101, idempotent): shipped packs get type_weights.citation_added 0.3, scoring.version 7,
-- citations block, self_rules citation_gap + playbooks fix_citations (appended when absent).
```
`TABLE_CLASS`: `citation_listing: 'global_public'`, `citation_audit_run: 'tenant_client'` + world rows. Regenerate `catalog-seed.sql.ts`.

### Collector (`packages/collectors/src/citations/`, new)
- `parseSerp` organic items gain `description: string | null` and a real-host `domain` (C6/B1; also fixes 18b-2 matching); `citationSearch(dfs, q: { query: string; depth: 20 }, scope: CallScope)` = US-wide `serpSearch` variant, never `site:` queries.
- `matchListing(items: SerpOrganicItem[], host: string, biz: { name: string; phone: string | null; city: string | null }): ListingMatch | null` (pure, C6).
  ```ts
  export interface ListingMatch { url: string; title: string | null; nameMatch: boolean | null; phoneMatch: boolean | null; shownPhone: string | null }
  ```
- `auditBusiness(deps, biz, catalogue, budget): Promise<{ rows: CitationRow[]; calls: number; usd: number }>` — one capture per call
  (`recordVendorCapture`, `source 'directories'`, `url 'citations:name_phone' | 'citations:name_city'`). Banned-host results are dropped (raw capture only).
- Inputs: self = self competitor name, latest GBP phone (else `client.phone`), `client.address.city`; rival = name, latest `gbp_profile` phone/city (else client's city).
- `CITATION_CALL_USD = 0.004` (depth 20, both stages); `CITATION_RUN_CAP_USD = 0.20`.

### Job (`apps/worker/src/jobs/citations.ts`, new)
- `citation-audit` cron `0 9 * * *`: clients with `clientWorkAllowed` ∧ `agencyServiceable` ∧ C10 due (no run, or last `done`/`capped` ≥ 30 d) → enqueue
  `citation-audit-client { clientId }`, `singletonKey 'citation:<clientId>:<yyyy-mm-dd>'`, spaced like `rival-monthly` (`startAfter`).
- Per client: `citation_audit_run`; spend guard as `checkRankScanBudget` (`cap` → `capped`, no calls); self then Top rivals; stop at
  `CITATION_RUN_CAP_USD` (rest `not_checked`, `capped`); vendor error → `not_checked`.
- Then `diffCitations(tx, runId)` (stage `citation_diff` v1, `runStage`, follow `diffRankScan`): one `detected_change` per rival host per C7,
  `source 'directories'`, `kind 'added'`, `blockKey 'citation:<host>'`, `afterText` = listing title,
  `details { changeType: 'citation_added', directory: host, label, url }`, `afterCaptureId` = the finding capture.

### Engine
- `core/domain.ts`: `CHANGE_TYPES` += `'citation_added'`; `SELF_RULE_IDS` += `'citation_gap'`; `CHANNELS` += `'directories'`.
- `score/score.ts`: `WHOLE_BUSINESS_TYPES` += `citation_added`; C8 deterministic score + `factors.citationMinor` (`ScoreFactors` in `db/schema/engine.ts`).
  `score-stage.ts` novelty key `citation_added|<directory>`.
- `core/brief-report.ts` `topicOf`: `citation_added` → `'rankings'`, label renamed "Rankings & listings" (ours). Email `CHANGE_LABELS.citation_added = 'new directory listing'`,
  `GROUP_PHRASE.citation_added = () => 'new directory listings'`. Channel labels (`engine/briefs/evidence.ts`, `tools/workspace/labels.ts`): `directories: 'Online directories'`.
- `tag/structured.ts` summary (below); glossary term "Directory listing".
- `briefs/self-rules.ts`: `SelfRuleInput.citations: { checkedAt: string; total: number; missing: { host: string; label: string; rivalsListed: number }[];
  mismatched: { host: string; label: string; field: 'name' | 'phone' }[]; evidenceIds: string[] } | null` (null = self not audited → rule skipped).
  Fires when `missing ≥ min_missing` or any mismatch; score = `weight × min(1, (missing + 2·mismatched) / total)`; evidence = stored captures;
  `not_checked` never counts. Fed by `starting-point.ts`.
- Pack self rule `{ id: citation_gap, weight: 0.6, playbook: fix_citations, params: { min_missing: 3 } }`; play `fix_citations` (effort L, impact M).
  Runbook clients get both as `new_upstream` items (phase 14 rule; no forced copy).

### Tool `get_citation_audit` (`packages/tools/src/tools/citations.ts`, new)
Input `{ clientId }`. Output:
```ts
{ checkedAt: string | null; status: 'never' | 'done' | 'capped' | 'running';
  directories: { host: string; label: string; addListingUrl: string }[];
  businesses: { competitorId: string; name: string; self: boolean;
    listings: { host: string; status: 'listed' | 'not_found' | 'not_checked'; nameMatch: boolean | null; phoneMatch: boolean | null;
      listingUrl: string | null; shownPhone: string | null; evidenceId: string | null; checkedAt: string | null }[] }[];
  selfMissing: boolean }   // true = no self competitor (no Google listing linked)
```
Current catalogue only; no row = `not_checked`. Channels web/mcp/ask, feature `dashboard`; `ISOLATION_FIXTURES` `client()`; out of scope ⇒ `not_found`.

### Listings page (`apps/web/src/app/(app)/c/[clientId]/listings/page.tsx`, new)
- Nav: `apps/web/src/components/shell/nav-items.ts` `clientNav` Insights section, `add(\`${base}/listings\`, 'Listings', 'listings')` right after `Local rankings`;
  `IconKey` += `'listings'` (icon in `nav-link.tsx`). Same `flags.dashboard` gate.
- `PageHeader` title "Listings" + breadcrumb; help key `page:client.listings`, guides `docs/help/pages/client.listings.{client,agency}.md` (`kb:seed`);
  `Suspense`; reads only via `get_citation_audit`; ≤ 8 DB stages.
- One sheet: section "Your listings" (status, name, phone, "Add listing" link when not found), then "You vs top rivals" (matrix, ≤ 3), then "Also found on" (C12; self, links only; hidden when empty).
- Operator vertical review: group checkboxes (`citations.groups`) on the existing vertical review form.

### Copy (decided; to `pnpm copy:review`)
- Sub-line: "Where Google search finds you and your top rivals on major directories. Checked every month."
- Cells: **Listed** · **Not found in Google search** · **Not checked yet** · "Name matches" / "Name differs" · "Phone matches" / "Shows a different phone: <phone>" · "Address: not checked".
- Empty: "Your first check runs once your competitors are set." · No self: "Link your Google listing in Client settings to check your listings."
- Summary `citation_added`: `Now found on <label> in Google search`. Group: `<n> new directory listings`.
- `citation_gap` facts: `Google search found no listing for you on <n> of <m> directories we check: <labels>.` / `<label> shows a different <name|phone> for you than your Google profile.`
- Play `fix_citations` title "Get listed on the directories you're missing"; template "Add your business to {{directories}} using each directory's sign-up page (links on the Listings page), with the same name and phone as your Google profile."

## Behaviour & edge cases
- **No phone:** stage 2 only, `phone_match` null, listed on name + city. **No self competitor:** rivals still audited; no-self line (backlog phase-16). **No Top rival:** the 3 tracked rivals with the highest overlap (our call).
- A differing phone may be a tracking number (never "wrong"). Removed host: rows hidden, no events.

## Cost
Per business 2 calls × $0.004 = **$0.008**; per run (self + 3) **≈ $0.032**; reused rivals $0.
Cap **$0.20/client/run** stays; spend guard, ledger credits, vendor limiter. Pilot (60 clients) ≈ $2/month.

## Out / backlog
18c-2 listing-page NAP + address; "check now"; guided fixes (act-on-recommendations); scorecard row; client's own listing lines.

## Settled points (our calls, owner said "go as recommended")
1. "New listing" = tracked rival only: Minor brief line, never an alert; own listings live on the Listings page and in `citation_gap`.
2. Dental = ADA only (§2.2 spirit). 3. No Top rival yet: the 3 highest-overlap tracked rivals.
