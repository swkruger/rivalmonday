# copy-signoff-tool — local tool to view and sign off every piece of user-facing copy, emails included

**Kind:** planning (dev/owner tool)   **Worktree:** ../CompetitorSpy-wt/copy-signoff-tool   **Base:** main @ 45d6372b
**Plan/spec:** `docs/superpowers/plans/2026-10-29-copy-signoff-tool.md` / `docs/superpowers/specs/2026-10-29-copy-signoff-tool-design.md`

## Status (overwrite)
Built; tasks 1-10 done (guard test + docs in Task 10). `pnpm copy:status` on a fresh ledger: 5,812 items, all unsigned (app-client 694, app-agency 442, app-platform 988, app-account 298, app-shared 727, help 692, guides 86, glossary 81, labels 252, emails 84, documents 3, site 842, site-legal 2, mcp-tools 621), 0 stale. Noise < 2 % per surface (manual samples). Viewer checked in Playwright at 1440 px (sign, group sign, comment, email preview).

## Next (overwrite)
Final review -> owner verification -> merge.

## Owner verification
- `pnpm copy:review`: sign one item and one file group, add a comment.
- `git diff docs/copy/signoff.json` shows the entries; `pnpm copy:status --todo` lists the comment.
- Decide when the CI step becomes blocking (see backlog).

## Interfaces this branch adds or changes
New package `@cs/copy-review` (never imported by apps; guard test); `@cs/email/previews` export; root scripts `copy:review` / `copy:status`; CI report-only `copy:status` step; ledger `docs/copy/signoff.json`. No migration.

## Assumes from other branches
None (`git branch --no-merged main` empty).

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
- Pre-pilot: blocking copy gate in `deploy`/`deploy-site` (`copy:status --strict emails,site,site-legal,app-client`) before the first pilot invite - owner decision.
- Close the per-phase copy sign-off BACKLOG items once their surfaces are signed in the tool.

## Brief

**Scope.** A dev-only, never-deployed tool that lists every user-facing string (app UI, help short copy, guides, glossary, enum labels, emails as rendered previews, brief/report PDF text, marketing site, Ask/MCP-facing text) and records the owner's sign-off per item, so a later edit shows as "changed". It replaces the 17 scattered Markdown sign-off docs. Rules: core spec §1.5 (no evidence, no claim), §8.3 (white-label tool text); help spec (15b) B3 (Claude drafts, owner signs per batch) + B8 (typed short copy, one glossary); phase-17 spec §3, §6.7 (final copy owner-signed), §7.5 (sourced rival facts).

