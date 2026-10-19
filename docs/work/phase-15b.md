# phase-15b — help system and per-page help

**Kind:** planning   **Worktree:** ../CompetitorSpy-wt/phase-15b   **Base:** main @ f1ec9683
**Spec:** [2026-10-19-phase-15b-help-system-design.md](../superpowers/specs/2026-10-19-phase-15b-help-system-design.md). **Plan/spec:** inputs [15 spec](../superpowers/specs/2026-10-18-phase-15-ux-ia-design.md) §1 D6–D7, §2.7, §4 · [audit](../research/2026-10-18-phase-15-ux-audit.md) · [inventory](../research/2026-10-18-phase-15-page-inventory.md) · [6c KB spec](../superpowers/specs/2026-10-12-phase-6c-knowledge-design.md). 15b spec addendum + plan: not written.

## Status (overwrite)
2026-10-19: spec owner-approved; 15b-1 plan written ([plan](../superpowers/plans/2026-10-19-phase-15b1-help-system.md), 12 tasks T0–T11), awaiting owner approval. No code. Planning-only worktree (no pnpm install yet).

## Next (overwrite)
Owner approves the 15b-1 plan → execute **after phase-14b merges** (B6): pre-flight rebase, `pnpm install`, own test DB, next free migration. 15b-2 plan after 15b-1 merges.

