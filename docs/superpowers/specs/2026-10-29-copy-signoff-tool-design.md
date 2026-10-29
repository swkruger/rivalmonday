# Copy sign-off tool — design

**Branch:** `copy-signoff-tool` · **Brief:** `docs/work/copy-signoff-tool.md` · **Status:** draft for owner approval

## 1. Intent

The owner signs every user-facing word (help spec 15b B3, phase-17 spec §6.7) but today does it through 17 Markdown
docs whose tables are hand-copied from code and drift. This tool reads the copy **from the code itself**, shows it
grouped by surface, and records sign-off in a repo file so that any later edit shows up as **changed**.

- **Goals:** one command opens a local page listing all copy (app UI, help, guides, glossary, labels, emails as rendered
  previews, brief/report PDF text, marketing site, MCP tool descriptions); sign one item or a whole group; leave a
  comment or suggested wording; a CLI that reports counts and exports the "needs edit" list for an agent to apply.
- **Non-goals:** editing source from the browser; screenshots; the Ask system prompt and other model-only prompts;
  translating; multi-user review.
- **Anti-goals:** shipping the tool in any deployed app; a DB table or migration; a deploy gate that blocks work now.

The owner said "just start" — every decision below is **Claude's call**, open to change at plan approval.

## 2. Decisions (Claude's calls)

