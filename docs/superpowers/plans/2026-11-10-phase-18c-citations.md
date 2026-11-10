# Phase 18c-1 — Directory listings (citations) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (implementer + reviewer per task, final review on the top model, one fix wave). Steps use `- [ ]`.

**Goal:** A monthly, search-only audit of where Google finds the client and its top rivals on the directories its vertical picked (listed / not found / name and phone shown), shown on a new client **Listings** page, read by `get_citation_audit` (web, MCP, Friday), turned into a `citation_gap` starting-point finding with a `fix_citations` play, and into Minor brief lines when a tracked rival is newly found on a directory.
**Architecture:** A daily worker cron queues due clients. A per-client job runs a two-stage organic search per business (one `"<name>" "<phone>"` search at depth 50, then `site:` searches only for the catalogue directories stage 1 missed). Deterministic matching (no model) writes global `citation_listing` rows and a tenant `citation_audit_run`. A `citation_diff` stage then emits global `citation_added` changes; these are scored with a fixed T/4 score and always archived, so they reach only the graded brief lines.
**Tech stack:** TypeScript, Drizzle + Postgres RLS, Vitest, pg-boss worker, Next.js App Router, `@cs/ui`.
**Spec (binding):** `docs/superpowers/specs/2026-11-10-phase-18c-citations-design.md` (C1–C12, Interfaces, Copy). Read it before any task. Owner decisions: `docs/work/phase-18c.md`.

## Global constraints
- **No evidence, no claim; never "not listed":** a host that searches did not find is `not_found` ("Not found in Google search"). A host not searched (vendor error, cap, never) has **no row written by this run** and reads `not_checked`. No mismatch without a phone or name in the stored result text (C6).
- **Never stored and never searched:** `BANNED_CITATION_HOSTS = ['yelp.com','healthgrades.com','zocdoc.com','nextdoor.com']`, subdomains included. They may appear only inside the raw vendor capture. Never search a directory the vertical didn't pick (C4). No listing-page reads (C1). Client text names the category, never the vendor.
- Cost: `CITATION_RUN_CAP_USD = 0.20` per client run. Depth-10 call = `SERP_CALL_USD` (0.002). Depth-50 price is set by Task 0 (> $0.01/call ⇒ stage 1 uses depth 20). Spend guard = `checkRankScanBudget`. Ledger scope `{ agencyId, clientId, verticalId }` (credits). All calls go through `DataForSeoClient` (limiter + ledger).
- Cadence (C10): first run once `client_setup.competitors_done_at` is set (or the client has no setup row), then every 30 days after the last `done`/`capped` run. Audited = self + `competitor_signal.tier = 'top'` by `overlap` (≤ 3); fallback = the 3 tracked rivals with the highest overlap. A competitor checked < 25 days ago (by any client) is reused, not searched. No "check now".
- Scheduling: `clientWorkAllowed` ∧ `agencyServiceable` ∧ `client.status = 'active'` (via those filters); one worker replica; `singletonKey 'citation:<clientId>:<yyyy-mm-dd>'`.
- Events (C7/C8): only a **tracked rival** newly found (`not_found` → `listed`) emits a change. The first audit is a silent baseline. Self never emits one. `listed` → `not_found` emits nothing. Score = `thresholds.brief / 4`, route **always `archive`**, never an alert or a brief item, graded **Minor**.
- RLS: `citation_listing` = `global_public` (written only by the service role; SELECT via `app_competitor_visible`). `citation_audit_run` = `tenant_client` (same as `serp_snapshot`). No grants to `cs_worker`/`cs_web` (0081: "no grants on schema public for either role"; data goes through the service/app roles).
- Web reads go only through the registered tool. Page refusals → 404. `PageHeader` + help key + two guides. `Suspense` (no `loading.tsx`). ≤ 8 app DB stages. Design system v1 (one sheet, sections before cards, 36 px controls, phone at 390 px).
- New tool ⇒ `ISOLATION_FIXTURES`, `channels.test.ts`, MCP tool lists, `access-marks` snapshot + 8b doc, Ask progress label, demo coverage. New tables ⇒ `TABLE_CLASS` + world rows. Out-of-scope client ⇒ `not_found`. `eval:replay` miss ⇒ re-record in this branch (≤ $5/run, `record --fill` first; stop on a 402).
- Copy exactly as spec § Copy. New strings reach `pnpm copy:review` (agents never sign). Never edit applied migrations; migration = next free number (0107 today).
- Commits end `Co-Authored-By: <your model> <noreply@anthropic.com>`; LF only (`git ls-files --eol | grep crlf` empty). Read `docs/gotchas-cross-cutting.md` + each touched package's `CLAUDE.md` first.
- Tests: implementers run **focused** tests in the foreground only. Reviewers run none. `test:affected` + `e2e:affected` once, in the final task.

## Decisions (plan-level, ours; spec C1–C12 stand)
- **P1 `newly_found_at` column (adds to spec migration).** Nothing else in the spec's columns tells "was `not_found` before" apart from "first check found it", and the diff must be retry-safe (`runStage`). The upsert sets it when a catalogue row goes `not_found` → `listed`. The diff reads it.
- **P2 Unchecked hosts write nothing.** A vendor error, the cap or a skipped stage leaves an existing row untouched and inserts no `not_checked` row (the tool maps "no row" to `not_checked`). A listed span is never reset by an error.
- **P3 Matching tightens C6 for common names (Review focus 1):** a name whose tokens, after dropping the city and legal words, are all trade words (`GENERIC_NAME_TOKENS`, e.g. "Dallas Plumbing" → `plumbing`) counts as a name hit only on an exact token match of the title head. The reverse-containment rule needs ≥ 2 title tokens, at least one distinctive. Phones are matched as whole US phone numbers (`usPhones`), not as a digit substring.
- **P4 Stage 1 failure** (vendor error) ⇒ treated like "no phone": stage 2 for every catalogue host, `phone_match` null.
- **P5 City for rivals:** `cityFromAddress(gbp address)` (GBP has no city field), else the client's city.
- **P6 `min_missing`:** the self-rule reads `rule.params.min_missing` (runbook-editable), fallback 3. `citations.min_missing` stays in the schema per spec but no engine code reads it (noted in the package CLAUDE.md).
- **P7 Grading:** `groupChanges` forces `citation_added` to `minor`, so T = 0 (score 0 ≥ 0) can never make it Major.
- **P8 `{{directories}}`** joins `PLAYBOOK_VARS` (fallback "the directories you're missing"). Otherwise `unknownPlaybookVars` flags the decided template.
- **P9 Readiness:** `startingPointReadiness.checks.citations: boolean | null`. True once a run is `done`/`capped`/`failed`. Null without a self competitor or with an empty catalogue. This lets `citation_gap` see data before the 48 h timeout (the cron reaches a new client within 24 h).
- **P10 Tool output** gains `alsoFoundOn: { host; listingUrl; evidenceId }[]` (self only), because C12 needs it on the page and the spec output omitted it.
- **P11 Operator groups:** `review_vertical` gains action `'groups'` with `citationGroups`. Every save bumps `vertical.version` and invalidates the catalogue.
- **P12 Also-found refresh:** after a stage 1 that succeeded, the business's `in_catalogue = false` rows not found again are deleted (they are not evidence; their captures stay).