## Interfaces this branch adds or changes
None yet. Likely: KB page-key lookup (maybe a migration — next free at execution, after 14b's 0079), `HelpTip`/`FieldHint`/`PageGuide`, `/agency/help`, `/c/<id>/help`.

## Assumes from other branches
- `phase-14b` merges first or 15b rebases onto it; its pages need keys (below).

## Decisions (owner-approved)
B1–B10 in the spec §1: split 15b-1 system / 15b-2 content; audience all/agency/client/operator; Claude drafts, owner signs off per batch; Help pages per context; guides citable by Ask/MCP (audience-filtered); 15b-1 after 14b merges; guides = repo Markdown via kb:seed; short copy = TS constants, glossary = typed list in @cs/core; placeholders + neutral fallback; tour/override editor/analytics/new hints → backlog.

## New backlog (target → item)
Unscheduled → product tour; agency guide override editor; console editor for platform guides; help-usage analytics; first-visit "new" hints (B10).

## Owner verification steps
TBD.

## Brief

**1. Scope** (spec §4, D6, D7, §2.7)
- Help layers 1–4 on every page: description (`PageHeader.description`), `?` tips on metrics/terms, teaching empty states, **"? Guide" drawer**. Product tour → backlog (D6).
- Components: `HelpTip` (popover; tap + keyboard), `FieldHint` (`aria-describedby`), `PageGuide` (Sheet reading the KB article for `PageHeader.helpKey`).
- Content keyed `page:<context>.<page>` (e.g. `page:client.reviews`), platform-authored, white-label placeholders, never "Rival Monday" client-facing; same key at agency level = later override (editor → backlog) (D7). One guide per page key.
- Glossary/terminology pass (audit §3 Terminology); Help index `/agency/help`, `/c/<id>/help` (`/kb/[id]` = article view, audit §2.5); avatar-menu Help link (§2.9).

**2. Already built — reuse, don't rebuild** (`apps/web/src/` unless noted)
- `components/page-header.tsx`: `helpKey?` accepted, renders nothing; 59/79 pages use `PageHeader`, none pass a key.
- `@cs/ui` (`packages/ui/src/components/`): Tooltip (used once, `components/rival/signal-pills.tsx`), Popover, Sheet, Dialog, Command, Tabs.
- `components/stat-card.tsx` (`hint`), `components/form-error.tsx` (`ErrorNote`), `components/agency/onboarding-checklist.tsx`, `components/read-only.tsx` (`ReadOnlyProvider`).
- KB: `kb_article`/`kb_chunk` (0045/0046; levels platform/agency/client, kinds help|playbook|qa|blog|fact, `seed_key` UNIQUE, **no page-key column**); `search_knowledge` (web/ask/mcp) + `get_kb_article` (web, **by id only**) in `packages/tools/src/tools/knowledge.ts`; `renderKbText`/`lintKbText` (`{{product}}`, `{{assistant}}`) in `packages/core/src/kb.ts`; `kbNamesFor` (`packages/tools/src/kb/names.ts`, falls back to "Rival Monday").
- `components/kb/article-sheet.tsx` (lazy `loadKbArticle`, `app/(app)/kb/actions.ts`), `components/kb/article-view.tsx` (`KbArticleView`, level labels), `app/(app)/kb/[id]`; `/platform/knowledge`, `/new`, `/[id]` (seed rows read-only).
- `docs/help/*.md` (3 articles) + `pnpm kb:seed` (`apps/worker/src/cli/kb-seed.ts`, `packages/tools/src/kb/seed.ts`); demo `packages/demo/src/kb.ts`.
- `components/shell/avatar-menu.tsx` ("Help joins in 15b"), `components/shell/nav-items.ts` (`navFor`, `settingsNavFor` = page labels/keys).
- White-label: `displayNameFor`/`NEUTRAL_PRODUCT_NAME` (`packages/mcp/src/branding.ts`), `assistantNameFor` (`server/ask.ts`); access-level copy in `app/oauth/consent/consent-form.tsx`.

**3. Binding** — root `CLAUDE.md` § Decisions (incl. "UX & IA (Phase 15)"; nothing client-facing names Rival Monday; Friday renamable → always `assistantName`); spec D1–D15 (esp. D6, D7); 6c k1–k11 (operator-only authoring, read-time placeholders, `search_knowledge`); 15a rulings (STATE "Next up" 8: labels, "Business profile", Ask disclosure "…reviewed by our support team…", title = menu label). Never reopen.

**4. Backlog to fold in** (verbatim)
- "**15b** help system: `HelpTip`/`FieldHint`/`PageGuide` (KB articles keyed `page:<context>.<page>`, `PageHeader.helpKey`), teaching empty states, glossary pass, Help pages — spec 2026-10-18 §4; audit §2–§3 items tagged 15b. Also: pin button nested in `role=option` (a11y); support viewers have no AI connection settings tab — *phase-15a*"
- "Knowledge base: file upload (PDF/DOCX), browsable Help page (`/agency/help`, `/c/<id>/help` → Phase 15b), …" (only the Help page part).
- Related: 13a item "KB `{{product}}` 'Rival Monday' fallback" — a client-read guide must not hit it.
- Audit items tagged 15b (full list audit §2):
  - Platform §2.1: overview tile hints; agencies Health legend; support dialog (60 min/read-only/audited); billing UUID entry; themes "theme/topic"; guides billing, reviews (τ), knowledge.
  - Agency §2.2: Pressure colour-only (H); Portfolio empty state + checklist 5 vs 4; Vertical/Service type/Industries; hard-coded "Friday"; approval confidence colour-only (H); alert score/17:00 digest; Convert; Accept and invite; Cap/Limit labels; playbook placeholders; Seat undefined (H); AI access levels; webhook how-to; "includes 3 clients" (H); intake slug; onboarding plan step; guides Monday routine, reviewing a brief.
  - Client §2.3–2.4: Overview pills/terms; tiers + "Rated"; profile pressure (H); Changes score scale (H) + route pills; Pricing pill; Ads targeting; Reviews heatmap (H); Rankings jargon (H); Moves wording/statuses; Ask disclosure line; evidence hashes; setup "Advanced" (H); profile summary + AM link; "After AM check" (H); alert band bar; guides changes, reviews, rankings, AI connection.
  - Account §2.5: notification labels. §3: Hover help, Terminology.
- 15c owns formatters/miles/StatusChip; 15b copy assumes miles.

**5. In flight**
- `phase-14b` (base e0f6f627, pre-15a; must rebase): 14a done — `/platform/verticals` "Business types" (0077–0078); 14b in progress — runbooks (0079), `/platform/runbook`, `/agency/settings/runbook` (replaces Playbooks), client Runbook tab. Needs keys + copy for those 4 pages plus new-business-type panel/"New" chips. No KB overlap (runbook ≠ KB `playbook` kind; avoid that word in the glossary).
- 13a (not started): Domains, Client customisation tabs → keys later. `phase-7-planning`: parked, docs only.
- Migrations: next free at execution (0080+ after 14b).

**6. Open questions** — all answered 2026-10-19; see Decisions / spec §1.
