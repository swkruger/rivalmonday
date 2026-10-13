# Phase 6c — Knowledge base for Friday

**Date:** 2026-10-12 · **Branch:** `phase-6` (after 6b, same branch) · **Core spec:** §3, §8.2–8.4, §11. 6b spec `2026-10-12-phase-6b-ask-design.md` (e11 is the input; e5/e6 grounding rules apply unchanged). 6a spec d4/d12 (MCP read scope, redaction). This file records only new decisions and interfaces.

## Decisions (owner-approved 2026-10-12 — do not re-open)
| # | Decision |
|---|---|
| k1 | **One store, three levels.** `platform` / `agency` / `client`, each article with a `kind`: `help`, `playbook`, `qa`, `blog`, `fact`. Covers product help, agency expertise and client facts. |
| k2 | **Visibility = own level and every level above.** Platform articles → every signed-in tenant user. Agency articles → that agency's users, and its client users only when `client_visible` (default **true**). Client articles → users who can see that client (`app_client_visible`). Only `published` articles are visible outside `/platform/knowledge`. |
| k3 | **Authoring = platform operators only, at every level** (`PLATFORM_ADMIN_EMAILS`), in `/platform/knowledge`; everyone else gets 404. Agency/client users never write. Per-agency authoring → backlog. |
| k4 | **Ingestion in 6c:** in-app Markdown editor, URL import, repo seed. File upload (PDF/DOCX/…) → backlog. |
| k5 | **URL import** behind new env flag **`KB_IMPORT_ENABLED`** (owner-approved var; turbo `globalPassThroughEnv`), independent of `WEB_MONITORING_ENABLED`. Same crawler conduct (`polite.ts`: RFC 9309, 5xx ⇒ disallow, ≥ 3 s/host, `RivalMondayBot` UA, never evade). First import always lands as a **draft** for operator review. |
| k6 | **Auto-sync** is a per-article toggle (URL articles only), useful for community Q&A. Weekly re-fetch; changed text is **applied automatically** (previous body kept in `previous_body_md`, "Synced <date> · changed" badge), not queued for review. 3 consecutive failures ⇒ auto-sync off. |
| k7 | **White-label via placeholders:** operators write `{{product}}` and `{{assistant}}`; substituted at read time per viewer (`productNameFor`, agency `assistantName`) before text reaches the model, MCP or the viewer. Save-time lint warns on literal "Rival Monday"/"Friday" in platform-level text (warning, not a block). |
| k8 | **Retrieval = a tool**, `search_knowledge`, the model calls when needed (no per-turn auto-injection, no whole-KB prompt). Hybrid FTS + vector, reciprocal-rank fusion. |
| k9 | **Citations `[kb:<articleId>]`** grounded exactly like `[ev:…]` (`groundAnswer`/`supportCheck` against the retrieved chunk text). Knowledge never substitutes for competitor evidence; on conflict client facts beat agency text. |
| k10 | **Surfaces:** through Friday (chip → read-only article sheet) and MCP (`search` type `knowledge`, `fetch knowledge:<id>`, existing read scope). No browsable Help page in 6c (→ backlog). |
| k11 | **Repo seed:** `docs/help/*.md` → platform level, kind `help`, upsert by `seed_key`, published; read-only in the UI ("Managed in repo"). |

## Interfaces

### Migrations (`0045_kb`, `0046_kb_rls`)
```sql
CREATE TABLE kb_article (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level            text NOT NULL CHECK (level IN ('platform','agency','client')),
  agency_id        uuid REFERENCES agency(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES client(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('help','playbook','qa','blog','fact')),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body_md          text NOT NULL CHECK (octet_length(body_md) <= 204800),
  previous_body_md text,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  client_visible   boolean NOT NULL DEFAULT true,
  source           text NOT NULL CHECK (source IN ('manual','url','seed')),
  source_url       text,
  seed_key         text UNIQUE,
  auto_sync        boolean NOT NULL DEFAULT false,
  last_synced_at   timestamptz,
  sync_error       text,
  sync_failures    int NOT NULL DEFAULT 0,
  created_by       text NOT NULL,          -- auth user id
  updated_by       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((level = 'platform' AND agency_id IS NULL AND client_id IS NULL)
      OR (level = 'agency'   AND agency_id IS NOT NULL AND client_id IS NULL)
      OR (level = 'client'   AND agency_id IS NOT NULL AND client_id IS NOT NULL)),
  CHECK ((source = 'url') = (source_url IS NOT NULL)),
  CHECK (source = 'seed' OR seed_key IS NULL),
  CHECK (NOT auto_sync OR source = 'url')
);
CREATE INDEX kb_article_scope_idx ON kb_article (level, agency_id, client_id, status);

CREATE TABLE kb_chunk (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_article(id) ON DELETE CASCADE,
  level      text NOT NULL,
  agency_id  uuid,
  client_id  uuid,
  ord        int NOT NULL,
  text       text NOT NULL,
  embedding  vector(512),
  UNIQUE (article_id, ord)
);
-- SQL-only, as 0039: search_tsv generated column + GIN.
ALTER TABLE kb_chunk ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;
CREATE INDEX kb_chunk_tsv_idx ON kb_chunk USING gin (search_tsv);
```
`client_id`/`agency_id` FK consistency: a client-level row's `agency_id` must equal the client's agency. Enforce with composite FK `(client_id, agency_id) → client(id, agency_id)`, mirroring existing tenant tables. Chunks only exist for **published** articles (rebuilt on publish/sync, deleted on unpublish). So RLS on `kb_chunk` doesn't need a status join, and the denormalised scope columns are copied from the article in the same transaction.