## File structure
- **Create:** `packages/db/migrations/0107_citations.sql` (+ meta); `packages/db/src/schema/citations.ts`; `packages/db/src/citations-backfill.test.ts`; `packages/verticals/src/citations.ts` (+ test); `packages/collectors/src/citations/{match,search,audit,run}.ts` (+ tests, `__fixtures__/citation-stage1.json`, `citation-site.json`); `apps/worker/src/jobs/citations.ts` (+ test); `packages/engine/src/structured/citations.ts` (+ test); `packages/tools/src/tools/citations.ts` (+ test); `apps/web/src/app/(app)/c/[clientId]/listings/{page.tsx,page.test.tsx,listings-view.tsx}`; `docs/help/pages/client.listings.{client,agency}.md`; `packages/demo/src/citations.ts`.
- **Modify:** `packages/core/src/{domain.ts,brief-report.ts,help/glossary.ts}`; `packages/verticals/src/{schema.ts,index.ts}`, `packs/{generic,hvac_plumbing,dental}.yaml`, `packages/db/src/catalog-seed.sql.ts` (generated); `packages/db/src/schema/{index,engine}.ts`, `packages/db/test/{table-classes,isolation-world}.ts`, `packages/db/src/schema/client-intel.ts` (`SerpOrganicItem.description`); `packages/collectors/src/{rankings/serp.ts,index.ts,vendors/fixture-fetch.ts}`; `apps/worker/src/{deps.ts,job-list.ts,concurrency.ts}`, `jobs/engine.ts`; `packages/engine/src/{score/score.ts,score/score-stage.ts,tag/structured.ts,briefs/{graded,evidence,self-rules,starting-point,readiness,playbooks}.ts,index.ts}`; `packages/email/src/labels.ts`; `packages/tools/src/{tools/{all,schemas,platform-verticals}.ts,workspace/labels.ts,isolation/fixtures.ts}` + `channels.test.ts`, `access-marks` snapshot, `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; `packages/mcp/src/{server,integration}.test.ts`; `packages/ask/src/labels.ts`; `packages/demo/src/{seed,coverage}.ts`; web `components/shell/{nav-items.ts,nav-link.tsx}`, `help/copy/client.ts`, `lib/labels.ts`, `(platform)/platform/verticals/catalog-queue.tsx`, `(platform)/platform/actions.ts`; `docs/OPS.md`; package `CLAUDE.md`s (collectors, engine, verticals); `docs/work/phase-18c.md`.

## Dependencies on in-flight work (re-check at Task 0)
- `site-audiences`: touches only `apps/site`, claims no migration, env or `apps/web` change. `apps/site/content/roadmap.ts:33` stays.
- Migration number: next free on main is **0107** (main @ 88974241). Re-check `ls packages/db/migrations | tail -2` after rebasing.

## Review focus (each pinned by a test in the named task)
1. **Common business names give false-positive listings** ("Dallas Plumbing", a "Best plumbers in Dallas" category page). Task 3: `generic-name needs exact head`, `category page is no hit`.
2. **A phone in another format counts as a mismatch.** Task 3: `(214) 555-0101 / 214.555.0101 / +1 214-555-0101 all match`; zip + street digits are no phone.
3. **Excluded or unpicked hosts leak into rows or queries** (yelp, `m.yelp.com`, a dentist searched on Angi). Tasks 1, 4, 5: `banned subdomain is a schema error`, `banned host never stored`, `dental never queries site:angi.com`.
4. **A rival found late is labelled "new" or emits twice** (first audit, reuse by a second client, a retry, `not_checked` → listed). Task 6: `baseline silent`, `not_checked→listed silent`, `reused rival no second change`, `rerun idempotent`.
5. **Cost cap overrun on a large rival set or tenant leak via the global table.** Task 4: `stops before crossing 0.20`. Task 2/9: `client B cannot read A-only rows / audit run`; tool `not_found` for an out-of-scope client.

---

### Task 0: Pre-flight + live probe (controller; STOP point)
**Goal:** Re-check every interface in this plan against `main`, and decide depth, Bing Places / Apple Maps and recall from a live probe (≤ $0.10, owner-approved with the plan).
- [ ] `git fetch && git rebase origin/main`; `git branch --no-merged main`; `ls packages/db/migrations | tail -2` → set the migration number (rename `0107_citations` everywhere if it changed).
- [ ] Grep-confirm (fix this plan inline if any drifted): `CHANGE_TYPES/CHANNELS/SELF_RULE_IDS` in `packages/core/src/domain.ts`; `topicOf`/`gradeFor` in `packages/core/src/brief-report.ts`; `parseSerp` caps at `SERP_DEPTH`; `checkRankScanBudget(db, clientId, usd)`; `recordVendorCapture`; `runStage`/`supersedePriorChanges`; `detected_change_unique (after_capture_id, kind, block_key, stage_version)`; `scoreForClient` threshold source; `groupChanges`; `PLAYBOOK_VARS`; the operator vertical form = `apps/web/src/app/(platform)/platform/verticals/catalog-queue.tsx` + tool `review_vertical` (`packages/tools/src/tools/platform-verticals.ts`).
- [ ] **Hand-check every `add_listing_url`** (general, home_services, dental_health) in a browser. Record the final URLs in the work file.
- [ ] **Cost up front:** tell the controller/owner "stage 1 ≤ 4 × $0.01 + stage 2 ≤ 30 × $0.002 ≈ $0.10 max" and wait for the go. Cheapest route first: sandbox (`sandbox.dataforseo.com`, $0) for one stage-1 and one `site:` query → save as `packages/collectors/src/citations/__fixtures__/citation-stage1.json` / `citation-site.json` (confirm `description` key on organic items).
- [ ] Live: 2 cs_dev businesses + 1 tracked rival each (one HVAC, one dental). If cs_dev has no dental client, the owner names a public dental practice. Stage 1 depth 50 (`location_code 2840`), then stage 2 for not-found hosts, **Bing and Apple first**. Sum the envelope `cost`; **stop at $0.10**, on a 402, or on two vendor errors in a row. Read keys from `.env` with `grep '^KEY=' .env | cut -d= -f2-`; never print them.
- [ ] Manual check: the controller opens each directory's own search page in the built-in browser (one page per directory and business). Record listed / not for every pair.
- [ ] Apply C3: a directory found by search in < 50 % of the manually confirmed cases → removed from its group (Bing Places, Apple Maps decided here). Overall recall < 50 % → **stop and ask the owner**. Depth-50 price > $0.01/call → `STAGE1_DEPTH = 20`. Note the phone format seen in titles/snippets.
- [ ] Write findings to `docs/work/phase-18c.md` § Status (cost, hit rate per directory, depth price, rulings). Amend the spec starting lists if a host is removed.
**Done when:** findings recorded; spend ≤ $0.10; the controller has reported to the owner and has a go for Task 1.

### Task 1: Domain enums, pack schema, groups, YAML
**Goal:** `citation_added`, `citation_gap`, `directories` exist. Packs carry directory groups. `citationCatalogue(pack)` returns the vertical's directories.
**Files:** `packages/core/src/domain.ts`; `packages/verticals/src/{schema.ts,citations.ts,citations.test.ts,index.ts,packs.test.ts}`; `packs/{generic,hvac_plumbing,dental}.yaml`; `packages/engine/src/briefs/playbooks.ts` (+ test).
**Interfaces:**
```ts
// core
CHANGE_TYPES += 'citation_added'; SELF_RULE_IDS += 'citation_gap'; CHANNELS += 'directories';
// verticals/citations.ts
export const CITATION_GROUPS = ['general', 'home_services', 'dental_health'] as const; export type CitationGroup = (typeof CITATION_GROUPS)[number];
export const BANNED_CITATION_HOSTS = ['yelp.com', 'healthgrades.com', 'zocdoc.com', 'nextdoor.com'] as const;
export const CITATION_CATALOGUE_MAX = 15;
export const onHost = (h: string, host: string): boolean => h === host || h.endsWith(`.${host}`);
export const isBannedHost = (h: string): boolean => BANNED_CITATION_HOSTS.some((b) => onHost(h, b));
export interface Directory { host: string; label: string; add_listing_url: string }
export function citationCatalogue(pack: Pick<VerticalPack, 'citations'>): Directory[]; // union of picked groups in CITATION_GROUPS order, first host wins; [] if directory_groups absent
```
Schema `citations` exactly as spec § Pack, plus: `directory` refine `!isBannedHost(host)` ("Directory <host> is never allowed"); pack-level `superRefine`: `citationCatalogue(pack).length ≤ 15`; when `directory_groups` is present, every picked group exists in it. `PLAYBOOK_VARS` += `'directories'`, FALLBACK `"the directories you're missing"`.
**Behaviour:**
- `generic.yaml`: `citations: { directory_groups: { general: [...8], home_services: [...5], dental_health: [ADA] }, groups: [general], min_missing: 3 }` with Task 0's URLs and removals. hvac: `groups: [general, home_services]`; dental: `groups: [general, dental_health]`. Only generic sets `directory_groups`.
- All three YAMLs: `type_weights.citation_added: 0.3`, `scoring.version: 7`, self rule `{ id: citation_gap, weight: 0.6, playbook: fix_citations, params: { min_missing: 3 } }`, playbook `fix_citations` (`trigger: citation_gap`, effort L, impact M, title + template verbatim from spec § Copy).
- `CHANNELS` change: check `Record<Channel, …>` maps (tsc names them) and add `directories: 'Online directories'`.
**Follow pattern:** 18a-2 v6 pack bump (`git show 0101` era commits), `discoverySchema` refines.
**Tests (first):** `citationCatalogue` of the assembled hvac pack (generic ⊕ hvac via `assemblePack`) = 13 hosts (minus Task 0 removals), dental = 9, a DB vertical with no own `citations` = general only; a dental catalogue has no `angi.com` (**RF3**); `yelp.com` and `m.yelp.com` in a group → schema error (**RF3**); 16 hosts → error "≤ 15"; a picked group missing from `directory_groups` → error; shipped packs parse, have `scoring.version 7`, `citation_added 0.3`, `citation_gap` + `fix_citations` (effort/impact set); `unknownPlaybookVars(fix_citations.template)` = `[]`; `renderPlaybook` fills `{{directories}}`.
**Done when:** `pnpm --filter @cs/verticals exec vitest run`, `pnpm --filter @cs/core exec vitest run`, `npx vitest run src/briefs/playbooks` (engine dir); `npx turbo run typecheck --concurrency=1 --filter=@cs/core --filter=@cs/verticals`.

### Task 2: Migration, Drizzle schema, isolation
**Goal:** Both tables with RLS and isolation coverage.
**Files:** `packages/db/migrations/0107_citations.sql` (+ `meta/`), `packages/db/src/schema/citations.ts` (+ export in `schema/index.ts`), `packages/db/test/{table-classes,isolation-world}.ts`.
**Interfaces:** Drizzle `citationListing`, `citationAuditRun` (camelCase of the columns below); `type CitationStatus = 'listed' | 'not_found' | 'not_checked'`; `type CitationRunStatus = 'running' | 'done' | 'capped' | 'failed'`.
**Migration (full; schema part via `generate --name=citations`, then hand-append RLS + backfill):**
```sql
-- spec § Migration verbatim, with P1:
CREATE TABLE citation_listing ( competitor_id uuid NOT NULL REFERENCES competitor(id) ON DELETE CASCADE, host text NOT NULL,
  status text NOT NULL CONSTRAINT citation_listing_status_check CHECK (status IN ('listed','not_found','not_checked')),
  name_match boolean, phone_match boolean, listing_url text, listing_title text, shown_phone text,
  capture_id uuid REFERENCES capture(id), first_seen_at timestamptz, last_seen_at timestamptz,
  newly_found_at timestamptz,            -- P1: set when not_found -> listed (catalogue rows only)
  in_catalogue boolean NOT NULL DEFAULT true, checked_at timestamptz NOT NULL, PRIMARY KEY (competitor_id, host) );
