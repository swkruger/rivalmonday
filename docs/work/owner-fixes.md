# owner-fixes — fixes found during the owner's staging checks

**Kind:** fix   **Worktree:** ../CompetitorSpy-wt/owner-fixes   **Base:** main @ 8f81b984
**Plan/spec:** none (five small decided fixes, owner said start 2026-11-02; source list: the "Agent to-do" section of the owner guide)

## Status (overwrite)
All five items done 2026-11-02 (commits 41d06559..6270fb17). `test:affected --base main`: 18/18 tasks green (60 min); `e2e:affected`: 153/153 (6.9 min). Item 4 is a GitHub setting, applied 2026-11-02: branch protection on `main` requires `evals-live`; admins may bypass (so `/rm-merge`'s direct push works); force pushes off.

## Next (overwrite)
Owner: confirm `EMAIL_FROM` is a bare address in the Vercel `staging` environment (`.env.staging` already is): after this merges, the web app and the worker refuse a display name. Then `/rm-merge owner-fixes`.

## Scope
1. Emails: body text 16 px / 24 px line height (one `Text` default for every template), secondary lines 14 px, button label 16 px with more padding, button label colour via `readableTextOn` (CLAUDE.md 15c-2a; was white on #47A8E7). Layout only, no wording.
2. `EMAIL_FROM` must be a bare address: refuse a display name at start-up (web + worker); docs say so. Staging had `Name <addr>`, so every branded `"Rival Monday" <EMAIL_FROM>` send failed in Postmark ("Error parsing 'From'").
3. Site waitlist form: a Turnstile `error-callback` counts as unavailable, so the form says so instead of "Still checking" forever.
4. `evals-live` as a required check: owner decision 2026-11-02 (`ask-inject-09` fixed), applied after the `evals` GitHub secrets are in.
5. Clear the 26 stale copy-ledger entries in `docs/copy/signoff.json`.

## Interfaces this branch adds or changes
- `contrastRatio` / `readableTextOn` move to `@cs/email/branding` (pure); `@cs/ui` `theme.ts` re-exports them.
- `@cs/email` templates import `Text` from the package's own wrapper (16 px default) instead of `react-email`.

## Decisions (owner-approved)
1. Owner, 2026-11-02: email text larger and easier to read.
2. Owner, 2026-11-02: `evals-live` becomes a required check.

## Owner verification steps
- Open a few emails in `pnpm copy:review` previews (and one real staging email on a phone): body text 16 px, button label dark on the light blue.