| # | Decision |
|---|---|
| D1 | **Form:** new private workspace package `packages/copy-review` (`@cs/copy-review`), run with `tsx`. Root scripts `pnpm copy:review` (local server) and `pnpm copy:status` (CLI). No app depends on it; it never deploys. |
| D2 | **Server:** `node:http` on `127.0.0.1` (default port 4300, `--port`), refuses to start when `VERCEL` or `NODE_ENV=production` is set. One server-rendered HTML page + a small inline vanilla-JS script + JSON API. No framework, no build step. Brand tokens (Inter, #2A6BAC, #F6F9FC canvas, grey panels #EEF2F6). |
| D3 | **Ledger:** `docs/copy/signoff.json`, committed. Plain JSON, one entry per line, sorted, LF, written atomically (tmp + rename). No DB, no migration. |
| D4 | **Item identity = file + text hash.** A signature covers `(file, hash)`, where `hash` = first 16 hex of sha256 of the normalised text (whitespace collapsed, trimmed). Moving a string within its file keeps the signature; any wording change doesn't. Each item also has an **anchor** (`file#scope#n`) used only to detect "changed" (§4). |
| D5 | **Granularity:** per string, grouped *surface → file*. "Sign group" signs every unsigned/changed item shown in a file or surface. **Emails and documents are one item per preview** (subject + plain-text body), not per string. |
| D6 | **Extraction:** one TypeScript-compiler (`typescript` API) AST scanner for all `.ts`/`.tsx` sources — no importing app modules, so `server-only` help copy needs no shim. Markdown files are read whole. Emails are **rendered** through `@cs/email` `renderEmail` with new preview fixtures (§5). |
| D7 | **Noise:** heuristic filter (§3.3) plus an **ignore** action in the ledger (`not copy`), keyed like a signature. Ignored items are hidden by default. |
| D8 | **Legacy docs:** every item starts **unsigned**. No import of the 17 Markdown docs (their text has drifted; matching is unreliable). Group signing makes the first pass quick. The old docs stay archived; once a surface is signed in the tool, its BACKLOG sign-off item is closed at merge. |
| D9 | **Gate:** `pnpm copy:status` prints counts per surface; `--strict <surface,…>` exits 1 if any listed surface has unsigned or changed items. CI gets a **report-only** step (never fails). A blocking deploy gate is a later owner decision (BACKLOG). |
| D10 | **Comments:** per item, a comment and/or suggested wording, stored in the ledger. `pnpm copy:status --todo` prints them as Markdown (file:line, current text, suggestion) for an agent to apply; applying an edit changes the hash, so the item comes back as "changed" for re-signing. |
| D11 | **Model-facing text:** MCP tool `description` fields are in (agencies read them); prompts are out. |
| D12 | **One branch**, no sub-phases. |

## 3. Sources and extraction

### 3.1 Source table (`src/sources.ts`, binding shape)

```ts
export type Surface =
  | 'app-client' | 'app-agency' | 'app-platform' | 'app-account' | 'app-shared'
  | 'help' | 'guides' | 'glossary' | 'labels' | 'emails' | 'documents' | 'site' | 'site-legal' | 'mcp-tools';

export type ScanMode =
  | 'module'     // string literals that are property values / array elements (copy modules, labels, site content)
  | 'jsx'        // JsxText + allow-listed literal JSX attributes + string literals rendered as JSX children
  | 'property'   // only the values of the named properties (e.g. `description` in tool definitions)
  | 'markdown';  // whole file = one item (front-matter stripped; title from front-matter `title` or first `#`)

export interface SourceRule {
  surface: Surface;
  mode: ScanMode;
  include: string[];      // globs, repo-relative
  exclude?: string[];     // always also excludes **/*.test.*, **/e2e*/**, **/*.d.ts
  properties?: string[];  // mode 'property'
}
```

Initial rules (implementer refines globs against the tree; every path in the brief's inventory must be covered):
`apps/web/src/help/copy/*.ts` → help/module; `docs/help/pages/**/*.md` + `docs/help/*.md` → guides/markdown;
`packages/core/src/help/glossary.ts` → glossary/module; `apps/web/src/lib/labels.ts` + the other `labels.ts` files →
labels/module; `apps/web/src/**/*copy*.ts` → by route context/module; `apps/web/src/**/*.tsx` → jsx, surface from the
route group (`/c/[clientId]` → app-client, `/agency` → app-agency, `/platform` → app-platform, account/public/auth →
app-account, components/ → app-shared); `packages/ui/src/**/*.tsx` → app-shared/jsx; `apps/site/content/*.ts`,
`apps/site/src/**/copy.ts` → site/module; `apps/site/src/**/*.tsx` → site/jsx; `apps/site/content/legal/*.md` →
site-legal/markdown; `packages/tools/src/**/*.ts` → mcp-tools/property `['description']`. Email templates
(`packages/email/src/templates/**`) and onboarding mock emails are **excluded** from the scan: emails are signed as
rendered previews.

### 3.2 Item shape

```ts
export interface CopyItem {
  surface: Surface;
  file: string;          // repo-relative, forward slashes
  line: number;          // 1-based, for the editor link
  anchor: string;        // `${file}#${scope}#${n}` — scope = property path (module) or enclosing function/component name (jsx)
  context: string;       // human hint: property path (`client.home.tips.score.body`) or `<Button label>` / JSX parent tag
  text: string;          // as shown; template-literal substitutions rendered as `{name}`
  hash: string;          // §2 D4
  kind: 'string' | 'email' | 'document' | 'markdown';
  html?: string;         // emails/documents: rendered HTML for the preview iframe
}
```

### 3.3 Filters (module/jsx/property)

Keep a literal only if it contains a letter and (a space, or starts with an uppercase letter, or ends in `.?!:`).
Always drop: import/export specifiers, type positions, object **keys**, `className`/`class`/`style`/`href`/`src`/`id`/
`key`/`name`/`type`/`variant`/`tone`/`size`/`icon`/`data-*` values, strings inside `console.*`, `throw new Error(...)`,
`logger.*`, SQL tagged templates, `z.` schema chains, and strings that are only a URL, path, CSS, env-var name or
`snake_case`/`kebab-case` identifier. JSX attributes kept: `title`, `label`, `placeholder`, `aria-label`, `alt`,
`description`, `message`, `helper`, `hint`, `emptyText`, `actionLabel`, `confirmLabel`, `cancelLabel` (list lives in
one constant). Adjacent JSX text pieces split only by `{expr}` join into one item with `{…}` in place of the expression.

## 4. Status

For each item, in order:
1. `ignored` — the ledger has an `ignore` entry for `(file, hash)`.
2. `signed` — the ledger has a `sign` entry for `(file, hash)`.
3. `changed` — some `sign` entry in the same file has `anchor === item.anchor` but a different hash (the old text is
   shown as a word diff).
4. `unsigned` — otherwise.

`needs-edit` is a flag, not a status: an open `comment` entry for `(file, hash)`. Signatures whose `(file, hash)` no
longer matches any item are **stale**: listed in `copy:status`, removed by `pnpm copy:status --prune` (never
automatically, so a temporarily broken scan can't wipe sign-offs).

## 5. Email and document previews

New `packages/email/src/previews.ts`, exported as `@cs/email/previews`:

```ts
export interface EmailPreview { id: string; label: string; payload: EmailPayload }        // id e.g. 'billing_notice.trial_ending'
export interface DocumentPreview { id: string; label: string; render: () => Promise<string> } // brief + trend report PDFs (HTML)
export const EMAIL_PREVIEWS: readonly EmailPreview[];
export const DOCUMENT_PREVIEWS: readonly DocumentPreview[];
```

- One preview per template **and per meaningful variant** (each `kind`/`notice`/discriminant that changes the wording,
  e.g. every `agency_notice.notice`, `billing_notice.kind`, `agency_hold.kind`, brief with/without quiet-week
  scorecard, feedback line on/off). Neutral demo branding (agency "Northwind Marketing", client "Bright Smile Dental");
  no real people, emails `@example.com`.
- Test `previews.test.ts`: every `EmailPayload['template']` value has ≥ 1 preview (type-level exhaustive list +
  runtime check); every preview renders without throwing; no preview text contains "Rival Monday" unless the template is
  platform/agency-facing (reuse the existing white-label rule from the template tests).
- Item text = `Subject: …` + blank line + `renderEmail(...).text`; `html` = rendered HTML shown in a sandboxed iframe.

## 6. Ledger (`docs/copy/signoff.json`)

```ts
export type LedgerEntry =
  | { type: 'sign';    file: string; hash: string; anchor: string; text: string; at: string; by: string }
  | { type: 'ignore';  file: string; hash: string; anchor: string; text: string; at: string; by: string }
  | { type: 'comment'; file: string; hash: string; anchor: string; text: string; at: string; by: string;
      comment: string; suggestion?: string; resolved?: boolean };
export interface Ledger { version: 1; entries: LedgerEntry[] }
```

- `at` = ISO date (`YYYY-MM-DD`); `by` = `git config user.name`. `text` is the snapshot that was signed (diffs, audit).
- Sorted by `file`, `anchor`, `type`, `hash`; serialised as `{"version":1,"entries":[` + one entry per line + `]}` + LF.
- Zod-validated on load; a malformed file stops the server with the parse error (never overwritten).
- Signing an item with an open comment resolves it. Unsign/unignore delete the entry.

## 7. Server and page

Routes (all `127.0.0.1` only; JSON bodies; writes validated with zod; the server re-scans on each `GET /`):

| Route | Does |
|---|---|
| `GET /` | the page: summary bar (counts by status), surface list, filters (status, surface, search), items grouped by file |
| `GET /api/items?surface=&status=&q=` | items + status as JSON |
| `POST /api/sign` `{ items: {file,hash}[] }` | sign (one or a group) |
| `POST /api/unsign`, `/api/ignore`, `/api/unignore` | same body |
| `POST /api/comment` `{ file, hash, comment, suggestion? }` | add a comment |
| `GET /preview/:id` | rendered email/document HTML (served with `Content-Security-Policy: default-src 'none'; img-src data: https:; style-src 'unsafe-inline'`, shown in a sandboxed iframe) |

Page behaviour: default filter = unsigned + changed; each item shows context, text (changed → word diff vs signed
text), status chip, a `vscode://file/<abs path>:<line>` link, and Sign / Ignore / Comment buttons; each file and
surface header has "Sign all shown (n)" with a confirm showing the count. Emails show the subject, an iframe preview
and the plain text. Keyboard: `j/k` move, `s` sign, `c` comment.

## 8. CLI (`pnpm copy:status`)

`copy:status` → table: surface × unsigned/changed/signed/ignored/needs-edit, plus stale count. Flags: `--strict
<surfaces>` (exit 1 if any unsigned/changed there), `--todo` (Markdown of open comments), `--prune` (drop stale
entries), `--json`. CI `ci` job gets one step `pnpm copy:status` (report-only: exits 0 unless the ledger is malformed; no `continue-on-error`, Ruling R9).

## 9. Testing

Unit tests in `packages/copy-review` (vitest, no DB): scanner fixtures per mode (keeps/drops per §3.3, anchors stable
under insertion of an unrelated string, template literals → `{name}`, JSX text joining); status rules §4 incl. changed
and stale; ledger round-trip + sort + malformed file refusal; server routes against a temp ledger (sign → status,
group sign, comment → todo, non-loopback `Host` refused); CLI `--strict` exit codes. A guard test: no `package.json`
under `apps/` depends on `@cs/copy-review`, and no app or site source imports it. `@cs/email` gets `previews.test.ts`.

## 10. Left to the builder

Exact glob tuning and noise thresholds (aim: < 10 % of scanned items need "ignore" on first pass), page styling
within the brand tokens, diff algorithm (word-level), port fallback when 4300 is taken.
