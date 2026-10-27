# Phase 16 — design system v1 on every page (design)

**Date:** 2026-10-27 · **Branch:** `phase-16` · **Brief:** `docs/work/phase-16.md`
**Source of truth:** `docs/design-system/` (binding). This spec adds only the phase split, the owner's answers to the brief's Q1–Q9, deltas found by re-measuring `main` @ `0c28be0e` against the playbook (09, written @ `10ce242d`), and the interfaces 16a adds. Everything else: playbook § by number.

## 1. Intent
Make the whole app look like the storyboard (one white sheet, sections before cards, calm status grammar) without changing what any page does (D1). Do it in reviewable slices so the owner sees each step and can steer before the next one. Success: every non-onboarding page passes 08 § 8, the detection counts in 09 § 8 are 0, and nothing a user could do before is lost.

**Non-goals:** new features, copy rewrites, dark mode (15a D11), bottom tab bar (D12 below), white-label work (13a).
**Anti-goals:** a page that "looks done" but lost a control, a link, an a11y name or an E2E path; agency colour leaking into anything but `--primary`/`--secondary` (09 § 0 rule 4); a half-migrated app left on `main` where white cards vanish on the white sheet (09 § 9 order: PR 4 before PR 5).

## 2. Decisions (owner, 2026-10-27: "take the recommendations")
| # | Decision |
|---|---|
| D10 | **Six sub-phases, one continuous pass** (owner 2026-10-27: "continue with whole pass"). All run on this branch (`phase-16`), in order; each gets its own lean plan, written just before it runs (so it plans against the code the previous sub-phase left), its own final review and fix wave. **No owner stop between sub-phases**; one `/rm-merge` at the end with the owner's go-ahead. |
| D11 | **New UI pieces in scope** (narrow reading of D1): drill-in settings nav (16b), peek panel for Changes (16c), bulk bar only where a bulk action already exists (16c), docked Friday panel D-14 (16d). Everything else in the DS that adds behaviour → backlog. |
| D12 | **Bottom tabs not built.** Drawer < lg stays (15a D8); OD-5 bottom tab bar moves to BACKLOG until 3–5 pilot owners test on phones. 16f does drawer + bottom sheets + 390 px sweep only. |
| D13 | **Mockups:** a storyboard frame is the approval for pages it covers. Unframed groups (agency, platform, auth/account) and new pieces without a frame follow D15; an HTML mockup is written into `docs/design-system/mockups/` for the record but does not wait for the owner (D10). |
| D14 | **Visual check:** a screenshot run (§ 4.6) at 1440 and 390 per page, compared with the frame by each sub-phase's final reviewer; the owner reviews `before` (main) vs `after` once, before merge. Not a pixel-diff gate. |
| D15 | **Unframed pages** use the nearest archetype (07) and frame components; no new patterns without a mockup (D13). |
| D16 | **Tests:** unit tests that assert class strings move to role / `data-slot` / `data-variant`; E2E stays role-based (no broad `data-testid`). `@axe-core/playwright` (dev dep) lands in 16a; from 16b every migrated page has 0 serious/critical axe violations. |
| D17 | **Lint:** `scripts/design-lint.sh` is report-only until 16f makes it blocking; it enters CI only with owner approval at 16f. |
| D18 | **13a (white-label) runs after Phase 16** and builds on the new tokens/shell. |
| D19 | **Approved onboarding screens may change** with the primitive restyle (owner 2026-10-27); their main screens, sign-up and intake are in the shot list. |