REVOKE INSERT, UPDATE, DELETE ON citation_listing FROM app_user;
ALTER TABLE citation_listing ENABLE ROW LEVEL SECURITY;  ALTER TABLE citation_listing FORCE ROW LEVEL SECURITY;
CREATE POLICY citation_listing_visible ON citation_listing FOR SELECT USING (app_competitor_visible(competitor_id));
-- citation_audit_run + both indexes exactly as spec, then:
REVOKE INSERT, UPDATE, DELETE ON citation_audit_run FROM app_user;
ALTER TABLE citation_audit_run ENABLE ROW LEVEL SECURITY;  ALTER TABLE citation_audit_run FORCE ROW LEVEL SECURITY;
CREATE POLICY citation_audit_run_select ON citation_audit_run FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
```
Separate statements with `--> statement-breakpoint`. The pack backfill goes in the same file, after a `-- backfill:start` marker (Task 2b).
**Behaviour:** `TABLE_CLASS`: `citation_listing: 'global_public'`, `citation_audit_run: 'tenant_client'`. World rows: one `citation_listing` per world competitor (a self business included), one `citation_audit_run` each for tenants A1/A2/B.
**Tests (first):** `rls-sweep` + `isolation-world` pass. As `app_user` client B: zero rows of A's `citation_audit_run` and of a competitor only A tracks; INSERT into `citation_listing` → "permission denied" (**RF5**). A second `running` run for a client hits `citation_audit_run_one_live`.
**Done when:** `pnpm --filter @cs/db exec vitest run src/rls-sweep.test.ts src/isolation-world.test.ts`; `pnpm --filter @cs/db generate` says "No schema changes"; tsc.

### Task 2b: Pack v7 backfill + seed
**Goal:** The shipped DB verticals get the v7 data from Task 1 (pattern 0101, idempotent, `vertical.updated_at` untouched).
**Files:** `0107_citations.sql` (after `-- backfill:start`), `packages/db/src/citations-backfill.test.ts`, `packages/db/src/catalog-seed.sql.ts` (`pnpm --filter @cs/verticals seed-sql`).
**SQL (binding):**
```sql
-- backfill:start
UPDATE vertical SET config = jsonb_set(jsonb_set(config, '{type_weights,citation_added}', '0.3', true), '{scoring,version}', '7', true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'type_weights') = 'object'
   AND jsonb_typeof(config->'scoring') = 'object' AND coalesce((config #>> '{scoring,version}')::int, 0) < 7;
UPDATE vertical SET config = jsonb_set(config, '{citations}', '<generic citations JSON = generic.yaml>'::jsonb, true) WHERE id = 'generic' AND NOT config ? 'citations';
UPDATE vertical SET config = jsonb_set(config, '{citations}', '{"groups":["general","home_services"],"min_missing":3}', true) WHERE id = 'hvac_plumbing' AND NOT config ? 'citations';
UPDATE vertical SET config = jsonb_set(config, '{citations}', '{"groups":["general","dental_health"],"min_missing":3}', true) WHERE id = 'dental' AND NOT config ? 'citations';
UPDATE vertical SET config = jsonb_set(config, '{self_rules}', (config->'self_rules') || '[{"id":"citation_gap","weight":0.6,"playbook":"fix_citations","params":{"min_missing":3}}]'::jsonb)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'self_rules') = 'array'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config->'self_rules') r WHERE r->>'id' = 'citation_gap');
-- the same NOT EXISTS shape appends the fix_citations object (id, trigger, effort, impact, title, template verbatim) to config->'playbooks'
```
**Tests (first):** pattern `wider-sources-backfill.test.ts` (re-run from the marker): v6 shape → v7, weight, citations, rule and play appended once; a re-run changes nothing; `updated_at` unchanged; `assemblePack` of each shipped row equals the YAML pack's `citations`/`self_rules`/`playbooks` (the JSON literals equal the YAML).
**Done when:** `pnpm --filter @cs/db exec vitest run src/citations-backfill.test.ts src/wider-sources-backfill.test.ts`; `seed-sql` output committed.

### Task 3a: Name and phone normalisation (pure)
**Goal:** The deterministic primitives behind C6 and P3.
**Files:** create `packages/collectors/src/citations/match.ts` (+ `match.test.ts`).
**Code (binding):**
```ts
const LEGAL = new Set(['llc', 'inc', 'co', 'corp', 'corporation', 'company', 'ltd', 'pllc', 'pc', 'dds', 'dmd', 'the', 'of', 'and']);
export const GENERIC_NAME_TOKENS = new Set(['plumbing', 'plumber', 'plumbers', 'heating', 'cooling', 'air', 'conditioning', 'hvac', 'ac', 'service', 'services',
  'repair', 'home', 'pros', 'experts', 'dental', 'dentist', 'dentists', 'dentistry', 'family', 'care', 'center', 'clinic', 'smile', 'smiles', 'best', 'top', 'near', 'in', 'me']);
