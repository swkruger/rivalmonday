# app-style — owner canvas "subtle component styling" in the product app

**Kind:** UI workstream (2 stages)   **Worktree:** ../CompetitorSpy-wt/app-style   **Base:** main @ 8e3b86a6
**Plan/spec:** `docs/superpowers/plans/2026-11-04-app-style.md` · `docs/superpowers/specs/2026-11-04-app-style-design.md` (no roadmap row)

## Status (overwrite)
Spec + plan written, awaiting owner approval (2026-11-04). No product code yet. Site twin (unmerged `site-story`, D14 / Task 11) already restyled apps/site.

## Next (overwrite)
Owner approves the plan → `superpowers:subagent-driven-development` from Task 0 (pre-flight + "before" shots), stage A Tasks 1–8, stage B Tasks 9–12, Task 13 visual check + suites.

## Interfaces this branch adds or changes
- `packages/ui/src/styles.css` tokens:
  - `--chrome`, `--ink-hover`, `--success-strong(-hover)`.
  - `--on-ink`, `--on-ink-muted`, `--on-ink-link`.
  - `--primary-band-ring` (per agency, from `themeVars`).
  - `--shadow-raised-value` (`shadow-raised`, registered in `cn.ts`).
  - `.rm-ink-band`.
- `@cs/ui` additions:
  - `Button` `ink` | `done`; `Card` `raised`.
  - `Tag` `tone` + `emphasis`; `StatusChip` `emphasis`; `CitationPill` `tone` (+ `citationPillInfoClass`); `chipToneClass`.
  - `NumberMarker`.
  - Segmented tabs: `tabsSegmented*Class`, `variant` on `TabsList`/`TabsLinkList`/`TabsLink`.
- apps/web:
  - `PageHeader` `tone="ink"`.
  - `IMPACT_TONE` (`lib/labels.ts`); `EvidenceChips` `tone`; `StarterChips` `variant`; `components/ask/bubble-classes.ts`.
  - Dev-only `/dev-panel/gallery`.
- `scripts/design-lint.sh`: one `ALLOW_AMBER` entry (`number-marker.tsx`). No migration (next free 0097).

## Assumes from other branches
Independent of `site-story` (apps/site, docs, `scripts/design-lint.sh` only; zero `apps/web` or `packages/` files). Expect a textual conflict in design-lint ALLOW_AMBER (both append); resolve by hand at the later merge.

## Decisions (owner-approved 2026-11-04, "go as recommended"; spec AS1–AS8)
1. Two stages in one branch: A = `@cs/ui` primitives, tokens, design-system doc amendments, gallery; B = page adoption, recommendations board, Friday.
2. Opt-in variants adopted page by page; existing defaults unchanged.
3. Orange = Friday + priority bar + numbered markers (no amber tints).
4. Chip/lane tints fixed neutral/semantic; agency primary only for the active (segmented) tab and selected states.
5. Primary: `ink` on staff/agency pages. Client-facing pages keep the agency-primary fill (`readableTextOn`), with `ink` as a second tier. This amends "primary colour = do this" (D-28).
6. Recommendations board: canvas cards in tinted lanes (amends D-01/D-06 for this board only).
7. Before/after shots of 9 labels at 1440/390 (shots harness) plus a dev-only gallery.
8. Ink band only behind the client page title; top bar unchanged.

Derived (spec AS9–AS17):
- Canvas radii are mapped onto the 4/6/8/12 scale; weights max 600; 36 px controls.
- Tinted category chips are `Tag`s; `done` needs label + check.
- Friday answers sit in bubbles (amends D-14).
- The band re-scopes tokens (white focus).
- The gallery is dev-only.
- No copy changes.

## New backlog (target → item)
None yet (candidates in plan Task 13: platform pages adopting `ink`; ConfirmDialog primary tone).

## Owner verification steps
Open `apps/web/.shots/index.html` (before | after, 9 labels × 1440/390) and `apps/web/.shots/gallery/` after Task 13.

## Brief

### 1. Scope
Owner: "Take some of the subtle styling to the app as well except for using cards overboard except perhaps on recommendations." Canvas = `Main.dc.html` (CSS l.13–51; client view 183–305; recommendations 396–455; Friday 539–578). Take: tinted chips/badges by meaning; button treatments (ink-filled primary, outline secondary, quiet text tertiary, green "done"); segmented tabs; ink/near-white header and title bars; tighter type scale; numbered markers; Friday bubble/input; recommendation lanes (tinted lanes, cards OK there). Not: wrapping sections in cards.
Design-system docs that change (v1 is binding, so each is an amendment):
- `04-design-decisions.md`: new decisions after D-26; touches D-01 (cards: add recommendation-board cards), D-10 (status grammar), D-15 (36 px control).
- `05-design-system-specification.md`: P4 (colour is a signal; orange = Friday), colour tokens (new tints), type scale (l.144), radii (xs 4 for badges), "Selected" row (tabs = 2 px ink underline).
- `06-component-catalog.md`: Button (l.64), Tabs (41), Segmented (46), Status and labels/Badge/Chip (83), Friday (168), Containers (53), Top bar (19), PageHeader (36).
- `design-tokens.json`, `component-examples/rm-*.css`, `09-ai-implementation-playbook.md` (before/after classes), `README.md` exec summary.
Code: `packages/ui` primitives + `styles.css` tokens, apps/web recommendations board, Friday/Ask, PageHeader.

