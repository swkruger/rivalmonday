# Phase 6c — Knowledge base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Lean plan format (root `CLAUDE.md`): Interfaces are binding; full code only for SQL/RLS, security logic, non-obvious algorithms and decided copy.

**Goal:** Platform operators curate knowledge articles at platform / agency / client level. Friday retrieves them through `search_knowledge` and cites `[kb:<id>]`, users open them in a read-only sheet, and MCP `search`/`fetch` return them.

**Architecture:** Two tables, `kb_article` and `kb_chunk`, with read-only RLS for app roles; writes go through operator-only `@cs/tools` platform tools on the service connection. Chunks are rebuilt in the write transaction and embedded by a worker job. Retrieval is FTS + vector fused with the existing `rrfMerge`. URL import and weekly auto-sync are worker jobs on the existing polite renderer, gated by `KB_IMPORT_ENABLED`.

**Tech stack:** Postgres 18 + pgvector (512 d), Drizzle, zod, pg-boss, Next.js App Router, existing `@cs/engine` `extractBlocks` (cheerio).

**Spec:** `docs/superpowers/specs/2026-10-12-phase-6c-knowledge-design.md` (decisions k1–k11 are binding). Also see the 6b spec (e5/e6 grounding) and 6a spec d12 (redaction).

## Global constraints
- Migrations `0045_kb` and `0046_kb_rls` (next free after 6b's 0044). Never edit 0038–0044.
- Article body ≤ 204,800 bytes; ≤ 200 chunks; chunk ≤ 1,500 chars; `search_knowledge` `limit` 1–8 (default 5); ≤ 2 chunks per article in results; query ≤ 300 chars; title 1–200 chars.
- Hidden, unknown, unpublished or foreign ids, and a non-visible `clientId`, return **`not_found`**. Non-operators on operator pages or tools get `permission_denied`, which the page turns into a **404**.
- Text leaving through the `ask`/`mcp` channels: `renderKbText` first, then `redactForModel`. Never bare `redactContactInfo`.
- Crawler conduct: only through the worker's polite renderer (robots RFC 9309, 5xx ⇒ disallow, ≥ 3 s/host, `RivalMondayBot` UA). One shared `HostRateLimiter`.
- `KB_IMPORT_ENABLED`: `'true'` enables import/sync; anything else disables it. Add it to turbo `globalPassThroughEnv` and to playwright `E2E_SERVER_ENV` (as `''`).
- Copy (decided): viewer missing state **"This article is no longer available."**; seed rows **"Managed in repo"**; level labels **"Help"** (platform), **"From your agency"** (agency), **"Your business"** (client); sync badge **"Synced {date} · changed"**.
- Web reads are registered tools; web writes go through `runTool`. Commits end with the session's `Co-Authored-By` trailer. LF only.

## Decisions (plan-level, this plan only)
| # | Decision |
|---|---|
| S1 | **Fetch path:** the worker's existing `createPoliteRenderer` (Playwright) and shared limiter. There is no plain-fetch renderer in the repo, so the spec's "plain first" step is dropped; conduct is identical. **Extraction:** `@cs/engine` `extractBlocks(html)` (consent/nav filtered) → new `blocksToMarkdown`. No new dependency. |
| S2 | **Import result:** the `kb-import` job's pg-boss output is `{ articleId } \| { error: ImportError }`. `JobStatusLookup` gains `output: unknown`. UI polls the new tool `get_kb_import_status`. |
| S3 | `renderKbText`, `lintKbText`, `chunkMarkdown`, `KB_KINDS`, `KB_LEVELS` live in `packages/core/src/kb.ts` (used by tools, worker and seed). |
| S4 | **Write path:** `packages/tools/src/kb/write.ts` `saveArticle` on `deps.service` in one transaction. Publish (re)builds chunks with copied scope + `client_visible`; draft deletes chunks. Chunks are inserted with `embedding = null`. |
| S5 | **Embedding:** job `kb-embed` `{ articleId?: uuid }`. With an id it embeds that article's null chunks; without one it sweeps ≤ 500 null chunks. Hourly cron sweep `15 * * * *` covers seed, failed enqueues and enqueue-less callers. Tools enqueue best-effort (`deps.enqueue?.`, errors swallowed and logged). |
| S6 | `AppTarget` gains `{ t: 'kb'; id: string }` → `/kb/<id>`. |
| S7 | **Seed CLI:** `apps/worker/src/cli/kb-seed.ts`; root script `"kb:seed": "pnpm --filter @cs/worker kb-seed"`; `@cs/demo` reset calls the same `seedKnowledge(db, dir)` from `@cs/tools`. |
| S8 | **Sync cron:** `kb-sync` `0 5 * * 0` (Sundays 05:00 UTC), processed sequentially. |
| S9 | **Visibility:** in `search_knowledge`, client-level rows are included only when `clientId` is given: SQL filter `level <> 'client' OR client_id = $clientId`, on top of RLS. |
| S10 | The platform Ask thread view's `kb:` chips link to `/platform/knowledge/<id>` (operator editor), not the tenant sheet. |
| S11 | The Ask prompt text is decided (Task 8). |

## File structure
- `packages/db/migrations/0045_kb.sql`, `0046_kb_rls.sql`; `packages/db/src/schema/knowledge.ts` (+ export in `schema/index.ts`); `packages/db/test/kb-rls.test.ts`.
- `packages/core/src/kb.ts` (+ `kb.test.ts`); `packages/core/src/links.ts` (S6).
- `packages/tools/src/kb/write.ts`, `kb/blocks-to-markdown.ts`, `kb/seed.ts`; `packages/tools/src/tools/knowledge.ts` (tenant tools), `tools/knowledge-admin.ts` (operator tools); `tools/all.ts`; `deps.ts` (QueueJob, JobStatusLookup); `search.ts`/`fetch.ts`/`search/fetch-item.ts` (MCP type).
- `apps/worker/src/jobs/kb.ts` (+ test); `jobs.ts` registration; `deps.ts`; `cli/kb-seed.ts`.
- `packages/ask/src/citations.ts`, `turn.ts`, `prompt.ts`.
- `apps/web`: `components/kb/article-sheet.tsx`, `components/ask/answer.tsx`; `app/(app)/kb/[id]/page.tsx`; `app/(app)/platform/knowledge/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts,editor.tsx}`; `server/env.ts`; `e2e/kb.spec.ts`.
- `docs/help/*.md` (3 seed articles); `turbo.json`; `apps/web/playwright.config.ts`; root `package.json`.

## Dependencies on in-flight work (re-check in Task 0)
- `phase-6` head `5da3a78` contains 6a+6b. `main` @ `89dbbd8` (skills chore). Confirm it is an ancestor; otherwise rebase.
- `phase-7-planning` is parked, docs only, no code overlap.
- Assumes the 6b names still hold: `CITATION_PREFIXES`, `collectEvidence`, `buildSystemPrompt`, `answer.tsx` marker rendering, `rrfMerge`, `requirePlatformOperator`, `extractBlocks`, `createPoliteRenderer`, `app_agency_id()`/`app_role()`/`app_client_visible()`.

## Review focus
1. **Client user, agency playbook with `client_visible=false`**: never appears in `search_knowledge`, the sheet, `/kb/<id>` or MCP. Pinned in Task 1 (RLS) and Task 4 (tool).
2. **Agency admin asking in client A's thread**: never gets client B's `fact` articles (S9 + Ask pin). Pinned in Task 4 and Task 8.
3. **White-label agency**: no "Rival Monday"/"Friday" leaks from platform help through Ask, MCP `fetch` or the sheet, including inside chunk text sent to the model. Pinned in Task 4 and Task 9.
4. **Unpublishing or deleting a cited article**: the old answer still renders and the chip shows "This article is no longer available."; the model can't cite it in new turns. Pinned in Task 3 and Task 10.
5. **Imported page with contact details or prompt-injection text**: redacted and wrapped as `<data>` like evidence, never followed. Pinned in Task 6 (redaction at the tool boundary) and Task 8 (data block).

---

### Task 0: Pre-flight
- `git merge-base --is-ancestor main HEAD` or rebase `phase-6` on `main`; re-check "Dependencies on in-flight work" with `grep` for each named symbol; fix plan paths that drifted (note them in the work file).
- `bash scripts/local-test-db.sh start` and apply migrations to this worktree's test DB.
- **Done when:** all symbols found; `pnpm test:affected` green on the untouched branch.

### Task 1: Schema, migrations and RLS
**Files:** create `packages/db/migrations/0045_kb.sql`, `0046_kb_rls.sql` (via `pnpm --filter @cs/db generate --custom --name=kb` / `kb_rls`), `packages/db/src/schema/knowledge.ts`, `packages/db/test/kb-rls.test.ts`; modify `schema/index.ts`.
**Interfaces:** Drizzle `kbArticle`, `kbChunk` mirroring the SQL (column names camelCase). `search_tsv` stays SQL-only (as 0039).
**SQL (`0045_kb`):** exactly the spec's `CREATE TABLE` blocks, plus:
```sql
ALTER TABLE kb_article ADD CONSTRAINT kb_article_client_agency_fk
  FOREIGN KEY (client_id, agency_id) REFERENCES client(id, agency_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE kb_chunk ADD COLUMN client_visible boolean NOT NULL DEFAULT true;
```
`client(id, agency_id)` is already an FK target (0042 `ask_thread`), so no new constraint is needed.
**SQL (`0046_kb_rls`):**
```sql
REVOKE ALL ON kb_article, kb_chunk FROM app_user;
--> statement-breakpoint
GRANT SELECT ON kb_article, kb_chunk TO app_user;
--> statement-breakpoint
ALTER TABLE kb_article ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kb_article FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_article_read ON kb_article FOR SELECT USING (
  status = 'published' AND (
    level = 'platform'
    OR (level = 'agency' AND agency_id = app_agency_id()
        AND (client_visible OR app_role() NOT IN ('client_owner','client_viewer')))
    OR (level = 'client' AND agency_id = app_agency_id() AND app_client_visible(client_id))));
--> statement-breakpoint
ALTER TABLE kb_chunk ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kb_chunk FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_chunk_read ON kb_chunk FOR SELECT USING (
  level = 'platform'
  OR (level = 'agency' AND agency_id = app_agency_id()
      AND (client_visible OR app_role() NOT IN ('client_owner','client_viewer')))
  OR (level = 'client' AND agency_id = app_agency_id() AND app_client_visible(client_id)));
```
Check what `app_role()` returns when unset (NULL ⇒ `NOT IN` is NULL ⇒ row hidden, which is the safe outcome). Check how `app_service` is granted in 0043 and mirror it (service writes).
**Tests (`kb-rls.test.ts`, follow `packages/db/test/ask-rls.test.ts`):**
- platform published row visible to any agency user; a draft is invisible.
- agency row: own agency's admin sees it, another agency doesn't; client_owner sees it with `client_visible=true` and not with `false`; agency AM sees it with `false`.
- client row: user scoped to A sees it, user scoped to B doesn't, other agency doesn't.
- app_user INSERT/UPDATE/DELETE on both tables ⇒ permission error.
- CHECK rejects `level='platform'` with `agency_id`; composite FK rejects a client row whose `agency_id` ≠ the client's agency.
**Done when:** `pnpm --filter @cs/db exec vitest run kb-rls` green; `pnpm --filter @cs/db typecheck` green.

### Task 2: `@cs/core` kb helpers and link target
**Files:** create `packages/core/src/kb.ts`, `kb.test.ts`; modify `packages/core/src/index.ts`, `links.ts`, `links.test.ts`.
**Interfaces:**
```ts
export const KB_LEVELS = ['platform', 'agency', 'client'] as const; export type KbLevel = (typeof KB_LEVELS)[number];
export const KB_KINDS = ['help', 'playbook', 'qa', 'blog', 'fact'] as const; export type KbKind = (typeof KB_KINDS)[number];
export const KB_MAX_CHUNKS = 200; export const KB_CHUNK_CHARS = 1500; export const KB_MAX_BODY_BYTES = 204_800;
export function renderKbText(text: string, names: { productName: string; assistantName: string }): string;
export function lintKbText(level: KbLevel, text: string): string[];
export function chunkMarkdown(md: string): { chunks: string[]; truncated: boolean };
```
`AppTarget` adds `{ t: 'kb'; id: string }`; `appPath` → `/kb/<id>`.
**Behaviour:**
- `renderKbText` replaces `{{product}}` and `{{assistant}}` (whitespace inside braces allowed: `{{ product }}`). Unknown `{{x}}` stays literal. It's a pure function.
- `lintKbText`: only for `platform`. Case-insensitive whole-word "Rival Monday" ⇒ `'Uses "Rival Monday": write {{product}} so white-label agencies see their own name.'`; whole-word "Friday" ⇒ `'Uses "Friday": write {{assistant}} so renamed assistants show their own name.'` (decided copy). Also takes `truncated` warnings from the caller (not here).
- `chunkMarkdown` algorithm:
  1. Split into sections at ATX headings (`#`–`######`), tracking the heading path (`A › B`).
  2. Within a section, pack paragraphs (blank-line separated) greedily into ≤ 1,500 chars including the prefix line `<path>\n\n`.
  3. A single paragraph > budget is hard-split at the last sentence end (`. ` / `? ` / `! `) before the limit, else at the limit.
  4. Drop empty chunks.
  5. Cap at 200 (`truncated: true` when capped).
  6. Code fences are never split mid-fence unless they alone exceed the budget.
**Tests:** placeholder variants + unknown stays; lint hits/misses ("Fridays" is not a hit; agency level ⇒ `[]`); heading path prefix; packing boundary exactly 1,500; oversize paragraph split at a sentence; 201-section doc ⇒ 200 + truncated; empty doc ⇒ `[]`; `appPath({t:'kb',id:'k1'})` = `/kb/k1`.
**Done when:** `pnpm --filter @cs/core exec vitest run kb links` green.

### Task 3: Write service and operator tools
**Files:** create `packages/tools/src/kb/write.ts` (+ test), `packages/tools/src/tools/knowledge-admin.ts` (+ test); modify `tools/all.ts`, `deps.ts`.
**Interfaces:**
```ts
// deps.ts
export type QueueJob = /* existing */ | 'kb-embed' | 'kb-import';
export type JobStatusLookup = (job: QueueJob, singletonKey: string) =>
  Promise<{ state: JobState; createdOn: Date; completedOn: Date | null; output: unknown } | null>;
// kb/write.ts
export interface ArticleInput { id?: string; level: KbLevel; agencyId?: string | null; clientId?: string | null; kind: KbKind;
  title: string; bodyMd: string; clientVisible?: boolean; status: 'draft' | 'published' }
export async function saveArticle(service: Db, userId: string, input: ArticleInput,
  extra?: { source?: 'manual' | 'url' | 'seed'; sourceUrl?: string | null; seedKey?: string | null; autoSync?: boolean }):
  Promise<{ id: string; lintWarnings: string[]; chunkCount: number }>;
export async function rechunk(tx: Tx, articleId: string): Promise<number>;
```
Tools (channels `['web']`, every handler calls `requirePlatformOperator` first, audited):
- `list_kb_articles({ level?, agencyId?, clientId?, kind?, status?, q?, cursor?, limit? })` → `{ items: { id, title, level, kind, status, source, agencyName, clientName, autoSync, lastSyncedAt, syncError, updatedAt }[], nextCursor }` (follow `listReviewableAskThreads` paging).
- `get_kb_article_admin({ id })` → full row incl. `previousBodyMd`.
- `upsert_kb_article(ArticleInput)` → `{ id, lintWarnings }`.
- `delete_kb_article({ id })` → `{ ok: true }`.
- `set_kb_auto_sync({ id, autoSync })` → `{ ok: true }`.

**Behaviour:**
- Updating a `source='seed'` row ⇒ `ToolError('invalid_input', 'Managed in repo')`, and so does deleting one.
- `level`/target validation: an agency must exist; a client must belong to the agency. Platform ⇒ both null.
- `clientVisible` is honoured only at agency level (forced true elsewhere).
- Changing level/target on an existing article is allowed; the rechunk copies the new scope.
- `saveArticle` runs in one tx: upsert the row (`updated_by`, `updated_at = now()`), then `rechunk` when `published`, else delete chunks. After commit, best-effort `deps.enqueue?.('kb-embed', { articleId }, 'kb-embed:'+id)`.
- `lintWarnings` = `lintKbText` + `'Too long: only the first 200 sections are searchable.'` when truncated (decided copy).
- `set_kb_auto_sync(true)` on a non-url article ⇒ `invalid_input`. Turning it on resets `sync_failures` and `sync_error`.

**Tests:** non-operator ⇒ `permission_denied` for every tool; publish creates chunks with copied scope/`client_visible`; draft → chunks removed; republish with edited body replaces chunks; seed row refuses update/delete; client from another agency ⇒ `invalid_input`; lint warnings returned; enqueue absent ⇒ still succeeds; audit row written.
**Done when:** `pnpm --filter @cs/tools exec vitest run knowledge-admin kb/write` green.

### Task 4: `search_knowledge` and `get_kb_article`
**Files:** create `packages/tools/src/tools/knowledge.ts` (+ test); modify `tools/all.ts`.
**Interfaces:**
```ts
search_knowledge: input { query: string(1..300), clientId?: uuid, kinds?: KbKind[], limit?: int(1..8) = 5 }
  → { results: { kbId: string; title: string; kind: KbKind; level: KbLevel; updatedAt: string; chunks: string[] }[] }
  channels ['web','ask','mcp'], mcpScope read
get_kb_article: input { kbId: uuid } → { kbId, title, kind, level, bodyMd, sourceUrl: string | null, updatedAt: string }
  channels ['web']
```
**Behaviour:**
- Reads through `withTenant(deps.app, ctx, …)`, so RLS does the visibility.
- `clientId` given ⇒ must be visible (`searchClient`/existing client check), else `not_found`.
- S9 filter applies; `kinds` filters by the article's kind (join `kb_article`).
- Ranking: FTS `websearch_to_tsquery('english', q)` top 20 chunks by `ts_rank_cd`; vector top 20 by cosine when `deps.embedQuery` exists; `rrfMerge` (k = 60). Group by article in fused order, ≤ 2 chunks per article, `limit` articles.
- Text: `renderKbText` with the viewer's names (`productNameFor` + agency `assistantName`; follow how `@cs/ask` resolves them). For `meta.channel` `ask`/`mcp`, also `redactForModel`.
- `get_kb_article`: RLS read; missing ⇒ `not_found`. `bodyMd` placeholder-rendered (no redaction on `web`, since the viewer is a human in-tenant).
- Follow pattern: `tools/search.ts` (FTS/vector/rrf), `search/scope.ts`.

**Tests:**
- FTS-only ranking when `embedQuery` is absent; vector + FTS fusion order with a stub `embedQuery`; ≤ 2 chunks per article.
- Client role excludes a `client_visible=false` agency article (**RF1**).
- Agency admin with `clientId=A` gets no client-B fact, and without `clientId` gets no client facts at all (**RF2**).
- White-label agency: `{{product}}` → agency product name; a literal-free result for platform text (**RF3**).
- `ask` channel redacts an email in chunk text; `web` channel doesn't.
- Draft/foreign `kbId` ⇒ `not_found`; non-visible `clientId` ⇒ `not_found`.

**Done when:** `pnpm --filter @cs/tools exec vitest run knowledge` green.

### Task 5: Worker `kb-embed`
**Files:** create `apps/worker/src/jobs/kb.ts` (+ `kb.test.ts`); modify `apps/worker/src/jobs.ts`/`main.ts` registration and `deps.ts` (embed fn).
**Interfaces:** `createKbJobs(deps: WorkerDeps)` → `{ embed, importUrl, sync }` (import/sync come in Task 6). `kb-embed` schema `z.object({ articleId: z.uuid().optional() })`, queue `short`, retryLimit 3 with backoff, cron `15 * * * *` with `{}`.
**Behaviour:**
- Select chunks `embedding IS NULL` (by article, or ≤ 500 globally ordered by article, ord) on the service connection.
- Embed in batches of 64 via the existing embeddings task (512 d), then update by id.
- Embedding provider not configured (`engineConfigured()` false) ⇒ return.
- A chunk deleted mid-run ⇒ its update is a no-op.
- Follow pattern: `jobs/ask.ts` (defineJob), `engine/src/tag/structured.ts` (embedding calls).

**Tests:** fake embedder: embeds only null rows; batch boundary 65 rows ⇒ 2 calls; no-article sweep caps at 500; not configured ⇒ no calls.
**Done when:** `pnpm --filter @cs/worker exec vitest run jobs/kb` green.

### Task 6: URL import, auto-sync and the env flag
**Files:** create `packages/tools/src/kb/blocks-to-markdown.ts` (+ test); modify `apps/worker/src/jobs/kb.ts` (+ test), `apps/worker/src/deps.ts`, worker env parsing, `apps/web/src/server/env.ts` (+ test), `turbo.json`, `apps/web/playwright.config.ts`, `packages/tools/src/tools/knowledge-admin.ts` (+ test), the web/worker `JobStatusLookup` implementation (add `output`).
**Interfaces:**
```ts
export function blocksToMarkdown(blocks: Block[]): string;   // heading paths (h1–h6 in Block.path) → '#'s; others → paragraphs; list items → '- '
export type ImportError = 'disabled' | 'robots_disallowed' | 'blocked' | 'http_error' | 'no_content' | 'off_site' | 'fetch_failed';
// tools
import_kb_url({ url: string(url, http/https only), level, agencyId?, clientId?, kind, autoSync: boolean }) → { key: string }
get_kb_import_status({ key: string }) → { state: 'queued' | 'running' | 'done' | 'failed'; articleId?: string; error?: ImportError }
// jobs
'kb-import': { key, url, level, agencyId?, clientId?, kind, autoSync, userId } → output { articleId } | { error: ImportError }
'kb-sync': {} (cron '0 5 * * 0')
```
**Behaviour:**
- **Flag:** web env `kbImport: env.KB_IMPORT_ENABLED?.trim() === 'true'` and the same in the worker. `import_kb_url` and `get_kb_import_status` refuse with `not_found` when off (deps gain `kbImportEnabled?: boolean`), and the worker jobs return `{ error: 'disabled' }` / no-op.
- **Import:** polite render → map `RenderStatus` to `ImportError` → `extractBlocks(html)` → `blocksToMarkdown` → empty ⇒ `no_content`. Truncate to `KB_MAX_BODY_BYTES` on a paragraph boundary. Title = page `title` trimmed to 200, else the URL host. Then `saveArticle(..., status 'draft', { source:'url', sourceUrl: finalUrl, autoSync })`. Close the page in `finally`.
- **Sync:** for each `status='published' AND auto_sync`, sequentially:
  - same fetch/extract;
  - **changed** (compare whitespace-normalised text) ⇒ `previous_body_md = body_md`, set new body, `last_synced_at = now()`, `sync_failures = 0`, `sync_error = null`, rechunk + enqueue embed;
  - **unchanged** ⇒ `last_synced_at` only (+ reset failures);
  - **failure** ⇒ `sync_error = <ImportError>`, `sync_failures += 1`, and `auto_sync = false` when it reaches 3.
- Imported body text is stored raw; redaction happens at read (Task 4) (**RF5**).

**Tests:**
- `blocksToMarkdown` headings/lists/paragraphs.
- Import with a fake renderer: ok ⇒ draft with `source='url'`; robots ⇒ `robots_disallowed`, no row; HTTP 503 ⇒ `http_error`; empty ⇒ `no_content`; flag off ⇒ `disabled`.
- Sync: changed ⇒ previous kept, rechunked; unchanged ⇒ only timestamp; third failure ⇒ auto_sync off; success resets the count.
- Env: `KB_IMPORT_ENABLED='true'` ⇒ true, `'1'` ⇒ false.
- Tool refuses when the flag is off; non-operator ⇒ `permission_denied`.

**Done when:** `pnpm --filter @cs/worker exec vitest run jobs/kb`, `pnpm --filter @cs/tools exec vitest run blocks-to-markdown knowledge-admin`, `pnpm --filter @cs/web exec vitest run env` green.

### Task 7: Repo seed and help articles
**Files:** create `packages/tools/src/kb/seed.ts` (+ test), `apps/worker/src/cli/kb-seed.ts`, `docs/help/connect-an-ai-app.md`, `docs/help/asking-the-assistant.md`, `docs/help/reading-your-brief.md`; modify root `package.json` (`kb:seed`), `apps/worker/package.json` (`kb-seed` script, follow existing cli scripts), `@cs/demo` reset, `.claude/skills/rm-merge/SKILL.md` (after `pnpm db:migrate` on `cs_dev`, also run `pnpm kb:seed`; spec "Seed").
**Interfaces:** `seedKnowledge(service: Db, dir: string, userId = 'system:seed'): Promise<{ created: number; updated: number; removed: number; unchanged: number }>`. Front-matter (`---` YAML): `seed_key` (required, `[a-z0-9-]+`), `title` (required), `kind` (default `help`).
**Behaviour:**
- Upsert by `seed_key` via `saveArticle` (level platform, published, `source:'seed'`); unchanged body + title ⇒ no write.
- Seed rows whose key has no file ⇒ deleted.
- A malformed file ⇒ throw naming the file (nothing written: validate all files before any write).
- The three articles are drafted by the implementer in plain language using only `{{product}}`/`{{assistant}}` (lint must return `[]`). They describe only behaviour that exists: `/agency/ai` tokens and connector, asking on a client page with evidence chips and saving recommendations, and brief sections. ≤ 400 words each. **The owner reviews the copy at verification.**

**Tests:** fresh seed creates 3; re-run ⇒ all unchanged; edited file ⇒ updated + rechunked; removed file ⇒ removed; bad front-matter ⇒ throws, nothing written; each shipped `docs/help` file lints clean.
**Done when:** `pnpm --filter @cs/tools exec vitest run kb/seed` green; `pnpm kb:seed` runs against the test DB.

### Task 8: Friday uses the knowledge base
**Files:** modify `packages/ask/src/citations.ts`, `turn.ts`, `prompt.ts` and their tests.
**Interfaces:** `CITATION_PREFIXES = ['ev', 'kb'] as const`. `collectEvidence` also maps any node with `kbId` + `chunks` to `kb:<kbId>` → `chunks.join('\n')` (same `EVIDENCE_TEXT_CHARS` cap); `kb:` keys are always "bodied" (never take `addEvidenceAccessText`).
**Behaviour:**
- When the model calls `search_knowledge`, the turn **overrides** `clientId` with the thread's client before invoking (follow how other client-scoped tools are pinned in `turn.ts`; add it if there is no generic pin).
- Tool results reach the model inside the existing `<data tool=…>` wrapper (**RF5**).
- The `MARKER` regex used for the evidence-access fallback stays `ev:`-only.
- Prompt (S11, decided): replace rule 1 and add rules 9–10:
```
'1. Cite every fact: put [ev:<id>] (monitored evidence) or [kb:<id>] (knowledge article) right after each sentence that states a fact, using only ids that your tools returned during this answer. Never cite an id from earlier messages or an id you made up.',
...
'9. For how-to questions about the product, for advice, and for facts about the business itself, call search_knowledge and cite [kb:<id>]. Knowledge articles never replace evidence about competitors.',
"10. If the business's own knowledge disagrees with the agency's, follow the business's. If search_knowledge finds nothing relevant, say so instead of guessing.",
```
**Tests:**
- Scripted AI: calls `search_knowledge`, answers with `[kb:<id>]` ⇒ grounded, the stored refs include `kb:<id>`.
- A cite to a kb id that wasn't returned this turn ⇒ removed.
- Model-supplied `clientId` of another client ⇒ overridden (the tool sees the thread's).
- Prompt snapshot contains rules 1, 9 and 10.
- `parseCitations` accepts `kb:`.

**Done when:** `pnpm --filter @cs/ask exec vitest run` green.

### Task 9: MCP `search`/`fetch` knowledge type
**Files:** modify `packages/tools/src/tools/search.ts`, `fetch.ts`, `search/fetch-item.ts` and tests.
**Behaviour:**
- `SEARCH_TYPES` gains `'knowledge'`. Knowledge hits come from the same query as Task 4 (export a shared `searchKnowledgeHits(deps, ctx, clientId|null, query, kinds?)` from `tools/knowledge.ts`) and are merged by `rrfMerge` with the other types.
- Result `id` = `knowledge:<uuid>`, `url` = `appLinkFor({t:'kb', id})`, snippet = first chunk, rendered + redacted.
- `fetch knowledge:<uuid>` ⇒ text = rendered + redacted `bodyMd`, metadata `{ type:'knowledge', client_id: <clientId or ''>, evidence_ids: [] }`.
- Unknown ⇒ `not_found`.
- Update the `fetch` description's type list.

**Tests:**
- `search` returns a knowledge hit; `fetch` returns the rendered body.
- White-label agency: `fetch` text has the agency product name (**RF3**).
- Cross-agency id ⇒ `not_found`.
- `tools/list` for a client role still passes the existing exact-list test (update the snapshot only if the type list is part of it).

**Done when:** `pnpm --filter @cs/tools exec vitest run search fetch` and `pnpm --filter @cs/mcp exec vitest run` green.

### Task 10: Article sheet, chips and `/kb/[id]`
**Files:** create `apps/web/src/components/kb/article-sheet.tsx` (+ test), `apps/web/src/app/(app)/kb/[id]/page.tsx`; modify `components/ask/answer.tsx` (+ test), `app/(app)/platform/ask/[threadId]/page.tsx`.
**Behaviour:**
- `answer.tsx`: `kb:` markers in the allowed set render as chips (book icon, label = title from the message's stored metadata if available, else "Article"). Clicking opens `ArticleSheet` (shadcn `Sheet`). `ev:` behaviour is unchanged. The "evidence ids an answer cites" helper stays `ev:`-only.
- `ArticleSheet` loads via a server action that calls `get_kb_article` through the registry. It shows title, kind label, level label (decided copy), rendered Markdown (the repo's existing Markdown renderer if there is one; otherwise `react-markdown` with no raw HTML — check `apps/web/package.json` first and prefer what exists), the source link (`rel="noopener noreferrer"`, new tab) for URL articles, and "Updated {date}".
- `not_found` ⇒ "This article is no longer available." (**RF4**).
- `/kb/[id]`: the same content as a page; refusal ⇒ `notFound()`.
- Platform thread view: `kb:` chips link to `/platform/knowledge/<id>` (S10).

**Tests:**
- `kb` marker ⇒ chip; unknown prefix stays text.
- The sheet shows the missing copy on `not_found`.
- Sheet renders a level label per level.
- The page 404s on refusal.

**Done when:** `pnpm --filter @cs/web exec vitest run answer article-sheet` green; typecheck green.

### Task 11: `/platform/knowledge` operator UI
**Files:** create `apps/web/src/app/(app)/platform/knowledge/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `editor.tsx`, `actions.ts` (+ tests); modify the platform nav (wherever `/platform/ask` is linked).
**Behaviour:**
- **List:** a filters bar (level, agency, client, kind, status, search), rows with title, level/target, kind, status, and source badge ("Manual" / "URL" / "Managed in repo"). For URL rows, the sync badge ("Synced {date} · changed" when `previous_body_md` changed at the last sync, `sync_error` in red, "Auto-sync off" after failures). Empty state "No articles yet.".
- **Editor:** title, kind select, level select, agency/client pickers (only when needed), `client_visible` checkbox ("Visible to client users", agency level only), and a Markdown textarea with a Preview tab. Buttons "Save draft" / "Publish" / "Unpublish" / "Delete" (with a confirm dialog). Lint warnings show inline after save. For URL articles: source link, auto-sync toggle, collapsible "Previous version". Seed rows are read-only with the "Managed in repo" note.
- **Import panel** (hidden when the flag is off): URL, level/target, kind, auto-sync checkbox, "Import". It polls `get_kb_import_status` every 2 s until done, then routes to the draft. Error copy per `ImportError` (decided):
  - `robots_disallowed` "The site's robots.txt doesn't allow us to read this page."
  - `blocked` "The site blocked our request."
  - `http_error` "The page returned an error."
  - `no_content` "We couldn't find readable text on this page."
  - `off_site` "The page redirected to another site."
  - `fetch_failed` "We couldn't load the page. Try again later."
- All writes go through server actions → `runTool`. Non-operator ⇒ `notFound()`. Follow pattern: `platform/reviews/` (page + actions + client component).

**Tests:** non-operator ⇒ 404; publish action calls `upsert_kb_article` with `status:'published'`; the import panel is hidden when the flag is off; error copy is mapped; seed row has no editable fields.
**Done when:** `pnpm --filter @cs/web exec vitest run platform/knowledge` green; typecheck green.

### Task 12: E2E `@kb`
**Files:** create `apps/web/e2e/kb.spec.ts`; extend the E2E seed if a platform operator fixture is missing (follow `@ask` specs, `ASK_FAKE_AI`).
**Scenarios:**
1. An operator creates and publishes a client-level `fact` article → it appears in the list as Published.
2. A client user asks a question with the fake AI scripted to call `search_knowledge` and cite `[kb:<id>]`, sees the chip, opens the sheet, and sees the title + "Your business".
3. The operator unpublishes it → reopening the chip shows "This article is no longer available.".
4. A non-operator at `/platform/knowledge` gets the 404 page.

If the fake AI can't script by article id, add a `kb` fixture branch to `createScriptedAskAi` (keep it E2E-only under `ASK_FAKE_AI`).
**Done when:** `pnpm --filter @cs/web e2e:affected` green incl. `@kb`.

---

## Owner verification (add to the work file at wrap-up)
1. `pnpm db:migrate` on `cs_dev` (0045–0046 with 6a/6b's), then `pnpm kb:seed`; review the three help articles' copy.
2. `/platform/knowledge`: write an agency playbook with "Visible to client users" off, and a client fact. Ask as an agency user (both cited) and as a client user (only the fact).
3. With `KB_IMPORT_ENABLED=true` (owner adds it to `.env`): import a public Q&A page, review the draft, publish, and turn on auto-sync.
4. MCP: ask Claude "How do I connect an AI app?" and check that the answer uses the agency's product name.