const words = (s: string): string[] =>
  s.normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
export function normaliseName(s: string, city: string | null): string[] {
  const drop = new Set(words(city ?? ''));
  return words(s).filter((t) => !LEGAL.has(t) && !drop.has(t));
}
/** "ABC Plumbing - Dallas, TX - Yelp" -> "ABC Plumbing" (also |, en/em dash). */
export const titleHead = (title: string): string => title.split(/\s+[-|–—]\s+/)[0] ?? title;
const distinctive = (xs: string[]) => xs.some((t) => !GENERIC_NAME_TOKENS.has(t));
export function nameHit(title: string | null, name: string, city: string | null): boolean {
  if (!title) return false;
  const a = normaliseName(name, city), b = normaliseName(titleHead(title), city);
  if (a.length === 0 || b.length === 0) return false;
  if (!distinctive(a)) return a.length === b.length && a.every((t, i) => t === b[i]); // generic name: exact head only
  const A = new Set(a), B = new Set(b);
  return a.every((t) => B.has(t)) || (b.length >= 2 && distinctive(b) && b.every((t) => A.has(t)));
}
export const digitsOnly = (s: string): string => s.replace(/\D/g, '');
export function phone10(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw ?? '');
  const t = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return t.length === 10 ? t : null;
}
const US_PHONE = /(?<![\d-])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})(?![\d-])|(?<!\d)([2-9]\d{9})(?!\d)/g;
export function usPhones(text: string): string[] {
  return [...new Set([...text.matchAll(US_PHONE)].map((m) => (m[4] ?? `${m[1]}${m[2]}${m[3]}`)))];
}
export const formatPhone = (p: string): string => `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
/** P5: "…, Dallas, TX 75201(, USA)" -> "Dallas", else null. */
export function cityFromAddress(a: string | null): string | null {
  const parts = (a ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (/^(usa|united states)$/i.test(parts.at(-1) ?? '')) parts.pop();
  const i = parts.findLastIndex((p) => /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p));
  return i >= 1 ? parts[i - 1]! : null;
}
```
**Tests (first):** `normaliseName('ABC Plumbing & Heating, LLC', 'Dallas')` = `['abc','plumbing','heating']`. **RF1** `generic-name needs exact head`: `nameHit('Dallas Plumbing Co - Dallas, TX', 'Dallas Plumbing', 'Dallas')` true; `nameHit('Plumbing Services in Dallas, TX', 'Dallas Plumbing', 'Dallas')` false. `category page is no hit`: `nameHit('Best Plumbers in Dallas, TX - Updated 2026', 'ABC Plumbing', 'Dallas')` false. `nameHit('ABC Plumbing 123 Main St, Dallas, TX 75201 - YP.com', 'ABC Plumbing LLC', 'Dallas')` true. Reverse: `nameHit('Smith Dental Care | Facebook', 'Smith Family Dental Care PLLC', null)` true; `nameHit('Smith | Facebook', 'Smith Plumbing', null)` false. **RF2** `usPhones` of `"(214) 555-0101"`, `"214.555.0101"`, `"+1 214-555-0101"`, `"2145550101"` = `['2145550101']`; `"TX 75201, Suite 214, 555 Elm"` = `[]`; `phone10('+1 (214) 555-0101')` = `'2145550101'`; `phone10('555-0101')` null. `cityFromAddress('9 Oak Ave, Granbury, TX 76048, United States')` = `'Granbury'`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/citations/match.test.ts`; tsc.

### Task 3b: Listing match + "Also found on" (pure)
**Goal:** Pick a business's listing on one catalogue host, and the strict uncatalogued hits (C6, C12).
**Files:** `packages/collectors/src/citations/match.ts` (+ test).
**Code (binding):**
```ts
export interface CitationBiz { name: string; phone: string | null; city: string | null; domain: string | null }
export interface ListingMatch { url: string; title: string | null; nameMatch: boolean | null; phoneMatch: boolean | null; shownPhone: string | null }
export const NOT_DIRECTORY_HOSTS = ['youtube.com', 'wikipedia.org'] as const; // plus any google.<tld>, the business's own domain
export const ALSO_FOUND_MAX = 10;
const urlParts = (url: string | null): { host: string; path: string } | null => {
  try { const u = new URL(url ?? ''); return { host: u.hostname.toLowerCase().replace(/^www\./, ''), path: u.pathname || '/' }; } catch { return null; }
};
const bare = (d: string) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]!;
/** C6: items in rank order; best = name and phone, else the first hit. */
export function matchListing(items: SerpOrganicItem[], host: string, biz: CitationBiz): ListingMatch | null {
  const p = phone10(biz.phone);
  let best: ListingMatch | null = null;
  for (const it of items) {
    const u = urlParts(it.url);
    if (!u || u.path === '/' || !onHost(u.host, host) || isBannedHost(u.host)) continue;
    const phones = usPhones(`${it.title ?? ''} ${it.description ?? ''}`);
    const nh = nameHit(it.title, biz.name, biz.city), ph = p !== null && phones.includes(p);
    if (!nh && !ph) continue;
    const other = p !== null && nh && !ph ? (phones.find((x) => x !== p) ?? null) : null;
    const m: ListingMatch = { url: it.url!, title: it.title, nameMatch: nh, phoneMatch: ph ? true : other ? false : null, shownPhone: other };
    if (nh && ph) return m;
    best ??= m;
  }
  return best;
}
/** C12: stage-1 hits outside the catalogue, name AND phone, never own/banned/not-a-directory hosts; <= 10, one per host. */
export function alsoFoundOn(items: SerpOrganicItem[], catalogueHosts: string[], biz: CitationBiz): { host: string; url: string; title: string | null }[] {
  const p = phone10(biz.phone);
  if (!p) return [];
  const own = biz.domain ? bare(biz.domain) : null;
  const out = new Map<string, { host: string; url: string; title: string | null }>();
  for (const it of items) {
    const u = urlParts(it.url);
    if (!u || u.path === '/' || out.has(u.host) || out.size >= ALSO_FOUND_MAX) continue;
    const h = u.host;
    if (catalogueHosts.some((c) => onHost(h, c)) || isBannedHost(h) || NOT_DIRECTORY_HOSTS.some((n) => onHost(h, n))
      || /(^|\.)google\.[a-z.]+$/.test(h) || (own && onHost(h, own))) continue;
    if (nameHit(it.title, biz.name, biz.city) && usPhones(`${it.title ?? ''} ${it.description ?? ''}`).includes(p)) out.set(h, { host: h, url: it.url!, title: it.title });
  }
  return [...out.values()];
}
```
`shownPhone` is stored as 10 digits; the page formats it with `formatPhone`.
**Tests (first):** (Task 0 fixture + hand rows) `bbb.org/` root skipped; `m.facebook.com/x` matches `facebook.com`; name+phone beats an earlier name-only item; name hit + other phone → `phoneMatch false`, `shownPhone '2145550199'`; phone-only → `nameMatch false`; no phone → `phoneMatch null`; a `yelp.com` item never matches (**RF3**). `alsoFoundOn`: news article with the name but not the phone → excluded; `chamberofcommerce.com` with both → included; own domain, `maps.google.com`, `youtube.com`, catalogue subdomain → excluded; 12 hosts → 10.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/citations/match.test.ts`.

