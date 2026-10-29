# Copy sign-off tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, never-deployed tool (`pnpm copy:review`, `pnpm copy:status`) that reads every user-facing string from the code, shows it grouped by surface, and records owner sign-off in `docs/copy/signoff.json` so edits come back as "changed".

**Architecture:** New private package `packages/copy-review`: a TypeScript-compiler AST scanner + Markdown reader + rendered email previews produce `CopyItem[]`; a ledger module computes status; a `node:http` server renders one page + JSON API on 127.0.0.1; a CLI reports counts. `@cs/email` gains preview fixtures.

**Tech Stack:** TypeScript, `typescript` compiler API, `tsx`, `node:http`, zod, vitest, `@cs/email` (React Email).

**Spec:** `docs/superpowers/specs/2026-10-29-copy-signoff-tool-design.md` (binding; § refs below point there).

## Global Constraints
- Never deployed, never imported by `apps/*` (incl. `apps/site`); server binds `127.0.0.1` only and refuses to start when `VERCEL` or `NODE_ENV=production` is set.
- No DB, no migration. Ledger = `docs/copy/signoff.json`, LF, one entry per line, atomic write, never overwritten when malformed.
- Hash = first 16 hex of sha256 of normalised text (whitespace runs → one space, trimmed).
- Email preview data: neutral demo names ("Northwind Marketing", "Bright Smile Dental"), `@example.com` only, no real people.
- Repo is LF-only; commits end with the `Co-Authored-By` line from root `CLAUDE.md`. Read `docs/gotchas-cross-cutting.md` and `packages/email/CLAUDE.md` (if present) before coding.
- Package follows repo conventions: `"type": "module"`, `typecheck` + `test` scripts, vitest, `@types/node`.

