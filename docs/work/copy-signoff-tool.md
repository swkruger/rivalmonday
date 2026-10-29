# copy-signoff-tool — local tool to view and sign off every piece of user-facing copy, emails included

**Kind:** planning (dev/owner tool)   **Worktree:** ../CompetitorSpy-wt/copy-signoff-tool   **Base:** main @ 45d6372b
**Plan/spec:** `docs/superpowers/plans/2026-10-29-copy-signoff-tool.md` / `docs/superpowers/specs/2026-10-29-copy-signoff-tool-design.md`

## Status (overwrite)
Spec + lean plan written (owner said "just start": decisions D1–D12 are Claude's calls). Awaiting owner plan approval.

## Next (overwrite)
Owner approves the plan → Task 0 pre-flight → subagent-driven development.

## Interfaces this branch adds or changes
None yet. Next free migration `0097` (only if Q2 picks a DB table).

## Assumes from other branches
None (`git branch --no-merged main` empty).

## Decisions (owner-approved)
None yet.

## New backlog (target → item)
None yet.

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

## Open questions for the owner (most design-changing first)
1. **Form factor.** (A) local web app in a new private package (`pnpm copy:review`, 127.0.0.1), imports `@cs/email`, reads app/site sources; (B) dev-only route in `apps/web` behind the dev-panel guard; (C) CLI that writes static HTML, sign-off by editing a file. **Rec A:** no change to either app's build.
2. **Where sign-off lives.** (A) repo ledger (e.g. `docs/copy/signoff.json`) keyed by copy id + hash of normalised text, so an edit flips the item to "changed"; (B) DB table (migration 0097, `TABLE_CLASS`, RLS); (C) markers in source comments. **Rec A:** git-reviewable, no tenancy work.
3. **Granularity.** (A) per string, grouped by surface/page with "sign group"; (B) per file/template; (C) per screen. **Rec A**, with emails per template variant (subject + rendered text).
4. **Inline JSX strings.** (A) static AST scan of JSX text + literal props (id = file + text hash) with links to the route's screenshot; (B) extract all to copy modules first; (C) screenshots only, sign per screen. **Rec A**, extracting only files the scan finds noisy.
5. **Existing Markdown docs.** (A) all items start unsigned; (B) seed "signed" only from docs marked signed (15c2/15c-2b-2); (C) grandfather all current copy as signed. **Rec B.**
6. **CI/deploy gate.** (A) none; (B) report-only CI step listing unsigned/changed counts; (C) `deploy`/`deploy-site` refuse while client-facing copy, emails or site copy is unsigned/changed (like `check:placeholders`). **Rec B now, C before the first pilot invite.**
7. **Editing.** (A) view + sign only; (B) plus per-item comments/suggested wording stored in the ledger for an agent to apply; (C) edit source in place. **Rec B.**
8. **Model-facing text** (tool descriptions, Ask prompt). (A) out of scope; (B) tool descriptions in, prompts out; (C) both. **Rec B** (agencies read them in MCP clients).
9. **Split into sub-phases?** (A) one branch; (B) copy-1: ledger, viewer, copy modules, help, guides, labels, emails (fixtures), site; copy-2: JSX scan, screenshots, CI gate, legacy import. **Rec B.**