**RLS (`0046_kb_rls`)**, ENABLE + FORCE on both tables. App roles get `SELECT` only; no INSERT/UPDATE/DELETE grants (writes run as the service connection inside platform tools, like other `/platform` tools). Read policy (same text for `kb_chunk`, minus `status`):
```sql
CREATE POLICY kb_article_read ON kb_article FOR SELECT USING (
  status = 'published' AND (
    level = 'platform'
    OR (level = 'agency' AND agency_id = current_setting('app.agency_id', true)::uuid
        AND (client_visible OR current_setting('app.role', true) NOT IN ('client_owner','client_viewer')))
    OR (level = 'client' AND agency_id = current_setting('app.agency_id', true)::uuid AND app_client_visible(client_id))
  ));
```
Role strings and `app_client_visible(cid uuid)` (`0001_rls`, client-scope only, hence the explicit agency match) verified. `kb_chunk` also gets a copied `client_visible boolean NOT NULL` column (set with the scope columns), so its policy needs no join.

### Tools (`@cs/tools`)
| Tool | Channels | Who | Signature |
|---|---|---|---|
| `search_knowledge` | `web`,`ask`,`mcp` | any tenant user | `{ query: string(1..300), clientId?: uuid, kinds?: Kind[], limit?: int(1..8)=5 }` → `{ results: { kbId, title, kind, level, updatedAt, chunks: string[] }[] }` |
| `get_kb_article` | `web` | any tenant user | `{ kbId: uuid }` → `{ kbId, title, kind, level, bodyMd, sourceUrl: string \| null, updatedAt }` |
| `list_kb_articles` | `web` | platform | `{ level?, agencyId?, clientId?, kind?, status?, q?, cursor?, limit? }` |
| `upsert_kb_article` | `web` | platform | `{ id?, level, agencyId?, clientId?, kind, title, bodyMd, clientVisible?, status }` → `{ id, lintWarnings: string[] }`; refuses `source='seed'` rows |
| `delete_kb_article` | `web` | platform | `{ id }` |
| `import_kb_url` | `web` | platform | `{ url, level, agencyId?, clientId?, kind, autoSync }` → `{ jobId }`; `not_found`-style refusal when `KB_IMPORT_ENABLED` is off |
| `set_kb_auto_sync` | `web` | platform | `{ id, autoSync }` |

Rules:
- Hidden, unknown or unpublished `kbId`, and a non-visible `clientId`, all return **`not_found`** (registry rule).
- Platform tools are audited (`audit_log`, channel `web`).
- `search_knowledge` scope: platform + caller's agency + (`clientId` given and visible) that client. In Ask, the turn pins `clientId` to the thread's client and overrides model input.
- Output text is placeholder-substituted, then passed through **`redactForModel`** for the `ask`/`mcp` channels.
- At most 2 chunks per article, ≤ 1,500 chars each.
- Ranking: FTS (`websearch_to_tsquery`) top 20 ∪ vector (cosine, when `embedQuery` exists) top 20 → RRF (k = 60). With no embedding available, FTS only.

### `@cs/ask`
- `CITATION_PREFIXES = ['ev','kb']`.
- `collectEvidence` maps `kbId` → key `kb:<id>`, text = joined chunks (same per-key cap).
- `kb:` keys never take the evidence-access fallback path.
- Prompt adds:
  - When to call `search_knowledge` (how-to, advice, own-business questions).
  - Cite `[kb:<id>]`.
  - Knowledge never stands in for competitor evidence.
  - Client facts beat agency text.
  - When nothing is found, say so.
- `search_knowledge` is in the Ask read-tool set; no quota change (the turn already counts).

### `@cs/core`
`renderKbText(text, { productName, assistantName })` substitutes `{{product}}` and `{{assistant}}`; unknown `{{…}}` stays literal. `lintKbText(level, text): string[]`.

### Chunking (`@cs/tools` or `@cs/core`, plan decides)
`chunkMarkdown(md): string[]` splits on headings, then paragraphs. Target ≤ 1,500 chars, overlap none. Each chunk is prefixed with its nearest heading path (`## A › ### B`). Max 200 chunks; excess is dropped with a lint warning on save/import.