## 3. Sub-phases
| Sub | Playbook PRs | Content | Review |
|---|---|---|---|
| **16a foundations** | 1–4 | tokens, primitive restyle, new primitives, container sweep (C1–C4, `Card` = Frame), OnboardingShell tokens, screenshot + axe harness, `design-lint.sh`; backlog items in § 4.7 | final reviewer + shots |
| 16b shell + Overview | 5–6 | shell sheet, PageHeader (C6–C8), drill-in settings nav, Overview slice (KpiStrip, Friday summary Band, hairline chart grid, chart tokens), topic-heatmap tokens | final reviewer + shots (09 § 9 PR 6's owner stop waived, D10) |
| 16c client workspace + detail/settings | 7–8 (client) | Competitors, Changes (+ peek panel), Ads, Reviews, Rankings, Pricing, Moves, Evidence, competitor detail; client settings to Form archetype | final reviewer |
| 16d Friday + briefs | 9 | Ask page, docked panel, CitationPill wiring, SourcesList, brief reading view, alert/report views | final reviewer |
| 16e agency, account, platform, public | 7–8 (rest) | agency dashboard/clients/alerts/approvals/leads/prospects, agency settings, platform pages, account/settings, auth (D-22), `/start` panel, errors; mockups per D13 first | final reviewer |
| 16f responsive + lock-in | 10–11 | drawer + bottom sheets (D12), 390 px sweep, lint blocking, delete `--shadow-card`, StatusChip `icon` required; owner asked about CI lint (D17) | **owner: before/after shots, then merge** |

Each later sub-phase re-measures with 09 § 8 at its pre-flight and applies 09 § 6.2 verdicts (re-checked per § 6.1) to its own files only.

## 4. 16a — what it builds

### 4.1 Deltas from the playbook (re-measured 2026-10-27)
- **§ 3.4 is half done:** `--primary-foreground` already comes from `readableTextOn()` in `themeVars` (15c-2a) and defaults to ink. Keep it. 16a adds: `--focus` fixed `#2A6BAC` (not derived; no optional branch), and `--secondary-foreground` via `readableTextOn(secondary)` (BACKLOG *phase-15c2a*), `:root` default `#FFFFFF`.
- **Font-size tokens:** the playbook's recipes use `text-[13px]`/`text-[11px]`, which its own rule 1 forbids. 16a adds `--text-13` (13px / 18px line) and `--text-11` (11px / 14px line) in `@theme`, giving `text-13`/`text-11`; every recipe's `text-[13px]`→`text-13`, `text-[11px]`→`text-11`. *(Claude's call.)*
- **StatusChip:** 45 call sites, no `icon` prop today. 16a adds `icon?: LucideIcon` with a **default glyph per tone** (warning `TriangleAlert`, danger `CircleAlert`, success `CircleCheck`, info `Info`, neutral none) so every chip gets a glyph without touching call sites; 16f makes it required. *(Claude's call.)*
- **Badge:** 0 call sites → delete `badge.tsx` and its export in 16a (not at lock-in).
- **Button `secondary`:** 1 call site (`platform/agencies/page.tsx:93`) → `outline`; delete the variant in 16a.
- **Toast:** none exists → build it (§ 4.3).
- **Counts:** `<Card` 54 in 32 files; `shadow-card` 61 web + 2 ui; `rounded-[14px]` 64. Onboarding has none.
- **OnboardingShell literals** (`components/onboarding/onboarding-shell.tsx` and siblings): `text-[30px]`→`text-3xl`, `text-[13px]`→`text-13`, `text-[15px]`→`text-base` (15 is off-scale) *(Claude's call)*; layout widths (`max-w-[460px]` etc.) stay. `components/onboarding/field.tsx` is replaced by the new `@cs/ui` `Field` only if the swap is visually identical; otherwise it stays local and is listed for 16f.

### 4.2 Tokens (PR 1)
Exactly 09 § 3.1–3.3 + § 3.5, plus § 4.1 above. `--chip-warning-bg` → `#FFF7E6` (the optional line in 09 § 3.2; matches warning alerts). Hex without tokens from BACKLOG *phase-15c2b2*: disabled `bg-[#CBD5E1]` and signal-pills border `#CBD5E1` → `line-control`; tier chip `#E2E8F0`/`#F1F5F9`/`#4A5D73` → `line`/`canvas`/`ink-secondary` (or `TierMark` if the chip is a tier); topic-heatmap fills wait for 16b.

### 4.3 Primitives (PR 2–3)
Restyle per 09 § 4.1, 4.3–4.7 (+ C9, C10). New files in `packages/ui/src/components/`, each exported from `index.ts`, each with a unit test (roles, aria, tone/variant mapping via `data-tone`/`data-variant`):

```ts
DotStatus({ tone: 'success'|'warning'|'danger'|'info'|'neutral'|'off', children })
FilterChip({ applied?: boolean, dashed?: boolean, pressed?: boolean, onRemove?: () => void, field?: string, ...ButtonProps })
  // applied + onRemove renders the ✕ button, aria-label `Remove filter ${field}`
Tag({ children })
TierMark({ tier: 'top'|'watch'|'minor' })      // label from @cs/core tier names
Segmented({ value, onValueChange, items: { value: string; label: ReactNode }[], 'aria-label': string })  // radix ToggleGroup single, role=radiogroup
Field({ label, required?, optional?, help?, error?, children })  // clones the single child with id / aria-describedby / aria-invalid
Alert({ tone: 'info'|'warning'|'danger'|'neutral', icon?: LucideIcon, title?, children })
Section({ title?, description?, actions?, ruled?: boolean, children })  // <section>, h2; heading level prop `as?: 'h2'|'h3'`
Band({ tone?: 'canvas'|'muted', children })
KpiStrip({ children }) + Kpi({ label, value, delta?: KpiDelta, href? })    // hairline grid, 09 § 5.3; link cells stay links
type KpiDelta = { value: number; unit?: string; goodWhen: 'up'|'down'|'neutral'; comparison: string }  // 06 § KPI strip
  // renders arrow + signed value + `comparison` caption; tint good/bad from goodWhen; aria-label `Up 0.1 from last week`
  // comparison is required: never a delta without what it compares to (06). (Claude's call.)
CitationPill({ href, source, date, icon? })   // accessible name `Evidence: ${source}, ${date}`; consumer wiring is 16d
SourcesList({ items: { href, title, date, icon? }[] })
TableFrame({ children }) ; Table `density?: 'compact'` ; TableHead/TableCell `numeric?: boolean`
Toast: ToastProvider + useToast(): { show(opts: { message: string; action?: { label: string; onClick: () => void } }): void }
  // radix-ui Toast; role=status; bottom-right; 4 s, 6 s when action is set; mounted once in apps/web ShellProviders; no call sites in 16a
Card: variant?: 'default'|'interactive', selected?: boolean   // 09 § 4.5; Card = Frame
Button: + variant 'destructive-outline'; − 'secondary', − 'xs', − 'icon-xs'
StatusChip: + icon?: LucideIcon (default per tone, § 4.1)
ConfirmDialog: + open?/onOpenChange? (controlled), error?: string (inline, role=alert), children?: ReactNode  // BACKLOG R11
```
`ConfirmDialog` extension (BACKLOG *phase-15c3 (R11)*): `trigger` becomes optional when `open` is controlled. `ActionDialog` (`platform/agencies/[id]/action-dialog.tsx`) stays as a **thin web wrapper** around a controlled `ConfirmDialog` and keeps its web-only parts (`FormResult` handling, `refusal` mode, close-only fallback, `canSubmit`, `onDone`, `ErrorNote` focus, autofocus rule, `confirm-text` stripping); only its own dialog chrome/markup moves into `ConfirmDialog`. Manage-menu and people-section behaviour unchanged, covered by their existing E2E. *(Claude's call.)* Field's required marker copy "(required)" (sr-only) is the only new copy → owner sign-off line in the work file.

### 4.4 Container sweep (PR 4)
C1–C4 (09 § 7) across `apps/web/src`, one commit per codemod, then `Card` restyle (09 § 4.5). Goal: nothing invisible on the coming white sheet; page-by-page verdicts (§ 6.2) are **not** applied in 16a except where the codemod output is plainly broken (card-in-card after restyle → inner becomes plain `div`, noted in the work file). Also from BACKLOG *phase-15c3b*: plans-tab "Agencies not on the current version" shadow `card` → covered by C1; `billing/plan-move-parts.tsx` → `platform/_components/`; replace hard-coded `['ask','mcp']` with `PLAN_FEATURES`.

### 4.5 Lint (PR 1)
`scripts/design-lint.sh`: Git-Bash script running every line of 09 § 8 plus `text-\[\d+px\]` (allow `onboarding/` nothing; allow chart files listed in § 8), printing `label: count` per line and the total; exit 0 always in 16a. `--strict` flag (exit 1 on any non-zero) exists but is unused until 16f. Not in CI (D17). Root script `pnpm design:lint`.

### 4.6 Screenshot + axe harness
- `apps/web/playwright.shots.config.ts`: mirrors `playwright.panel.config.ts` (own `testDir: './e2e-shots'`), reuses `E2E_SERVER_ENV`, `global-setup.ts` seed and port `E2E_PORT` (so never alongside E2E). Not matched by `e2e`, `e2e:affected` or CI.
- `apps/web/e2e-shots/routes.ts`: `export const SHOT_ROUTES: { label: string; path: string | ((fx: Fixtures) => string); as: 'admin'|'agency'|'owner'|'signed-out' }[]` covering one page per archetype per context (≈ 25: agency dashboard, clients, alerts, a settings page; client overview, competitors, changes, competitor detail, evidence, rankings, reviews, ads, ask, a brief, client settings; platform overview, agencies, health, costs, billing, knowledge; sign-in, sign-up, agency onboarding steps, client setup steps (find, competitors, invite), `/start` intake, 404 — D19). Sessions/ids from existing seed fixtures (`e2e/helpers.ts`, fixture files).
- `e2e-shots/shots.spec.ts`: per route × viewport (1440×900, 390×844) a full-page PNG to `apps/web/.shots/<SHOTS_LABEL ?? 'local'>/<label>-<w>.png`, plus `@axe-core/playwright` scan; writes `axe.json` (`{ label, serious, critical, ids[] }[]`). In 16a it never fails on axe; from 16b a route can be marked `gate: true` → 0 serious/critical asserted.
- Script `pnpm --filter @cs/web shots` (`playwright test -c playwright.shots.config.ts`). `before` shots: run the harness from its own first commit (harness only, no visual change) with `SHOTS_LABEL=before`; `after` at each sub-phase's final review. A static `index.html` in `apps/web/.shots/` pairs before/after per route for the reviewer and, at the end, the owner.

### 4.7 Backlog folded into 16a
*phase-15c2a* secondary-foreground (§ 4.1) · *phase-15c2b2* hex (§ 4.2, heatmap → 16b) · *phase-15c3 (R11)* ConfirmDialog (§ 4.3) · *phase-15c3b* plans-tab items (§ 4.4) · *phase-16* "support banner overlaps the onboarding top row" (shell z-order/offset only). Other *phase-16* Soon items (contact `updated_at`, owner-pick clock, client-boundary gate, rest of onboarding polish) are not design work: stay in BACKLOG.

### 4.8 Acceptance for 16a
- `pnpm --filter @cs/ui test` green incl. `tokens.contrast.test.ts` and `theme.test.ts` (primary-foreground ≥ 4.5 for #47A8E7, #FFD400, #111111, #2A6BAC, #E11D48; same for secondary-foreground; `--focus` independent of branding).
- `pnpm design:lint` after 16a: `shadow-card` 0 outside `styles.css` definition; `rounded-[14px]` 0; `ring-[3px]|ring-ring/50` 0; `<Badge` 0. Others reported, not required.
- `pnpm test:affected --base main` and `pnpm --filter @cs/web e2e:affected --base main` green at final review; shots run completes; final reviewer compares before/after.
- No behaviour, route, copy (except § 4.3 sr-only line) or migration change. `git ls-files --eol | grep crlf` empty.

## 5. Left to the plan / builder
Task split inside 16a (playbook order), exact before/after strings (re-verify per 09 § 0), the route list's concrete fixtures, and which codemod outputs count as "plainly broken".