**Inventory of copy sources (main @ 45d6372b).**
- Emails: `packages/email` (React Email 6.11), 31 `.tsx` in `src/templates/` → 28 template ids routed by `render.ts` `renderEmail(payload)` (subject fn per template); `document.ts` renders brief/trend-report HTML for PDFs (`packages/engine/src/briefs/pdf.ts`, `PDF_LAYOUT_VERSION`). **No preview fixtures** (no `PreviewProps`); props exist only inside 20 `*.test.ts`. Senders: `apps/web/src/server/*email*.ts`, `packages/tools/src/*/*email*.ts`, `engine/src/delivery/outbox.ts`. Onboarding mock emails duplicate copy (`components/onboarding/previews/*-email.tsx`).
- Help: `apps/web/src/help/copy/*.ts` (`server-only`), `PAGE_COPY` 66 page keys (17/19/27/3), ~313 tip/empty-state entries. Glossary `packages/core/src/help/glossary.ts` (29 terms). Guides: `docs/help/pages/` 83 Markdown files (front-matter `help_key`, `audience`, `title`) + 3 in `docs/help/`.
- Labels: `apps/web/src/lib/labels.ts` (156 enum labels) + `labels.ts` in `email`, `ask`, `tools/workspace`, `engine/model-ops`.
- Other web copy modules (7): `briefs/copy.ts`, `scan-copy.ts`, `refusal-copy.ts`, `sign-up/problem/copy.ts`, `owner-welcome-copy.ts`, `lib/{spend,platform-spend}-copy.ts`.
- **Inline JSX (the bulk):** ~500 JSX text lines in ~164 of 341 `apps/web` `.tsx`, ~1,260 literal `title/label/placeholder/aria-label/description/message` props; `apps/site` 76 `.tsx`, `packages/ui` 40 `.tsx`. Also `@cs/tools` refusal messages, notification titles (`engine/src/briefs/notify.ts`).
- Site: `apps/site/content/` 27 files (17 `.ts`, `legal/{privacy,terms}.md`, `sample-brief.json`, `verticals.json`), `src/components/join/copy.ts`. Claims ledger `docs/research/2026-10-29-phase-17c-claim-check.md` (~49 rows, id → allowed wording), `compare.ts` `ledger` ids (`compare.test.ts`).
- Model-facing: ~270 tool `description:` fields (`packages/tools`); Ask `prompt.ts`.
- **Existing sign-off mechanisms:** 17 docs `docs/archive/phase-*-copy-signoff*.md` (1–159 KB; `Where | Copy | OK / edit` tables + "Decisions for the owner"; strings copied from code, so they drift). Only `phase-15c2` carries "Signed off by the owner" (STATE also notes 15c-2b-2 approved 2026-10-24); the rest pending. 7c2 copy is listed only in `STATE.md` Next up. Gates: `apps/site` `check:placeholders` (`OWNER-PLACEHOLDER` in founder/privacy/terms; CI `deploy-site` refuses) and `check:facts`; `help/copy/copy.test.ts` (no placeholder/TODO, only `{agency}{assistant}{client}`, no "Rival Monday"/"Friday"/km, no agency-internal words in client copy); `copy-bundle.test.ts`; `refusal-copy`/`spend-copy`/`paused-copy` tests; `packages/evals/src/rules/claims.ts`.

**Already built — reuse, don't rebuild.** `renderEmail` + file outbox (`EMAIL_OUTBOX_DIR`, `.json`+`.html`); `document.ts` (PDF text); `@cs/demo` world for realistic props; shots harness `apps/web/e2e-shots/` + `scripts/shots-index.ts` (every route 1440/390 → `.shots/index.html`); dev panel (`check:no-dev-panel` guard); `kb:seed` front-matter parser.

**Binding decisions (don't re-open).** Owner signs copy; help short copy is `server-only` TS in `help/copy/` (a Node script needs the `react-server` condition or a shim to import it); guides = repo Markdown seeded by `kb:seed`; glossary = one typed `@cs/core` list; status text via `lib/labels.ts`; nothing client-facing names Rival Monday (white-label, placeholders `{agency}`/`{assistant}`); `apps/site` never imports app code (the tool may read both, the site must not import the tool); site public claims only from the claims ledger/code, rival facts ≤ 90 d; dev panel never ships.

**Backlog to fold in (verbatim).**
- "Sign off the `/platform/health` help copy (description, 4 status tips, operator guide) — *7a1*"
- "Sign off copy marked in the 7b1/7c2 plans before each task builds it (credit notices, pause/heavy-load banners, credit refusals, staff emails, feedback links) — *phase-7-planning*"
- "Sign [archive/phase-16-onboarding-copy-signoff.md] (incl. "Decisions for the owner" + "Final fixes") — *phase-16*"
- "Verify Phase 15b …: sign off the four `phase-15b2-copy-signoff-{client,agency,platform-account,terminology}.md` incl. decisions … — *moved from STATE at phase-16 merge*"
- "Verify 15c-1: … sign off [archive/phase-15c1-copy-signoff.md] … — *moved from STATE at jev-openrouter merge*"
- "Owner decision (15b-2 sign-off): scorecard/briefs-detail say "First moves still open" vs glossary "First steps" — *phase-15b2*"
- Readiness item "… no `HelpTip` on the readiness section (needs owner copy) … — *7c2 T6/T7/final review*"; 7c2 Task 12 "… close … the 7c2 part of the copy sign-off item — *phase-7c2*"
- Copy docs linked from BACKLOG verify items 15b-3b, 14, 15a, 11-fixes, 11; STATE: 17a/b/c files, 7c2 list.

## Open questions
Answered by the spec, decisions D1-D12 (`docs/superpowers/specs/2026-10-29-copy-signoff-tool-design.md`).