### Task 4: Search, business audit, upsert, cost cap
**Goal:** `parseSerp` keeps `description`. The two-stage audit of one business writes captures and rows within the budget.
**Files:** `packages/db/src/schema/client-intel.ts` (`SerpOrganicItem.description?: string | null`), `packages/collectors/src/rankings/serp.ts` (+ test), create `citations/{search,audit}.ts` (+ tests), `index.ts` exports, `vendors/fixture-fetch.ts` (canned stage-1/site answers from the Task 0 fixtures).
**Interfaces:**
```ts
export function parseSerp(raw: unknown, max = 10): SerpResult;           // organic items gain description
export const CITATION_CALL_USD = { depth10: SERP_CALL_USD, stage1: /* Task 0 */ 0 } as const;
export const STAGE1_DEPTH: 20 | 50 = 50;                                  // Task 0 ruling
export const CITATION_RUN_CAP_USD = 0.2;
export const CITATIONS_SOURCE = 'directories';
export async function citationSearch(dfs: DataForSeoClient, q: { query: string; depth: 10 | 20 | 50 }, scope: CallScope): Promise<{ organic: SerpOrganicItem[]; raw: unknown[] }>;
export interface CitationBudget { spentUsd: number; readonly capUsd: number }  // mutated by auditBusiness
export interface CitationRow { host: string; status: 'listed' | 'not_found'; inCatalogue: boolean; match: ListingMatch | null; captureId: string }
export async function auditBusiness(
  deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; now?: () => Date },
  biz: CitationBiz & { competitorId: string }, catalogue: Directory[], budget: CitationBudget, scope: CallScope,
): Promise<{ rows: CitationRow[]; calls: number; usd: number; capped: boolean }>;
export async function upsertCitationRows(db: Db | Tx, competitorId: string, rows: CitationRow[], checkedAt: Date, opts: { stage1Ok: boolean }): Promise<void>;
```
**Behaviour:**
- `citationSearch` = `serpSearch` without coordinates (`location_code 2840`, `language_code 'en'`, `depth`), same error rules, `parseSerp(raw, depth)`. An empty organic page = nothing found (not a failure, unlike 18b-2).
- Stage 1 `"<name>" "<NNN-NNN-NNNN>"` (quotes stripped). Stage 2 `site:<host> "<name>" <city>` (no city when null). One `recordVendorCapture` per call: `source 'directories'`, `url 'citations:name_phone' | 'citations:site:<host>'`, `collectorVersion 'dfs/1'`. A vendor error → `vendor_error` capture, no rows for those hosts (P2).
- Before each call: `spentUsd + price > capUsd` → stop, `capped`, remaining hosts get no row.
- No phone or stage 1 failed (P4) → stage 2 for every catalogue host; never for a host stage 1 found. `not_found` rows carry the stage-2 capture; listed rows the finding capture. Also-found rows only from a successful stage 1. `upsertCitationRows` drops `isBannedHost` (defence).
- Upsert = one `INSERT … ON CONFLICT (competitor_id, host) DO UPDATE`: `first_seen_at` = checked_at on not-listed → listed, else kept; `last_seen_at` = checked_at when listed, else kept; `newly_found_at` = checked_at when `EXCLUDED.status='listed' AND c.status='not_found' AND EXCLUDED.in_catalogue`, NULL when not listed, else kept (P1); other columns replaced. If `stage1Ok`, delete the competitor's `in_catalogue = false` rows not in `rows` (P12).
**Tests (first):** `parseSerp` keeps `description` and honours `max` 50; the 18b-2 fixture still parses. Audit with fake dfs: phone → 1 stage-1 call + site calls only for unfound hosts; no phone → stage 2 for all; stage-1 vendor error → stage 2 for all, a `vendor_error` capture; **RF5** `stops before crossing 0.20` (budget spent 0.195 → no call, `capped`); **RF3** dental catalogue never sends `site:angi.com`; `banned host never stored` (stage-1 yelp hit with name+phone → no row, also not in also-found). Upsert: not_found → listed sets `newly_found_at`; first insert as listed leaves it null; listed → not_found keeps `first/last_seen_at`, nulls `newly_found_at`; a missed also-found host is deleted only when `stage1Ok`.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/citations src/rankings/serp.test.ts`; tsc (`@cs/db`, `@cs/collectors`, `@cs/demo`).

### Task 5: Client run + worker job
**Goal:** The daily due-scan, one guarded run per client (self, then top rivals), and the stale-run sweep.
**Files:** create `packages/collectors/src/citations/run.ts` (+ test); `apps/worker/src/jobs/citations.ts` (+ test), `apps/worker/src/{deps.ts,job-list.ts,concurrency.ts}`.
**Interfaces:**
```ts
export const CITATION_CADENCE_DAYS = 30; export const CITATION_REUSE_DAYS = 25; export const CITATION_RUN_STALE_HOURS = 3;
export async function listCitationDueClients(db: Db, now: Date): Promise<string[]>;
export async function auditedCompetitors(db: Db, clientId: string): Promise<{ selfId: string | null; rivalIds: string[] }>;
export async function runCitationAudit(deps: { db: Db; store: ObjectStore; dfs: DataForSeoClient; packs: (verticalId: string) => Promise<VerticalPack>; now?: () => Date },
  clientId: string): Promise<{ runId: string | null; status: 'done' | 'capped' | 'failed' | 'skipped'; calls: number; usd: number }>;