### Worker jobs
| Job | Trigger | Behaviour |
|---|---|---|
| `kb-embed` | after publish/sync re-chunk | Embed chunks with null `embedding` for one article (`embeddings` task, 512 d). pg-boss retry/backoff; failures leave FTS-only. |
| `kb-import` | `import_kb_url` | `polite.ts` fetch (plain first, Playwright renderer only if the extract is empty), main-content extract → Markdown. Create a **draft** (`source='url'`). Failure ⇒ no row; the job result carries the reason (robots-blocked, HTTP status, no main content, flag off) for the UI. |
| `kb-sync` | weekly cron (worker schedule) | For each published `auto_sync` article: re-fetch + extract. Changed (normalised text differs) ⇒ `previous_body_md` = old, apply, re-chunk, enqueue `kb-embed`. Unchanged ⇒ `last_synced_at` only. Failure ⇒ keep text, `sync_error`, `sync_failures += 1`; on 3 set `auto_sync = false`. Success resets `sync_failures`. |

All three refuse when `KB_IMPORT_ENABLED` is not `'true'`, except `kb-embed`. The extractor library is chosen in the plan (readability-style; must run in the worker, no network beyond `polite.ts`).

### Seed
`docs/help/*.md` with front-matter `seed_key`, `title`, `kind` (default `help`). `pnpm kb:seed` upserts by `seed_key` (level platform, `source='seed'`, published), re-chunks changed rows and enqueues `kb-embed`. It also removes seed rows whose file is gone. Run by `demo:reset` and in the `/rm-merge` migrate step. 6c ships ≥ 3 starter help articles (connecting an AI app, asking Friday, reading a brief), written with placeholders.

### Web (`apps/web`)
- **`/platform/knowledge`**: list (filters level/agency/client/kind/status, search, source + sync badges). **`/platform/knowledge/new`** and **`/[id]`**: editor (title, kind, level, target picker, `client_visible` for agency level, Markdown body + preview, Draft/Publish, lint warnings inline, previous-version view for synced articles, auto-sync toggle, "Import from URL" panel hidden when the flag is off). Seed rows are read-only with "Managed in repo". Non-operators get 404.
- **Article sheet**: `kb:` chips in Ask answers (client and platform thread views) open a read-only sheet. It shows title, kind label, level label ("Help", "From your agency", "Your business"), rendered Markdown (sanitised, no raw HTML), source link for URL articles, and "Updated <date>". Missing or hidden articles show **"This article is no longer available."**
- **`/kb/[id]`**: page form of the same viewer (MCP `url` target); refusals return 404.

### MCP (`@cs/mcp` / `@cs/tools`)
`search` gains type `knowledge` (`id` `knowledge:<uuid>`, `url` `/kb/<uuid>`). `fetch` resolves `knowledge:<uuid>` via `get_kb_article` rules, returning substituted, redacted text. Read scope; no new scope.

## Errors & limits
- Body ≤ 200 KB, ≤ 200 chunks; imports over the limit are truncated with a lint warning on the draft.
- Embed failures are silent (FTS fallback).
- A deleted article's old citations stay in stored answers; the chip shows "no longer available".
- `search_knowledge` tool calls don't count toward the quota separately.

## Not in 6c (→ backlog)
File upload; browsable Help page (`/agency/help`, `/c/<id>/help`); ANN vector index (shared item); multi-version history; agency/client self-authoring and a `manage_knowledge` flag; KB in weekly briefs; per-article analytics (citation counts).

## Testing
- **RLS:**
  - client user of A can't read B's or another agency's rows;
  - a client role can't read `client_visible = false` agency rows, while agency staff can;
  - drafts are invisible to app roles;
  - app roles can't INSERT/UPDATE/DELETE;
  - the CHECK and composite FK reject cross-agency client rows.
- **Unit:** `chunkMarkdown`; RRF fusion incl. FTS-only; `renderKbText` per white label + unknown placeholder; `lintKbText`; seed idempotency + removal.
- **Jobs:** `kb-import`/`kb-sync` with a fake fetcher: robots disallow, 5xx, changed vs unchanged, 3 failures ⇒ auto-sync off, flag off refuses.
- **Tools:** `not_found` for hidden/unpublished/foreign ids; Ask pins `clientId`; redaction on `ask`/`mcp`.
- **Ask (scripted AI):** turn calls `search_knowledge`, cites `[kb:…]` → grounded and chip stored; a cite to a non-retrieved id is dropped.
- **MCP:** `search` type `knowledge`, `fetch knowledge:<id>`, cross-agency ⇒ `not_found`.
- **E2E `@kb`:** an operator creates and publishes an article; a client user asks and sees a `kb` chip that opens the sheet; a non-operator at `/platform/knowledge` gets 404.
