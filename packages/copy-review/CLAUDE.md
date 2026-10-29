# @cs/copy-review

- Local, never-deployed tool: scans user-facing copy from the code and records owner sign-off in `docs/copy/signoff.json`. Spec: `docs/superpowers/specs/2026-10-29-copy-signoff-tool-design.md`.
- Item identity = `(file, hash)`; `hash` = 16 hex of sha256 of the whitespace-normalised text (`text.ts`). The anchor is used only to detect "changed".
- The ledger is never overwritten when malformed (`LedgerError`); writes are tmp + rename. Stale entries are removed only by an explicit `--prune`.
- `sign` never deletes other entries; it adds the sign and resolves open comments on the same `(file, hash)`.

## Run
- `pnpm copy:review [--port N]` — local viewer on 127.0.0.1 (sign, ignore, comment, group sign). `pnpm copy:status [--strict a,b] [--todo] [--prune] [--json]` — counts per surface; `--strict` exits 1 on unsigned/changed in those surfaces; `--todo` lists open and orphaned comments (agent work); CI runs it without `--strict` (counts only; a malformed ledger exits 2 and fails CI, R9).
- Never deployed, never imported by `apps/*` (`test/guard.test.ts` enforces). `@cs/email/previews` feeds email + document items.

## Ledger rules
- Signature = file + hash. Moving a string keeps its sign; editing it shows "changed" (diffed against the latest sign with the same anchor). `sign` never deletes other entries (R1).
- A malformed ledger stops the tool and is never overwritten. `--prune` removes stale entries (sign/ignore/unresolved comments matching no item, R5) and lists each one (type, file, anchor, text excerpt): run it only AFTER re-signing changed items, because pruning drops the old text "changed" diffs against. Read the list: a prune right after a scanner or glob change can drop real signatures.
- "Changed" diffs against the latest sign at the same anchor whose text is gone from the file; a newly inserted string never shows as "changed" against a neighbour's text (R8).
- Group sign = visible unsigned/changed rows in open groups only (R7). Viewer sends framing-denial headers (R6).

## Scan rulings
- Module mode keeps initializers, returned literals, default values and assignments (R2, R8). Web `.ts` and `packages/tools` are module mode (R8 widened R3).
- Everywhere: string args of message calls (`done`/`fail*`/`refuse`/`refused`/`ToolError`/`push`/`set[A-Z]*` setters, any `.push(…)`) and schema messages (`.min(1, 'msg')`, `{ message | error }`, `.refine(fn, 'msg')`, `.describe`, `addIssue`); other strings in `z.` chains are dropped. `ToolError('internal', …)` without `userFacing` stays out.
- JSX attributes: every copy-like literal is kept unless the name is on the deny-list (`NON_COPY_JSX_ATTRS`, `DROP_ATTRS`, `data-*`, non-text `aria-*`, `on*`). `name`/`type` are dropped only as JSX attributes; as object properties they are display copy (R8).
- Known gaps (not scanned): `packages/verticals/packs/*.yaml` playbook titles/bodies (reach clients as recommendations; BACKLOG); labels passed to local helpers (`chart('Seats…')`, `input('Suite or unit')`, `adMatchAction(…, 'Ad account removed.')`); copy outside the source table (`sources.ts`). Model prompts inside scanned engine files show up: Ignore them.
- Measure misses as well as noise when changing the scanner: list sentence-like literals on lines that produced no item (final-review probe: 341 → 42 misses, 31 by design).
- Add a source: `src/sources.ts` (first matching rule wins); check noise on a sample scan (`test/noise.test.ts` style) before committing.
- New email template or wording-changing variant: add a preview in `@cs/email` `src/previews.ts`.

## Comments become agent work
`copy:status --todo` → apply the edits in source → those items return as "changed" → owner re-signs → `--prune`. A comment is keyed to the text it was made on, so after the edit it no longer matches any item: `--todo` then lists it under "Orphaned comments" (check the current text) until `--prune` removes it. Signing resolves only comments on the signed `(file, hash)`.
