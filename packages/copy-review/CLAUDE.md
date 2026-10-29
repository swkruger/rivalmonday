# @cs/copy-review

- Local, never-deployed tool: scans user-facing copy from the code and records owner sign-off in `docs/copy/signoff.json`. Spec: `docs/superpowers/specs/2026-10-29-copy-signoff-tool-design.md`.
- Item identity = `(file, hash)`; `hash` = 16 hex of sha256 of the whitespace-normalised text (`text.ts`). The anchor is used only to detect "changed".
- The ledger is never overwritten when malformed (`LedgerError`); writes are tmp + rename. Stale entries are removed only by an explicit `--prune`.
- `sign` never deletes other entries; it adds the sign and resolves open comments on the same `(file, hash)`.

## Run
- `pnpm copy:review [--port N]` — local viewer on 127.0.0.1 (sign, ignore, comment, group sign). `pnpm copy:status [--strict a,b] [--todo] [--prune] [--json]` — counts per surface; `--strict` exits 1 on unsigned/changed in those surfaces; `--todo` lists open comments (agent work); CI runs it report-only.
- Never deployed, never imported by `apps/*` (`test/guard.test.ts` enforces). `@cs/email/previews` feeds email + document items.

## Ledger rules
- Signature = file + hash. Moving a string keeps its sign; editing it shows "changed" (diffed against the latest sign with the same anchor). `sign` never deletes other entries (R1).
- A malformed ledger stops the tool and is never overwritten. `--prune` removes stale entries (sign/ignore/unresolved comments matching no item, R5): run it only AFTER re-signing changed items, because pruning drops the old text "changed" diffs against.
- Group sign = visible unsigned/changed rows in open groups only (R7). Viewer sends framing-denial headers (R6).

## Scan rulings
- Module mode keeps initializers and returned literals (R2). Web `error`/`message` values and `ToolError` messages are scanned (R3).
- Add a source: `src/sources.ts` (first matching rule wins); check noise on a sample scan (`test/noise.test.ts` style) before committing.
- New email template or wording-changing variant: add a preview in `@cs/email` `src/previews.ts`.

## Comments become agent work
`copy:status --todo` → apply the edits in source → those items return as "changed" → owner re-signs (comments on the old hash resolve on sign).
