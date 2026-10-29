#!/usr/bin/env bash
# Design-system detection counts: docs/design-system/09-ai-implementation-playbook.md section 8 plus arbitrary px text sizes.
# Prints "label: N" (matching lines) per check and "total: N". STRICT BY DEFAULT: exit 1 if total > 0.
# `--report` prints the counts and always exits 0. Exit 2 if git grep itself fails. Not in CI (spec D17).
# Uses `git grep -P` (same patterns as the section 8 `rg` lines; ripgrep is not on the Git Bash PATH here). Tracked + untracked files.
set -u
cd "$(dirname "$0")/.."
REPORT=0
[ "${1:-}" = "--report" ] && REPORT=1

# ---- Allowlist (decision P6). One ALLOW_<LABEL> array per check; exclude a file only from the check it legitimately hits.
# Every entry needs a `# reason` line above it. Adding an entry without a reason is a review blocker.
ALLOW_HEX=(
  # Chart colour scales are validated data-viz palettes (dataviz skill), not UI chrome.
  ':(exclude,glob)**/charts/change-grid.tsx'
  ':(exclude,glob)**/charts/geo-grid.tsx'
  ':(exclude,glob)**/charts/topic-heatmap.tsx'
  # Agency brand swatch palette + "#47A8E7" placeholder: data shown to the user, not styling.
  ':(exclude,glob)apps/web/src/app/(onboarding)/onboarding/steps/brand.tsx'
  # Mock map tile fills in the onboarding preview: stands in for an external map artefact.
  ':(exclude,glob)apps/web/src/components/onboarding/previews/listing-map.tsx'
  # Native colour-picker fallback (#000000) and "#47A8E7" placeholder: input data, not styling.
  ':(exclude,glob)apps/web/src/components/agency/branding-editor.tsx'
  # DEFAULT_BUTTON_COLOR is written into inline HTML the agency pastes elsewhere; tokens do not exist there.
  ':(exclude,glob)apps/web/src/components/agency/intake-link-card.tsx'
  # Dev-only panel, never shipped to users.
  ':(exclude,glob)apps/web/src/dev-panel/**'
)
ALLOW_AMBER=(
  # Friday / assistant identity is the orange pill (brand decision): --amber is its token, not a status colour.
  ':(exclude,glob)packages/ui/src/components/friday-badge.tsx'
  ':(exclude,glob)apps/web/src/components/ask/friday-dock-trigger.tsx'
  # Nav "Ask {assistant}" pill is the Friday pill.
  ':(exclude,glob)apps/web/src/components/shell/nav-link.tsx'
  # "Ask" link on the evidence page is the Friday pill.
  ':(exclude,glob)apps/web/src/app/(app)/c/[[]clientId]/evidence/[[]evidenceId]/page.tsx'
  # BAR priority scale (low/elevated/high): amber is the mid step of a bar, not a status chip.
  ':(exclude,glob)apps/web/src/app/(app)/c/[[]clientId]/page.tsx'
  # Friday identity is the orange pill (brand decision).
  ':(exclude,glob)apps/site/src/components/**/friday-*.tsx'
  # Pilot pill: the screen's one orange highlight, spec § 7.8.
  ':(exclude,glob)apps/site/src/components/home/pilot-pill.tsx'
)

NOTEST=':(exclude,glob)**/*.test.*'
total=0

count() { # label, pattern, pathspecs...
  local label="$1" pattern="$2" n out rc errf
  shift 2
  errf=$(mktemp)
  out=$(git grep -P -h --untracked -e "$pattern" -- "$@" "$NOTEST" 2>"$errf")
  rc=$?
  if [ "$rc" -ge 2 ]; then echo "design-lint: git grep failed for '$label' (exit $rc): $(cat "$errf")" >&2; rm -f "$errf"; exit 2; fi
  rm -f "$errf"
  if [ -z "$out" ]; then n=0; else n=$(printf '%s\n' "$out" | wc -l | tr -d ' '); fi
  echo "$label: $n"
  total=$((total + n))
}

WEB=apps/web/src
UI=packages/ui/src
SITE=apps/site/src
count shadow-card 'shadow-card' $WEB $UI $SITE
count radius-14-2xl-xl 'rounded-\[14px\]|rounded-2xl|rounded-xl' $WEB $UI $SITE
count off-scale-text-25-39 'text-\[(2[5-9]|3\d)px\]' $WEB
count font-extrabold 'font-extrabold' $WEB $UI $SITE ':(exclude,glob)**/wordmark.tsx'
count uppercase-tracking 'uppercase tracking' $WEB
count focus-ring-legacy 'ring-ring/50|ring-\[3px\]' $WEB $UI
count hex-literals-tsx '#[0-9A-Fa-f]{6}\b' ":(glob)$WEB/**/*.tsx" ":(glob)$SITE/**/*.tsx" "${ALLOW_HEX[@]}"
count bg-amber 'bg-amber' $WEB $UI $SITE "${ALLOW_AMBER[@]}"
count shadow-sm-md-lg-xl 'shadow-(sm|md|lg|xl)\b' $WEB $UI $SITE
count badge-usage '<Badge\b' $WEB ':(exclude)apps/web/src/lib/page-gates.ts'
count text-px-arbitrary 'text-\[[0-9]+px\]' $WEB $UI $SITE

echo "total: $total"
if [ "$REPORT" = 0 ] && [ "$total" -gt 0 ]; then exit 1; fi
exit 0