### 2. Already built — reuse, don't rebuild
- `packages/ui/src/components/`: `button.tsx`, `status-chip.tsx` (tone + glyph), `filter-chip.tsx`, `tag.tsx`, `dot-status.tsx`, `tier-mark.tsx`, `tabs.tsx`/`tabs-classes.ts`/`tabs-link.tsx`, `segmented.tsx` (+ `segmentedTrackClass/ItemClass`), `kpi-strip.tsx`, `friday-badge.tsx`, `friday-avatar.tsx`, `frame.tsx`, `band.tsx`, `section.tsx`, `card.tsx`, `control-classes.ts`, `hairline-grid.tsx`, `citation-pill.tsx`.
- Tokens: `packages/ui/src/styles.css` (`--amber #F5A524`, `--amber-text #3B2300`, `--color-amber*`; muted surface `#EEF2F6`); per-agency runtime vars via `themeVars` (`packages/ui/src/theme.ts`; `--primary-foreground` from `readableTextOn`, `--primary-hover/-active` derived; `--focus` fixed).
- App: `apps/web/src/components/recommendation-board.tsx` (`RecommendationCard` = `Card p-4`; lanes l.180–194; page `app/(app)/c/[clientId]/recommendations/page.tsx`). Ask/Friday: `components/ask/{answer,ask-card,ask-chat,friday-dock,friday-dock-trigger,confirm-card}.tsx`. Shell: `components/shell/{app-shell,nav-link,context-switcher,mobile-nav}.tsx`. `PageHeader` lives in apps/web.
- Precedent: the site did it by an unlayered `site.css` override of `@cs/ui` primitives (`.seg-tabs`, product `Frame`, 6 px chips, `--color-amber-tint #FDE7BF`, info tint `#1F5F8F` on `#E3F2FC`), with no `packages/ui` change. Values: `git show site-story:apps/site/src/app/site.css` (~l.43, 172–260).
- Gotchas: `cn()` is `extendTailwindMerge`; any new custom theme key must be added in `packages/ui/src/lib/cn.ts` or is silently dropped. Tokens only (no hex, `rounded-[…]`, `text-[…px]`). StatusChip non-neutral tones keep a glyph. No route `loading.tsx`. Read `apps/web/CLAUDE.md` before coding.
- `scripts/design-lint.sh` is strict (must stay 0). `ALLOW_AMBER` today: Friday badge/dock/nav pill/evidence Ask link, client page BAR priority, plus site entries. Each entry needs a `# reason`. Any amber outside these (numbered markers, amber-tint chips) needs new entries or a token alias.

### 3. Binding decisions (not re-opened; flags = request touches it)
- Design system v1: one white sheet in a #F6F9FC frame, sections before cards, shadows only on floating layers, cards only for independent objects. **Flag:** recommendation cards (lanes are an independent-object case; small amendment to D-01).
- Brand: primary #47A8E7 (ink #0B2540 label), secondary #2A6BAC, accent/Friday #F5A524 on #3B2300, canvas #F6F9FC, panels #EEF2F6, Inter, max 1560. **Flag:** orange = Friday + priority bar only (P4); numbered markers and amber tints widen it.
- Per-agency brand tokens: primary/secondary overridable, button text via `readableTextOn`, chart `--you` = agency secondary. Styling must work with any agency colours. **Flag:** ink-filled primary vs "primary colour = do this".
- D-15 one 36 px control height; weights 400/500/600; radii 4/6/8/12/full; chart roles you + ≤2 rivals + grey; one primary button per view. **Flag:** green "done" is a new button tone (status never by colour alone).
- Copy sign-off ledger if strings change.

### 4. Backlog to fold in (source tag)
- Shell: top-bar search trigger + Ask pill (Frame 2); sidebar collapse-to-rail — *phase-16*
- Friday panel: feedback icons, follow-ups after answers, conversation title, toast (Frame 12); composer draft survives panel close/resize; … — *phase-16 (16d)*
- Client pages: applied-filter chips with ✕; bulk bar Select all/clear; … `rounded-[5px]` on Moves rows; … — *phase-16 (16c)*
- Rulings to confirm: "≤ 1 primary per view" vs one primary per queue card; … — *phase-16 (16e)*
- Card-in-card reduced to plain wrappers, not traced across component files (`lead-card.tsx:135`, `ai-connections.tsx:128`, `changes/viewer.tsx`, `competitor-controls.tsx`) — *phase-16*
- design-lint gaps: skips `.ts`, 3-digit hex, `shadow-[…]`, `font-bold`; narrow `ALLOW_HEX`/`ALLOW_AMBER`; add design-lint to CI (owner said yes 2026-11-02, D17) — *phase-16*
- 13a: brand-aware chart check (`--you` = agency secondary may clash with rival orange #E05A2B); … Switch `bg-secondary` + white thumb (~1.4:1 on #FFD400) — *phase-16*
- Overview "N open" is a hand-rolled span — *15c-2b-2*; chip hex duplicated in `status-chip.tsx` and `styles.css` — *15c-1*; `--color-secondary-foreground` is still a literal — *phase-15c2a*; snippet button hard-codes #47A8E7 — *11c*

### 5. In-flight workstreams
Only `site-story` (work file: homepage story rewrite; Tasks 0–8 + 10 done, Task 9 owner sign-off pending). Diff vs main: 61 files, all apps/site, docs and `scripts/design-lint.sh` (+14 ALLOW_AMBER lines); nothing in apps/web or packages. Overlap: design-lint ALLOW_AMBER only. D14 widens amber for the site home page only, not the app. Next free migration: 0097 (none expected).

### 6. Open questions
Answered 2026-11-04 ("go as recommended"): see Decisions above.
