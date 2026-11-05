# app-style — the owner canvas's subtle component styling in the product app

*2026-11-04 · branch `app-style` · brief `docs/work/app-style.md` · base: `docs/design-system/` v1 (by file/decision id), core spec §2.7.*

Owner request and canvas: brief § 1. Twin: `site-story` Task 11 (site-local CSS). Here the look lands as **opt-in `@cs/ui` variants**, never as a changed default.

## 1. Decisions

### Owner (2026-11-04, "go as recommended")
- **AS1 Two stages, one branch.** A = primitives, tokens, `PageHeader` tone, doc amendments, gallery. B = page adoption, board, Friday.
- **AS2 Opt-in only.** New variants/props; every existing default class string is byte-identical after stage A. A page changes only when a stage-B task names it (§ 4).
- **AS3 Orange** = Friday + the priority bar + **numbered markers** (`NumberMarker`, one `ALLOW_AMBER` entry). No amber tints anywhere else (the site's amber "For you" chip is not ported).
- **AS4 White-label.** Chip, lane and band colours are fixed neutral/semantic tokens. The agency primary appears only on the **active segmented tab** and existing selected states (primary-soft).
- **AS5 Primary action.** Staff pages (`/agency/*`, agency onboarding): the page's primary action is **`ink`**. Client-facing pages (`/c/<id>/*`, guests): primary stays the agency-primary fill (`default`, label from `readableTextOn`); `ink` is a second tier (per-card next steps).
- **AS6 Recommendations board** = canvas cards in tinted lanes. Only this board; everything else stays Section → Band → Frame.
- **AS7 Visual check** = before/after shots of the § 5 pages at 1440 and 390 via the existing harness, plus a dev-only gallery (§ 3.8).
- **AS8 Ink band** only behind the PageHeader title block on client workspace pages; top bar unchanged.

### Derived (resolve collisions with binding rules)
- **AS9 Radii stay on the 4/6/8/12/full scale (D-18).** Canvas → app: button 9 px → 6 (controls), rec card 14 → 8, lane 20 → 12, chip 6 → 6 (only with `emphasis="strong"`).
- **AS10 Weights 400/500/600 (D-16):** canvas 700 → 600. Heights per D-15: 36 px controls (segmented track, Ask send), 20 px chips.
- **AS11 Tinted category chips are `Tag`s** (text states the value: "Impact: High"), so no glyph. `StatusChip` keeps the mandatory glyph for attention (D-10/P7).
- **AS12 Board cards:** resting `shadow-raised`, no hover lift (the card is not a link), no primary ring on in-progress cards (AS4).
- **AS13 `done` button:** label must say "Done"/"Mark … done" plus a leading `Check` glyph, so green never carries meaning alone.
- **AS14 Friday answers sit in a hairline bubble** (amends D-14 "no bubble"; brief scope "Friday bubble/input"); user turns are ink bubbles.
- **AS15 The ink band re-scopes tokens** (`.rm-ink-band`): text tokens turn light and `--focus` becomes white inside it (#2A6BAC is 2.8:1 on ink). `themeVars` still never emits `--focus`.
- **AS16 The gallery is dev-only:** `/dev-panel/gallery`, 404 in production builds and whenever the dev-panel guard fails; it is not in the shots harness (that runs a production build).
- **AS17 No copy changes**, so no copy sign-off; no migration; `apps/site` untouched.

## 2. Tokens (`packages/ui/src/styles.css`)

`:root` (fixed; never per agency unless noted):

| Token | Value | Use / contrast |
|---|---|---|
| `--chrome` | `#FBFCFE` | near-white panel body (Friday panel); muted-ink on it 5.3:1 |
| `--ink-hover` | `#2D435B` | `ink` button hover (ink 86 % + white); white on it 10:1 |
| `--success-strong` | `#15803D` | `done` button fill; white 5.0:1 (`--success` #16A34A is 3.3:1) |
| `--success-strong-hover` | `#166534` | `done` hover; white 7.1:1 |
| `--on-ink` | `#FFFFFF` | text on ink; 15.5:1 |
| `--on-ink-muted` | `#B7C7DA` | secondary text on ink; 9.0:1 |
| `--on-ink-link` | `#7FC3F0` | links on ink; 8.1:1 |
| `--primary-band-ring` | `var(--primary)` | 1 px ring on a `default` button inside the band; **per agency** (§ 3.1) |
| `--shadow-raised-value` | `0 1px 2px rgba(11,37,64,.06), 0 6px 20px rgba(11,37,64,.06)` | board cards only |

`@theme inline`: `--color-chrome`, `--color-ink-hover`, `--color-success-strong`, `--color-success-strong-hover`, `--shadow-raised: var(--shadow-raised-value)`. `lib/cn.ts`: shadow list gains `'raised'`. Lanes reuse `bg-muted-surface` / `bg-chip-info-bg` / `bg-chip-success-bg` (muted-ink on each ≥ 4.7:1).

`.rm-ink-band` (unlayered, beside `.rm-kpi`):
```css
.rm-ink-band { background: var(--ink); color: var(--on-ink);
  --muted-ink: var(--on-ink-muted); --ink-secondary: var(--on-ink-muted); --link: var(--on-ink-link); --focus: var(--on-ink); }
.rm-ink-band [data-slot="breadcrumb-page"], .rm-ink-band [data-slot="breadcrumb-link"]:hover { color: var(--on-ink); }
/* White-surface parts keep their own greys. */
.rm-ink-band [data-slot="button"][data-variant="outline"], .rm-ink-band [data-slot="status-chip"], .rm-ink-band [data-slot="tag"] { --muted-ink: #5B6B80; --ink-secondary: #334155; }
.rm-ink-band [data-slot="button"][data-variant="default"] { box-shadow: 0 0 0 1px var(--primary-band-ring); }
```

## 3. Interfaces

### 3.1 `themeVars` (`packages/ui/src/theme.ts`)
Adds `'--primary-band-ring'`: `contrastRatio(primary, '#0B2540') >= 3 ? primary : '#B7C7DA'` (always a validated hex; invisible when the fill already stands out on ink).

### 3.2 `Button` (`button.tsx`) — two new `variant`s
- `ink`: `bg-ink font-semibold text-white hover:bg-ink-hover`
- `done`: `bg-success-strong font-semibold text-white hover:bg-success-strong-hover`
Sizes unchanged. `data-variant` carries the name. `ghost` is the canvas's quiet tertiary (no new variant).

### 3.3 `Card` (`card.tsx`)
`variant?: 'default' | 'interactive' | 'raised'`; `raised` = `border-transparent shadow-raised` (rounded-md, bg-surface kept). Only on the recommendations board lanes (D-29).

### 3.4 Chips
- `Tag`: `tone?: ChipTone` (default `'neutral'`, today's classes) and `emphasis?: 'default' | 'strong'`; non-neutral tones use the `--chip-<tone>-*` pair; `data-tone` set.
- `StatusChip`: `emphasis?: 'default' | 'strong'`.
- `strong` = `rounded-sm px-2 font-semibold` (6 px, 600) over the base.
- `status-chip.tsx` exports `chipToneClass: Record<ChipTone, string>` (the existing `toneClass`), reused by `Tag`.
- `CitationPill`: `tone?: 'neutral' | 'info'`; info = `rounded-sm bg-chip-info-bg font-semibold text-chip-info-text hover:underline` (6.1:1). Export `citationPillInfoClass`. `EvidenceChips` (apps/web) passes `tone` through.

### 3.5 `NumberMarker` (new `number-marker.tsx`, exported from `index.ts`)
`NumberMarker({ n, size = 'md', className }: { n: number; size?: 'sm' | 'md'; className?: string })` → `<span aria-hidden="true" data-slot="number-marker">`: `inline-flex shrink-0 items-center justify-center rounded-full bg-amber font-semibold tabular-nums text-amber-text`, md `size-7 text-13`, sm `size-6 text-xs` (amber-text on amber 8.0:1). The list around it carries the order (`<ol>`).

### 3.6 Segmented tabs (`tabs-classes.ts`, `tabs.tsx`, `tabs-link.tsx`)
- `tabsSegmentedListClass` = `inline-flex h-9 max-w-full flex-wrap items-stretch gap-0.5 rounded-md border border-line bg-surface p-0.5` (36 px; wraps, never `overflow-x-auto`, per `packages/ui/CLAUDE.md`).
- `tabsSegmentedItemClass` = `inline-flex items-center rounded-sm px-3 text-13 font-medium whitespace-nowrap text-muted-ink transition-colors hover:bg-muted-surface hover:text-ink` + focus classes; active by `data-[state=active]` / `aria-[current=page]` / `aria-selected` → `bg-primary text-primary-foreground font-semibold hover:bg-primary-hover`.
- `TabsList variant?: 'underline' | 'segmented'` (context → `TabsTrigger`); `TabsLinkList` and `TabsLink` take `variant` explicitly (server-safe).
- Use for one page-level switch of ≤ 4 views; underline stays the default (D-08). `Segmented` (range switches) unchanged.

### 3.7 `PageHeader` (`apps/web/src/components/page-header.tsx`)
`tone?: 'default' | 'ink'`; `data-tone` on the header.
- `ink` wraps breadcrumb + title row (actions, guide, Friday trigger) in `<div data-slot="page-header-band" className="rm-ink-band rounded-lg px-5 py-5 md:px-6">`.
- `tabs` always render below the band, also in `compact`.
- Title gains `tracking-[-0.02em]` in the band only. `components/page-header-guard.ts` `countPrimaryActions` counts `default` and `ink`.

### 3.8 Gallery (dev-only)
`apps/web/src/app/dev-panel/gallery/page.tsx` (static segment beside `[...path]/route.ts`): `notFound()` when `NODE_ENV === 'production'`, else dynamic-imports `@/dev-panel/gallery` and 404s unless `requestGuardOn(host)`. `src/dev-panel/gallery.tsx` root carries `data-rm-dev-panel="gallery"` (so `check:no-dev-panel` catches a leak).

It shows every § 3 primitive under three `themeVars` wrappers: default, purple (`#7A1FA2`) and near-ink (`#102A43`, exercises the band ring), incl. `PageHeader` default vs ink, lanes and Friday bubbles (§ 3.9).

### 3.9 Friday classes (`apps/web/src/components/ask/bubble-classes.ts`, plain module)
- `userBubbleClass` = `max-w-[85%] self-end whitespace-pre-line rounded-lg rounded-br-xs bg-ink px-3.5 py-2.5 text-sm text-white [overflow-wrap:anywhere]`
- `answerBubbleClass` = `flex flex-col gap-3 rounded-lg rounded-bl-xs border border-line bg-surface px-4 py-3.5`
- `starterChipClass` = `inline-flex min-h-9 items-center rounded-md border border-line-control bg-surface px-3 py-1.5 text-left text-13 text-ink-secondary hover:bg-canvas hover:text-ink` + focus classes.

`StarterChips` gains `variant?: 'rows' | 'chips'` (default `rows`; the chat's empty state uses `chips`).

## 4. Adoption (stage B)

**Staff pages: `ink` primary** (page/form primary actions only; never inside the agency branding preview):
- `/agency`: `agency/page.tsx`.
- `/agency/alerts`: `alert-controls.tsx`.
- `/agency/approvals/[briefId]`: `review-controls.tsx`.
- `/agency/leads`: `lead-card.tsx`, plus **segmented tabs** on `leads/page.tsx`.
- `/agency/prospects`: `prospects/page.tsx`, `[clientId]/convert-button.tsx`, `snapshot-controls.tsx`.
- `/agency/settings/billing`: `payment-button.tsx`.
- `/agency/settings/slack-teams`: `webhook-controls.tsx`.
- `/agency/settings/team`: `invite-form.tsx`.
- `/agency/settings/branding`: `components/agency/branding-editor.tsx` (Save only).
- `/agency/settings/intake`: `components/agency/intake-link-card.tsx` (Save/Create link only).
- **`NumberMarker`** replaces the primary-soft step circles in `(onboarding)/onboarding/steps/done.tsx`, `(onboarding)/c/[clientId]/setup/steps/done-step.tsx` and `components/onboarding/previews/intake-next.tsx`.

**Client-facing pages: ink band** (`tone="ink"`) on the client workspace pages:
- `page.tsx` and `components/client-home-basic.tsx` (overview).
- `briefs`, `briefs/[briefId]`.
- `competitors`, `competitors/[competitorId]`.
- `rankings`, `changes`, `moves`, `reviews`, `ads`, `pricing`, `recommendations`.
- `ask/ask-screen.tsx`.
- `alerts/[alertId]`, `evidence/[evidenceId]`, `reports/[reportId]`.

Not on: `settings/*`, `help`, `pitch-snapshot` (agency prospect tool). **Segmented tabs:** `briefs/page.tsx` (TabsLinkList) and `rankings/tabs.tsx`. The primary stays `default`.

**Recommendations board** (`components/recommendation-board.tsx`, client page):
- Lanes = `<section data-lane>`, `rounded-lg p-3.5` on the fixed tints. The heading keeps "To do (n)" and adds an `aria-hidden` dot: `bg-line-strong` / `bg-chip-info-text` / `bg-success`.
- Cards are `Card variant="raised"` `p-4.5`. The rationale is `text-13 text-muted-ink`. Done cards add an `aria-hidden` `Check` (`text-success`).
- Chips are `Tag emphasis="strong"`:
  - Effort: neutral.
  - Impact: `IMPACT_TONE` (new in `lib/labels.ts`: L neutral, M warning, H danger).
  - Owner: Agency info, Client/"For you" neutral.
  - Source: neutral.
  - Upsell `Tag` unchanged.
- Evidence uses `EvidenceChips tone="info"`.
- Buttons are size default (36 px):
  - Start: `ink`.
  - Done from To do: `outline`.
  - Done from In progress: `done` + Check.
  - Back to to-do and Reopen: `outline`.
  - Dismiss trigger: `ghost`. The confirm dialog stays `destructive`.

**Friday / Ask** (`ask-chat.tsx`, `starter-chips.tsx`, `answer.tsx`, `friday-dock.tsx`):
- User turns: `userBubbleClass`.
- Answers: the avatar + badge row stays outside; content, sources and the save action sit in `answerBubbleClass`.
- Citations: info tone.
- Empty state: starter chips.
- Composer box: `rounded-lg` (border stays `border-input`, D-15). Send `size="icon"` (36 px, agency primary).
- Panel: the wide column becomes `rounded-lg border border-line bg-chrome` (drops `border-l pl-6`) with a `bg-surface` header strip. The sheet body is `bg-chrome`. The panel composer wrapper is `bg-chrome`.

## 5. Visual check

Harness `apps/web/e2e-shots` (`SHOTS_LABEL=before|after`; `.shots/index.html` pairs them), 1440 + 390:

| Label | Shows |
|---|---|
| `client-overview` | ink band, overview |
| `client-overview-ask` | band + Friday panel (xl column) |
| `client-recommendations` | board |
| `client-ask` | Friday page bubbles |
| `client-brief` | band on reading view |
| `owner-brief` | client-facing (guest) view |
| `agency-dashboard` | `ink` primary |
| `agency-leads` | segmented tabs + `ink` |
| `agency-settings-team` | `ink` primary on a form |

Gate: no new axe serious/critical vs `before`; `overflowX ≤ 1` at 390. Gallery via `pnpm dev:web` at 1440/390 → `apps/web/.shots/gallery/`.

## 6. Design-system doc amendments (stage A)

- **`04-design-decisions.md`**: new rows D-27…D-34; each amended row gains a one-line "Amended 2026-11-04 → D-n" note.
  - D-27: opt-in canvas variants and fixed tints (AS2, AS4).
  - D-28: primary tiers (AS5). Amends D-09 and P4.
  - D-29: board cards in tinted lanes with `shadow-raised` (AS6, AS12). Amends D-01 and D-06.
  - D-30: ink title band (AS8, AS15). Amends D-07.
  - D-31: segmented tabs variant. Amends D-08.
  - D-32: Friday bubbles (AS14). Amends D-14.
  - D-33: numbered markers are orange (AS3). Amends D-17.
  - D-34: `strong` chips (6 px/600) and toned `Tag` (AS9, AS11). Amends D-10 and D-18.
- **`05-design-system-specification.md`**:
  - P4: orange = Friday, priority, numbered markers; primary tiers.
  - § 2 Surfaces: chrome, on-ink.
  - § 2 Actions: ink, success-strong.
  - § 2 Approved pairs: the new pairs.
  - § 5: radius rows (xs/sm usages), elevation row `shadow.raised` (board only).
  - "Selected": segmented active = primary fill.
- **`06-component-catalog.md`**:
  - PageHeader: tone.
  - Tabs and Segmented: the segmented-tabs variant.
  - Containers: raised card, lanes.
  - Button: ink, done.
  - Status and labels: Tag tones, strong, NumberMarker.
  - Friday: bubbles, chips, chrome panel.
- **`09-ai-implementation-playbook.md`**:
  - § 1 table rows.
  - § 4.1 / 4.2 / 4.3 / 4.5 / 4.8 and § 5.2 / 5.5 recipes, as before/after classes from § 3.
- **`design-tokens.json`** + `component-examples/rm-tokens.css`: the § 2 tokens (DTCG; mirror stays equal).
- **`README.md`**:
  - Exec summary § 2 and § 5: colour roles, radii note.
  - Checklist line "orange only for Friday/priority/stars" → add "numbered markers".
- **`packages/ui/CLAUDE.md`** rules block mirrors D-27…D-34; root `CLAUDE.md` § Decisions gets one line at merge.
