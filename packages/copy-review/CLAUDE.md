# @cs/copy-review

- Local, never-deployed tool: scans user-facing copy from the code and records owner sign-off in `docs/copy/signoff.json`. Spec: `docs/superpowers/specs/2026-10-29-copy-signoff-tool-design.md`.
- Item identity = `(file, hash)`; `hash` = 16 hex of sha256 of the whitespace-normalised text (`text.ts`). The anchor is used only to detect "changed".
- The ledger is never overwritten when malformed (`LedgerError`); writes are tmp + rename. Stale entries are removed only by an explicit `--prune`.
- `sign` never deletes other entries; it adds the sign and resolves open comments on the same `(file, hash)`.