## Decisions
Spec §2 D1–D12 (Claude's calls; owner approves with this plan). No phase-local additions.

## File structure
```
packages/copy-review/
  package.json, tsconfig.json, CLAUDE.md
  src/types.ts          Surface, ScanMode, SourceRule, CopyItem, LedgerEntry, Ledger, ItemStatus, StatusedItem
  src/text.ts           normalise(), hashText()
  src/ledger.ts         loadLedger(), saveLedger(), serialiseLedger(), applyAction()
  src/scan/filters.ts   isCopyLike(), DROP_ATTRS, KEEP_JSX_ATTRS
  src/scan/ts-scan.ts   scanTsFile(file, source, mode, opts) → CopyItem[] (module | property | jsx)
  src/scan/markdown.ts  scanMarkdownFile(file, source) → CopyItem
  src/sources.ts        SOURCES: SourceRule[], surfaceFor(file)
  src/collect.ts        collectItems(root) → CopyItem[] (scan + email/document previews)
  src/status.ts         statusOf(), withStatus(), staleEntries()
  src/diff.ts           wordDiff(a, b)
  src/server/app.ts     createServer({ root, ledgerPath }) → http.Server
  src/server/page.ts    renderPage(view) → string (HTML + inline CSS/JS)
  src/cli/review.ts     `copy:review` entry
  src/cli/status.ts     `copy:status` entry
  test/fixtures/*       small .ts/.tsx/.md fixtures
packages/email/src/previews.ts (+ previews.test.ts); packages/email/package.json export "./previews"
docs/copy/signoff.json  ({"version":1,"entries":[]})
package.json (root scripts), .github/workflows/ci.yml (report-only step)
```

## Dependencies on in-flight work
None (`git branch --no-merged main` empty at plan time). Re-check in Task 0.

## Review Focus
1. Scanner noise on the real tree — identifiers, class names, URLs, log/error strings leaking in as "copy" (target: < 10 % need Ignore). Task 4 prints a sample; reviewer reads it.
2. A malformed or hand-edited `signoff.json` must stop the tool, never be rewritten empty (Task 1 test `refuses malformed ledger`).
3. Inserting one unrelated string into a file must not flip other signed items in it to "changed" (Task 2/3 anchor-stability tests; Task 6 status test).
4. Group sign must sign exactly the items shown under the current filter, nothing hidden (Task 8 test `group sign only signs posted items`).
5. Server reachable only on loopback; a request with a non-loopback `Host` header (DNS rebinding) is refused 403 (Task 8 test).

---

### Task 0: Pre-flight
- [ ] `git rebase main`; `git branch --no-merged main` — any new branch touching `packages/email/src/render.ts`/`types.ts`, `ci.yml` or root `package.json` → record in work file + adjust Task 5/7.
- [ ] Re-check: `EmailPayload` union in `packages/email/src/types.ts` (template ids), `renderEmail` / `renderBriefDocument` / `renderTrendReportDocument` signatures, `typescript` resolvable from a new package.

### Task 1: Package scaffold, text hashing, ledger
**Files:** create `packages/copy-review/{package.json,tsconfig.json,CLAUDE.md}`, `src/types.ts`, `src/text.ts`, `src/ledger.ts`, `test/text.test.ts`, `test/ledger.test.ts`, `docs/copy/signoff.json`. **Follow pattern:** `packages/verticals/package.json` (tsx + vitest package).

**Interfaces (produces):**
- `types.ts`: spec §3.1 `Surface`, `ScanMode`, `SourceRule`; §3.2 `CopyItem`; §6 `LedgerEntry`, `Ledger`; `type ItemStatus = 'unsigned' | 'signed' | 'changed' | 'ignored'`; `interface StatusedItem extends CopyItem { status: ItemStatus; needsEdit: boolean; signedText?: string; comments: Extract<LedgerEntry,{type:'comment'}>[] }`.
- `text.ts`: `normalise(text: string): string`; `hashText(text: string): string` (16 hex).
- `ledger.ts`: `loadLedger(path): Ledger` (missing file → empty; malformed → throws `LedgerError` with zod message); `serialiseLedger(l: Ledger): string` (sorted by file, anchor, type, hash; `{"version":1,"entries":[\n<entry>,\n…\n]}\n`); `saveLedger(path, l)` (write `path.tmp`, rename); `applyAction(l, action, items: CopyItem[], meta: {at: string; by: string}, extra?: {comment: string; suggestion?: string}): Ledger` with `action: 'sign'|'unsign'|'ignore'|'unignore'|'comment'`. Sign replaces any older `sign` for the same anchor and resolves open comments on `(file, hash)`; unsign/unignore delete matching entries.
- Package scripts: `typecheck`, `test`, `review: tsx src/cli/review.ts`, `status: tsx src/cli/status.ts`. Deps: `typescript`, `zod`, `@cs/email` (workspace); dev: `tsx`, `vitest`, `@types/node`.

**Tests (TDD):** `normalise collapses whitespace and trims`; `hashText is 16 hex and ignores whitespace-only differences`; `round-trips and sorts entries`; `serialised form has one entry per line and trailing LF`; `refuses malformed ledger` (bad JSON and wrong shape both throw `LedgerError`; file untouched); `sign resolves open comment for same file+hash`; `sign replaces older sign for same anchor`; `unsign removes only the matching entry`.

**Done when:** `pnpm --filter @cs/copy-review test` and `typecheck` pass; `docs/copy/signoff.json` = `{"version":1,"entries":[]}` + LF.

### Task 2: TS scanner — `module` and `property` modes
**Files:** create `src/scan/filters.ts`, `src/scan/ts-scan.ts`, `test/fixtures/{module.ts,tool.ts}`, `test/ts-scan.module.test.ts`.

**Interfaces (produces):** `scanTsFile(file: string, source: string, rule: Pick<SourceRule,'surface'|'mode'|'properties'>): CopyItem[]` (all modes; this task implements `module`/`property`); `isCopyLike(text: string): boolean`; `DROP_ATTRS: ReadonlySet<string>`; `KEEP_JSX_ATTRS: ReadonlySet<string>` — values per spec §3.3.

**Behaviour:**
- Parse with `ts.createSourceFile(file, source, Latest, true, file.endsWith('.tsx') ? TSX : TS)`; no type-checker, no imports resolved.
- `module`: string/no-substitution-template literals and template expressions that are a property-assignment value or array element, anywhere in the file; `context`/scope = dotted property path from the outermost variable (`PAGE_COPY` → `client.home.tips.score.body`; array index as `[n]`); template substitutions render as `{name}` (identifier or last property-access name, else `{…}`).
- `property`: only values of properties named in `rule.properties`.
- Apply spec §3.3 drops (keys, `DROP_ATTRS` property names, console/throw/logger/sql/z.* ancestors, URL/path/identifier-only strings) then `isCopyLike`.
- `anchor = ${file}#${scope}#${n}` where n = index among kept items with the same scope (scope = property path ⇒ usually 0).

**Tests (TDD):** fixture-based: `keeps nested copy values with dotted path context`; `drops object keys, className, href, tone, ids, urls, snake_case`; `drops strings inside throw new Error / console / logger`; `template literal substitution becomes {name}`; `property mode keeps only description values`; `anchor stable when an unrelated string is inserted earlier in the file`; `line is 1-based line of the literal`.

**Done when:** test file passes; typecheck clean.

### Task 3: TS scanner `jsx` mode + Markdown
**Files:** modify `src/scan/ts-scan.ts`; create `src/scan/markdown.ts`, `test/fixtures/{page.tsx,guide.md}`, `test/ts-scan.jsx.test.ts`, `test/markdown.test.ts`.

**Interfaces:** `scanMarkdownFile(file: string, source: string, surface: Surface): CopyItem` (`kind:'markdown'`, text = body without front-matter, `context` = front-matter `title` ?? first `# ` heading ?? file name, `anchor = ${file}#doc#0`, line 1).

**Behaviour (jsx):** `JsxText` (non-whitespace) and adjacent text/`{expr}` siblings joined into one item (`{name}` placeholders); string literals as JSX expression children; literal values of `KEEP_JSX_ATTRS` attributes (`context` = `<Tag attr>`); module-mode rules also apply to the same file's object literals (so `const COLS = [{label:'Name'}]` in a page is caught). Scope = nearest enclosing function/component/variable name; n = ordinal within scope.

**Tests (TDD):** `joins text around expressions into one item`; `keeps aria-label/placeholder/title literals, drops className/href`; `context names the parent tag`; `anchor ordinal is per component, so a new string in another component changes nothing`; `markdown strips front-matter and uses title`.

**Done when:** tests pass; typecheck clean.

### Task 4: Sources table and repo collection
**Files:** create `src/sources.ts`, `src/collect.ts` (scan part), `test/sources.test.ts`.

**Interfaces:** `SOURCES: readonly SourceRule[]` (spec §3.1 list); `surfaceFor(file: string): Surface | null` (first matching rule; jsx route-group mapping per spec §3.1); `collectScanned(root: string): CopyItem[]` (glob via `fs.globSync` (Node ≥ 22), always-excludes `**/*.test.*`, `**/e2e*/**`, `**/*.d.ts`, `packages/email/src/templates/**`, `apps/web/src/components/onboarding/previews/**`; first matching rule wins per file; output sorted by surface, file, line).

**Tests (TDD):** `surfaceFor maps route groups` (table: `apps/web/src/app/(app)/c/[clientId]/brief/page.tsx`→app-client, `…/agency/…`→app-agency, `…/platform/…`→app-platform, `apps/web/src/help/copy/client.ts`→help, `docs/help/pages/x.md`→guides, `apps/site/content/legal/privacy.md`→site-legal, `packages/tools/src/a/b.ts`→mcp-tools, `packages/email/src/templates/alert.tsx`→null); `every inventory path from the brief matches a rule` (list of the brief's paths); `collectScanned on the real repo returns > 1500 items and none from excluded paths` (uses repo root).

**Noise check (Review Focus 1):** script step — run `tsx -e` printing 60 random items per surface to `docs/work/copy-signoff-tool-noise.txt` (not committed); tune `filters.ts` until a manual read finds < 10 % non-copy; note counts per surface in the work file.

**Done when:** tests pass; counts recorded in work file.

### Task 5: Email and document previews in `@cs/email`
**Files:** create `packages/email/src/previews.ts`, `packages/email/src/previews.test.ts`; modify `packages/email/package.json` (`"./previews": "./src/previews.ts"`).

**Interfaces:** spec §5 `EmailPreview`, `DocumentPreview`, `EMAIL_PREVIEWS`, `DOCUMENT_PREVIEWS`. Preview ids `<template>` or `<template>.<variant>`. Build props from the template tests' existing fixtures (read `src/*.test.ts`), with spec §2/§5 neutral names.

**Behaviour:** one preview per `EmailPayload['template']` plus one per wording-changing discriminant (`agency_notice.notice` ×9, `billing_notice.kind`, `client_billing_notice`, `agency_client_billing_notice`, `agency_hold.kind`, `platform_ops_alert` kinds, brief normal/quiet-week, feedback line on/off on alert + brief). Documents: brief, trend report.

**Tests (TDD):** `every template id has a preview` — `const ALL = [...] as const satisfies readonly EmailPayload['template'][]` with a type-level exhaustiveness check (`Exclude<EmailPayload['template'], typeof ALL[number]>` must be `never`) + runtime set equality with preview templates; `ids are unique`; `every preview renders with non-empty subject and text`; `every document preview renders HTML`; `client-facing previews never contain "Rival Monday"` (reuse the client-facing template list the existing tests use).

**Done when:** `pnpm --filter @cs/email test` + typecheck pass.

### Task 6: Status engine, previews into items, word diff
**Files:** modify `src/collect.ts`; create `src/status.ts`, `src/diff.ts`, `test/status.test.ts`, `test/diff.test.ts`, `test/collect.previews.test.ts`.

**Interfaces:** `collectItems(root: string): Promise<CopyItem[]>` = `collectScanned` + email items (`surface:'emails'`, `file:'packages/email/previews/<id>'`, `anchor: email:<id>`, text `Subject: …\n\n<text>`, `html`) + document items (`surface:'documents'`, `anchor: document:<id>`); `withStatus(items: CopyItem[], l: Ledger): StatusedItem[]` (spec §4 order); `staleEntries(items, l): LedgerEntry[]`; `wordDiff(a: string, b: string): { op: 'eq'|'add'|'del'; text: string }[]`.

**Tests (TDD):** `ignored beats signed`; `signed when file+hash match even if anchor moved`; `changed when same anchor signed with another hash, signedText set`; `unsigned otherwise`; `needsEdit only for unresolved comments`; `stale lists sign entries matching no item`; `email items carry html and Subject line`; `wordDiff marks one replaced word`.

**Done when:** tests pass; typecheck clean.

### Task 7: CLI `copy:status` + root scripts + CI step
**Files:** create `src/cli/status.ts`, `test/cli-status.test.ts`; modify root `package.json` (`"copy:review": "pnpm --filter @cs/copy-review review"`, `"copy:status": "pnpm --filter @cs/copy-review status"`), `.github/workflows/ci.yml` (in the `ci` job after install: step `Copy sign-off status (report only)`, `run: pnpm copy:status`, `continue-on-error: true`).

**Interfaces:** `runStatus(argv: string[], deps: { root: string; ledgerPath: string; out: (s: string) => void }): Promise<number>` (exit code). Flags per spec §8: `--strict a,b`, `--todo`, `--prune`, `--json`. Unknown surface in `--strict` → exit 2 with message. `--prune` writes via `saveLedger`.

**Tests (TDD):** `table lists every surface with counts`; `--strict exits 1 when a listed surface has unsigned`; `--strict exits 0 when all signed/ignored`; `--todo prints file:line, text and suggestion as Markdown`; `--prune removes only stale entries`; `--json is parseable`. Use a temp ledger + an injected item list (export `runStatusWith(items, …)` for tests).

**Done when:** tests pass; `pnpm copy:status` runs on the repo and prints the table.

### Task 8: Local server + JSON API
**Files:** create `src/server/app.ts`, `src/cli/review.ts`, `test/server.test.ts`.

**Interfaces:** `createServer(opts: { root: string; ledgerPath: string; collect?: () => Promise<CopyItem[]>; now?: () => string; who?: () => string }): http.Server`; routes spec §7. `review.ts`: refuse when `process.env.VERCEL || process.env.NODE_ENV === 'production'`; listen `127.0.0.1:${--port ?? 4300}` (on `EADDRINUSE` try next 10 ports); print URL. `who` default = `git config user.name`.

**Behaviour:** Reject (403) any request whose `Host` isn't `127.0.0.1:<port>` or `localhost:<port>`; POST requires `Content-Type: application/json` and `Origin` absent or same-origin (403 otherwise). Bodies zod-validated (`items: {file,hash}[]` 1–5000). Every write: re-collect, map posted `(file,hash)` to current items (unknown → 409 with the list), `applyAction`, `saveLedger`, return new counts. Items cache per `GET /` re-scan; POST uses fresh scan.

**Tests (TDD):** `GET /api/items filters by surface and status`; `sign then item is signed and ledger file updated`; `group sign only signs posted items` (3 items, post 2); `unknown item → 409, ledger unchanged`; `comment then todo flag set`; `foreign Host → 403`; `cross-origin POST → 403`; `GET /preview/:id serves html with CSP header`; `malformed ledger → server refuses to start` (createServer throws).

**Done when:** tests pass; typecheck clean.

### Task 9: The page
**Files:** create `src/server/page.ts`, `test/page.test.ts`; modify `src/server/app.ts` (`GET /`).

**Interfaces:** `renderPage(view: { items: StatusedItem[]; counts: Record<Surface, Record<ItemStatus|'needsEdit', number>>; filter: { surface?: Surface; status: ItemStatus[]; q?: string }; root: string }): string`.

**Behaviour:** spec §7 page behaviour. Layout: one white sheet on #F6F9FC, max 1560 px; left = surface list with counts; main = summary bar + filter form (GET params) + items grouped by file (`<details open>` per file, header with "Sign all shown (n)"). Item row: status chip (unsigned grey, changed amber #F5A524 on #3B2300 text, signed green-ish existing success tone, ignored muted), context, text (changed → `<del>/<ins>` diff), `vscode://file/<abs>:<line>` link, buttons Sign / Ignore / Comment (inline form: comment + suggested wording). Emails: subject, `<iframe sandbox src="/preview/:id">` (collapsed by default), plain text. All text HTML-escaped (one `esc()`); inline JS uses `fetch` to the API then reloads the row/counts; keyboard `j/k/s/c`; group sign `confirm("Sign n items?")`. No external assets except Google Fonts Inter.

**Tests (TDD):** `escapes item text (<script> renders inert)`; `changed item shows del/ins`; `group header shows count of shown items`; `email item has sandboxed iframe`; `default filter shows unsigned+changed only`.

**Manual check:** `pnpm copy:review`, open the URL, sign one help tip, sign one file group, comment on one item, `git diff docs/copy/signoff.json` shows the entries; `pnpm copy:status --todo` lists the comment. Revert the ledger to empty before commit.

**Done when:** tests pass; manual check done and noted in work file.

### Task 10: Guard test, docs
**Files:** create `packages/copy-review/test/guard.test.ts`; write `packages/copy-review/CLAUDE.md` (how to run, ledger rules, adding a source rule, adding an email preview with every new template); modify `packages/email/CLAUDE.md` (or create: "new template ⇒ add to `previews.ts`"); update `docs/work/copy-signoff-tool.md` (Status, Interfaces, New backlog: "Blocking copy gate in `deploy`/`deploy-site` (`copy:status --strict emails,site,site-legal,app-client`) before first pilot invite — owner decision"; "Close the per-phase copy sign-off BACKLOG items once their surfaces are signed in the tool").

**Tests:** `no apps/* package.json depends on @cs/copy-review`; `no file under apps/ imports @cs/copy-review` (grep).

**Done when:** `pnpm --filter @cs/copy-review test`, `pnpm --filter @cs/email test`, both typechecks pass; `git ls-files --eol | grep crlf` prints nothing.

### Final review
`pnpm test:affected --base main` (no E2E impact expected: no `apps/web` code changes); whole-branch review on the most capable model; one fix wave.