export async function failStaleCitationRuns(db: Db, now: Date): Promise<number>;
// worker deps: listCitationDueClients(now), runCitationAudit(clientId), failStaleCitationRuns(now), diffCitations(runId)
```
Jobs: `citation-audit` cron `0 9 * * *` (skip + log once when `!vendorsConfigured()`; first `failStaleCitationRuns`; enqueue each due client with `startAfter: i * CITATION_SPACING_SECONDS` (60) and `singletonKey 'citation:<clientId>:<yyyy-mm-dd>'`). `citation-audit-client { clientId }` (`SINGLE_SHOT_QUEUE`, `policy 'short'`) → `runCitationAudit`; when `runId` is set and the status is done/capped → `deps.diffCitations(runId)` → enqueue tag for each change id.
**Behaviour:**
- Due: `clientWorkAllowed ∧ agencyServiceable`; no `client_setup` row or `competitors_done_at` set; no `running` run; no run, or the newest done/capped `started_at ≤ now − 30 d` (only-failed runs → due again next day). Trigger `'setup'` without an earlier done/capped run, else `'monthly'`.
- `auditedCompetitors`: tracked rivals with tier `top` by `overlap DESC NULLS LAST, competitor_id`, ≤ 3; none → the 3 tracked rivals with the highest overlap (self excluded).
- Run: re-check `clientWorkAllowed`; empty catalogue or a live `running` row → `skipped`. Insert `running`. `checkRankScanBudget(db, clientId, Σ businesses × (stage1 + catalogue × depth10))`; `cap` → `capped`, 0 calls.
- Self (self competitor name; latest self `gbp_profile` phone, else `client.phone`; `client.address.city`, else `cityFromAddress`), then rivals (GBP phone, P5 city). Reuse ($0): every catalogue host has a non-`not_checked` row with `checked_at ≥ now − 25 d`. One shared budget, cap `CITATION_RUN_CAP_USD`.
- Finish `capped` if any business capped, else `done`; a non-vendor throw → `failed`. Store `calls`, `est_usd`, `competitor_ids` (reused included).
**Follow pattern:** `rankings/scan.ts` (`listRankClients`, `failStaleRankScans`, pause re-check); `jobs/rivals.ts` (`rival-monthly` spacing).
**Tests (first):** due list: competitors not done → excluded; no setup row → due; run 29 days ago → not due, 30 → due; spend-paused or archived client → excluded. Fallback rivals when no `top` tier, ≤ 3, self never included. Cap → `capped`, no vendor call. Reuse: a rival checked 10 days ago by another client → 0 calls, id still in `competitor_ids`. Stale `running` > 3 h → failed. Worker: cron enqueues with the singleton key; the client job calls diff and enqueues tags; vendors unconfigured → no enqueue; `concurrency.test.ts` passes.
**Done when:** `pnpm --filter @cs/collectors exec vitest run src/citations/run.test.ts`; `pnpm --filter @cs/worker exec vitest run src/jobs/citations.test.ts src/concurrency.test.ts`.

### Task 6: `citation_diff` stage
**Goal:** One global `citation_added` change per newly found rival host (C7), retry-safe.
**Files:** create `packages/engine/src/structured/citations.ts` (+ test), `packages/engine/src/index.ts`, `packages/db/src/schema/engine.ts` (`ChangeDetails.directory?: string; label?: string`), worker `deps.ts` (`diffCitations`).
**Interfaces:** `CITATION_DIFF_STAGE = 'citation_diff'`, `CITATION_DIFF_VERSION = 1`; `diffCitations(deps: { db: Db; packs: (v: string) => Promise<VerticalPack> }, runId: string): Promise<StageOutcome<{ changeIds: string[] }>>`.
**Algorithm (binding):**
```ts
// run must be done|capped (else throw). catalogue = citationCatalogue(await packs(client.verticalId)); hosts = catalogue.map(d => d.host)
// rows = SELECT l.* FROM citation_listing l
//   WHERE l.competitor_id = ANY(run.competitor_ids) AND l.competitor_id IS DISTINCT FROM client.self_competitor_id
//     AND l.competitor_id IN (SELECT competitor_id FROM client_competitor WHERE client_id = run.client_id)   -- tracked now
//     AND l.in_catalogue AND l.status = 'listed' AND l.host = ANY(hosts)
//     AND l.newly_found_at >= run.started_at AND l.capture_id IS NOT NULL
// each row -> { competitorId, source: 'directories', kind: 'added', afterCaptureId: l.capture_id, blockKey: `citation:${l.host}`,
//   beforeText: null, afterText: l.listing_title ?? label, stageVersion: 1, agencyId: null, clientId: null,
//   details: { changeType: 'citation_added', directory: l.host, label, url: l.listing_url } }
// runStage(db, { stage, version, subjectId: runId }, compute, (tx, rows) => insert … onConflictDoNothing().returning(id))
```
A rival reused by a later run of another client has `newly_found_at` < that run's `started_at` → no second change. `detected_change_unique` also dedupes a retry.
**Tests (first):** **RF4** `baseline silent` (first audit inserts listed rows, `newly_found_at` null → `[]`); not_found → listed in this run → one change with exact `details`, `blockKey 'citation:bbb.org'`, `afterCaptureId` = finding capture; `not_checked→listed silent` (no prior row → null); self row newly found → `[]`; `reused rival no second change` (client B run after A's, same rival → `[]`); `rerun idempotent` (second `diffCitations` → `ran: false`); a host removed from the catalogue → `[]`; a rival no longer tracked → `[]`.
**Done when:** `npx vitest run src/structured/citations.test.ts` (engine dir); tsc.

### Task 7: Scoring, labels, summary, grading, glossary
**Goal:** `citation_added` scores T/4, is archived, reads well everywhere, and lands as a Minor line under "rankings".
**Files:** `packages/engine/src/score/{score.ts,score-stage.ts}` (+ tests), `packages/db/src/schema/engine.ts` (`ScoreFactors.citationMinor?: boolean`), `packages/engine/src/tag/structured.ts` (+ test), `packages/engine/src/briefs/{graded.ts,evidence.ts}` (+ tests), `packages/core/src/{brief-report.ts,help/glossary.ts}` (+ tests), `packages/email/src/labels.ts` (+ test), `packages/tools/src/workspace/labels.ts`, `apps/web/src/lib/labels.ts` (only if a `Channel`/change-type map is keyed there; tsc decides).
**Code (binding, `scoreForClient`, right after `thresholds` is chosen):**
```ts
if (input.changeType === 'citation_added') { // C8: Minor, brief-only line; never an item or alert
  return { score: Math.round((thresholds.brief / 4) * 10) / 10, route: 'archive', factors: {
    typeWeight, size: 1, serviceOverlap: 1, wholeBusiness: true, territoryOverlap: 1, relevance: 1, novelty: 1, maxSimilarity: input.maxSimilarity,
    needsReviewCap: false, staleCap: false, profileCap: false, briefOnly: false, citationMinor: true,
    thresholds: { alert: thresholds.alert, brief: thresholds.brief }, scoringVersion: pack.scoring.version } };
}
// graded.ts groupChanges (P7):
const grade = r.changeType === 'citation_added' ? 'minor' : gradeFor(r.score, threshold);
```
**Behaviour:** `WHOLE_BUSINESS_TYPES` += `citation_added`. `detailsSignature`: `citation_added` → `` `citation_added|${d.directory ?? ''}` ``. `topicOf('citation_added')` = `'rankings'`; `TOPIC_LABEL.rankings` 'Map rankings' → **'Rankings & listings'** (controller ruling: directory lines and 18b-2 search lines sit there; copy review; update tests/previews asserting the old label). `CHANGE_LABELS.citation_added = 'new directory listing'`, `GROUP_PHRASE.citation_added = () => 'new directory listings'`. `EVIDENCE_CHANNEL_LABEL.directories` and `CHANNEL_LABELS.directories` = `'Online directories'`. `buildStructuredSummary`: `d.changeType === 'citation_added'` → `Now found on ${d.label ?? d.directory} in Google search` (via `redactForModel`). The tag stage maps no service (no model call). Glossary term `directory-listing`, "Directory listing", audience `all`, short: "A business's page on an online directory such as Yellow Pages, Facebook or the Better Business Bureau. Listings are checked once a month from Google search results; a page Google search does not show is "Not found in Google search", not "not listed"." (draft → copy review).
**Tests (first):** score T=40 → 10, route `archive`, `citationMinor true`; client thresholds `{alert 80, brief 60}` → 15; T=0 → 0, archive; `rescoreRecent` on a citation event keeps archive. `groupChanges` with T=0 → `minor`; 2 events, same rival → text `<name>: 2 new directory listings`, one event → `<name>: New directory listing — Now found on Better Business Bureau in Google search`. `topicOf` test covers every `CHANGE_TYPES` entry. The summary string equals the spec. The tag stage on a `citation_added` change makes no `ai.decide` call. `detailsSignature` differs per directory.
**Done when:** `npx vitest run src/score src/tag src/briefs/graded src/briefs/evidence` (engine dir); `pnpm --filter @cs/core exec vitest run`; `pnpm --filter @cs/email exec vitest run src/labels`.

### Task 8: `citation_gap` self-rule, starting point, readiness
**Goal:** The client's own missing or mismatched listings become a starting-point finding with the `fix_citations` play.
**Files:** `packages/engine/src/briefs/{self-rules.ts,starting-point.ts,readiness.ts}` (+ tests).
**Interfaces:** `SelfRuleInput.citations` exactly as spec; `loadSelfCitations(db: Db, clientId: string, selfId: string | null, catalogue: Directory[], rivalIds: string[]): Promise<SelfRuleInput['citations']>`; `StartingPointReadiness.checks.citations: boolean | null` (P9).
**Code (binding, inside the rule switch):**
```ts
case 'citation_gap': {
  const c = input.citations;
  if (!c || c.total === 0) break;
  const listed = c.missing.length >= param(rule, 'min_missing', 3) ? c.missing : [];
  if (listed.length === 0 && c.mismatched.length === 0) break;
  const labels = joinNames(listed.map((m) => m.label));
  const facts: string[] = [];
  if (listed.length) facts.push(`Google search found no listing for you on ${listed.length} of ${c.total} directories we check: ${labels}.`);
  for (const m of c.mismatched.slice(0, 2)) facts.push(`${m.label} shows a different ${m.field} for you than your Google profile.`);
  push(rule, score(rule, c.missing.length + 2 * c.mismatched.length, c.total), facts.join(' '),
    { missing: listed.length, total: c.total, directories: labels }, c.evidenceIds.slice(0, EVIDENCE_PER_FINDING));
  break;
}
```
**Behaviour:**
- Loader: self rows for current catalogue hosts with `in_catalogue`. `total` = rows `listed`|`not_found`. `missing` = `not_found` rows (catalogue order) with `rivalsListed` = count of `rivalIds` listed on that host. `mismatched` = listed rows with `name_match = false` → `'name'`, `phone_match = false` → `'phone'`. `evidenceIds` = `evidence.id` of those rows' `capture_id`s. `checkedAt` = max `checked_at`. Null when no self or no checked row. `not_checked` never counts.
- `starting-point.ts` passes `citations` (rivals = `auditedCompetitors`) and renders the action with `{ topic, directories: String(f.values.directories ?? '') }`.
- Readiness: `citations` = true when the client has a `citation_audit_run` with status in (done, capped, failed). Null when no self competitor or `citationCatalogue` is empty. `ready` requires `citations !== false`.
**Tests (first):** 4 of 9 missing (min 3) → fact `Google search found no listing for you on 4 of 9 directories we check: Manta, Foursquare, MapQuest and Angi.`; 2 missing, no mismatch → no finding; 1 phone mismatch → fact `Yellow Pages shows a different phone for you than your Google profile.`; score = `0.6 × min(1, (4 + 2)/9)` = 0.4; null citations → skipped; no evidence → dropped; `not_checked` hosts excluded from `total`. Starting point renders "Add your business to Manta, Foursquare… using each directory's sign-up page…". Readiness: no run → not ready, failed run → `citations true`, no self → null.
**Done when:** `npx vitest run src/briefs/self-rules src/briefs/starting-point src/briefs/readiness` (engine dir).

### Task 9: Tool `get_citation_audit`
**Goal:** One registered read for web, MCP and Friday, tenant-checked, with citable evidence.
**Files:** create `packages/tools/src/tools/citations.ts` (+ test); `tools/{all,schemas}.ts`; `isolation/fixtures.ts`; `tools/channels.test.ts`; `access-marks` snapshot + `docs/superpowers/specs/2026-10-12-phase-8b-tool-access.md`; `packages/mcp/src/{server,integration}.test.ts` (tool + client-read lists); `packages/ask/src/labels.ts` (`get_citation_audit: 'Checking directory listings…'`).
**Interfaces:** `CitationAuditView` zod in `schemas.ts` = spec output + `alsoFoundOn: z.array(z.object({ host, listingUrl, evidenceId: z.string().nullable() }))` (P10); no `preprocess`/`transform`. `defineTool({ name: 'get_citation_audit', access: 'read', input: z.object({ clientId: uuid }), output: CitationAuditView, permission: 'read', channels: ['web','mcp','ask'], feature: 'dashboard' })`. Description names "online directories" and says evidence ids are what to cite; no vendor.
**Behaviour:**
- `allInOrder([workspaceClient(...), withTenant(app, ctx, tx => [latest run, rows])])`, then evidence by capture id on `deps.service` beside `workspaceBusinesses` (pattern `get_search_visibility`).
- Businesses = self (when `selfCompetitorId`) + the latest run's rival ids still tracked, in the run's order. `directories` = `citationCatalogue(pack)` (`catalogOf(deps)`). Each business has one listing per directory; a missing row → `not_checked` with nulls. Rows outside the catalogue are hidden from `listings`.
- `status`: `never` (no run), else the latest run's status (`failed` maps to the previous done/capped run's status, or `never`). `checkedAt` = the newest `finished_at` among done/capped runs.
- `alsoFoundOn` = self rows with `in_catalogue = false`, `status 'listed'`, host not in the catalogue.
- `evidenceId` filtered by `citableEvidenceKinds(meta)` (MCP: null for `vendor_json`). Names off-web through `forChannel`. No dollars or vendor.
**Tests (first):** seeded run → exact shape; no run → `status 'never'`, every cell `not_checked`; no self → `selfMissing true`, rivals still listed; a banned or uncatalogued row never appears in `listings`; also-found only for self; **RF5** out-of-scope client → `not_found`; isolation completeness passes with `get_citation_audit: client()`; `channels.test` + MCP lists updated; access-marks snapshot updated; `no usd keys or dollar text`.
**Done when:** `pnpm --filter @cs/tools exec vitest run src/tools/citations src/isolation src/tools/channels src/access-marks`; `pnpm --filter @cs/mcp exec vitest run src/server.test.ts`; tsc.

### Task 10: Listings page, nav, help, demo, gate
**Goal:** The client page `/c/<id>/listings` with three sections, decided copy, help and guides.
**Files:** create `apps/web/src/app/(app)/c/[clientId]/listings/{page.tsx,page.test.tsx,listings-view.tsx}`; `components/shell/{nav-items.ts,nav-link.tsx}` (+ nav test); `help/copy/client.ts` (`'client.listings'`); `docs/help/pages/client.listings.{client,agency}.md`; `packages/demo/src/{citations.ts,seed.ts,coverage.ts}`.
**Interfaces:** nav `add(\`${base}/listings\`, 'Listings', 'listings')` right after `Local rankings`; `IconKey` += `'listings'` (lucide `ListTree` or `Building2` in `nav-link.tsx`). `HELP_KEY = 'page:client.listings'`; `metadata.title = 'Listings'`.
**Behaviour:**
- Page: `requireContext`; `hasFeature(ctx,'dashboard')` else `notFound()`; `PageHeader` (title "Listings", `clientCrumbs`, sub-line verbatim); `<Suspense fallback={<PageSkeleton/>}>` around the body; one `Promise.all` of `get_client_profile`, `get_citation_audit`, `helpGuides`.
- One sheet (`Section`s, no cards). **"Your listings"**: a table, one row per directory: label, status chip (**Listed** / **Not found in Google search** / **Not checked yet**), name ("Name matches" / "Name differs"), phone ("Phone matches" / "Shows a different phone: <formatPhone>"), "Address: not checked", an "Add listing" link (`add_listing_url`, external, `rel="noopener noreferrer"`) when not found, and the listing link when listed. **"You vs top rivals"**: a matrix (directories × you + ≤ 3 rivals) of status chips. **"Also found on"**: self links only; hidden when empty.
- States: `status 'never'` → "Your first check runs once your competitors are set."; `selfMissing` → "Link your Google listing in Client settings to check your listings." (rival matrix still shown). Dates in viewer tz (`formatDate`). Chip tones from fixed tints (`lib/labels.ts` map `CITATION_STATUS`). Phone layout at 390 px: the matrix scrolls inside `TableFrame`, never the page.
- Help copy: description + tips (`notFound`, `nameMatch`, `alsoFound`), each with a `// source:` comment. Guides (client + agency): what it shows, monthly cadence, that "not found" means Google search didn't show it, how to add a listing, that the address is not checked yet. No vendor. Owner runs `pnpm kb:seed`.
- Demo: Lone Star gets a done run with a mix of statuses + one also-found row; coverage `{ route: 'c/[clientId]/listings', calls: [{ tool: 'get_citation_audit', path: 'businesses.*.listings' }] }`; `coverage:readme`.
**Tests (first):** page test: listed / not found / not checked chips and copy strings verbatim; "Add listing" only on not-found rows; never-state and no-self copy; also-found hidden when empty; no `dashboard` → 404. Nav test: "Listings" follows "Local rankings" and is hidden without `flags.dashboard`. `help/coverage.test.ts` and `copy-bundle.test.ts` pass. `client-boundary.test.ts` passes.
**Done when:** `pnpm --filter @cs/web exec vitest run "src/app/(app)/c/[clientId]/listings" src/components/shell src/help src/client-boundary.test.ts`; `pnpm --filter @cs/web exec tsc --noEmit`; `pnpm design:lint`; `pnpm --filter @cs/demo exec vitest run src/coverage.test.ts`; `bash apps/web/scripts/profile-gate.sh --seed` (listings ≤ 8 DB stages; never alongside E2E).

### Task 11: Operator directory groups
**Goal:** Platform staff tick `citations.groups` when reviewing a business type (C4, P11).
**Files:** `packages/tools/src/tools/platform-verticals.ts` (+ test), `apps/web/src/app/(platform)/platform/verticals/catalog-queue.tsx` (+ test), `apps/web/src/app/(platform)/platform/actions.ts`, review list output (`list_catalog_review` gains `citationGroups: CitationGroup[]`).
**Interfaces:** `review_vertical` input `action: z.enum(['approve', 'rename', 'groups'])`, `citationGroups: z.array(z.enum(CITATION_GROUPS)).min(1).optional()`; `approve` also accepts `citationGroups`.
**Behaviour:** `groups` (and `approve` with groups) → `UPDATE vertical SET config = jsonb_set(config, '{citations,groups}', $groups, true), version = version + 1, updated_at = now()`. Never on `generic` or merged rows (`not_found`). Then `catalogOf(deps).invalidate()`. Refuse a selection whose union exceeds 15 hosts: `invalid_input`, "Pick fewer directory groups (15 directories at most).", `userFacing`. Card: a fieldset "Directories to check" with one checkbox per group (labels "General directories", "Home services", "Dental and health"), default = current groups, 36 px controls, staff-only (`canEdit`). The labels go through copy review.
**Tests (first):** staff sets `['general','dental_health']` → assembled pack catalogue = general + ADA, version bumped; viewer → refused; `generic` → `not_found`; empty array → `invalid_input`; the existing approve/rename tests still pass; card renders the boxes checked from data.
**Done when:** `pnpm --filter @cs/tools exec vitest run src/tools/platform-verticals src/isolation`; `pnpm --filter @cs/web exec vitest run "src/app/(platform)/platform/verticals"`.

### Task 12: Evals, copy, docs, backlog
**Goal:** Replay is green, the copy is queued for sign-off, and the runbook and gotchas are written.
- [ ] `pnpm eval:replay`. For each missing suite (expected: `ask`, since a new Ask tool and world rows were added), **state the cost first** (ask full ≈ $1.6; `record --fill` first). Then re-record within `--max-usd 5`; stop on a 402 or a repeated failure and report. Commit the cassette + baseline.
- [ ] `pnpm copy:status` lists the new strings (page, help, play, glossary, operator labels, summaries) as unsigned; add nothing to `signoff.json`.
- [ ] `docs/OPS.md` § "Directory listings (18c-1)": cron, cadence, cost/cap, how to read a run (`citation_audit_run`), re-running a client (delete the `running` row only when stale), and the ops SQL for the most common uncatalogued hosts:
  `SELECT host, count(DISTINCT competitor_id) n FROM citation_listing WHERE NOT in_catalogue AND status = 'listed' GROUP BY host ORDER BY n DESC LIMIT 30;`
- [ ] Gotchas: collectors `CLAUDE.md` (two-stage search, P2/P3, banned hosts, `newly_found_at`); engine (`citation_added` deterministic T/4 archive, forced Minor); verticals (groups live in generic only; `citationCatalogue` returns [] for YAML-only non-generic packs; `min_missing` read from the rule params).
- [ ] Work file § New backlog: **18c-2** (listing-page NAP + address via the crawler after prod + `/bot` + `WEB_MONITORING_ENABLED`); platform page for uncatalogued hosts; "check now"; scorecard row; editing groups on already-reviewed verticals; the no-self "Link Google listing" prompt (phase-16 item).
**Done when:** `pnpm eval:replay` exits 0; `pnpm copy:status` runs; `git ls-files --eol | grep crlf` empty.

### Task 13: Final review (controller, top model)
- [ ] Whole-branch review on the top model against the spec (C1–C12), this plan's P1–P12 and the Review focus list. Re-run each RF pinning test by name.
- [ ] `pnpm test:affected` then `pnpm e2e:affected --full` (once each, in the background, own test DB). One fix wave, focused re-runs only.
- [ ] Work file § Status/Next: owner steps = migrate 0107 → deploy worker, then web; `pnpm kb:seed`; `pnpm copy:review`; on staging, wait for the 09:00 UTC run (or run `citation-audit-client` for one client), then check `/c/<id>/listings`, one `citation_audit_run` cost ≤ $0.20 and that no banned host is in `citation_listing`.
**Done when:** both suites green, the review is clean after the fix wave, and the work file is updated.
