#!/usr/bin/env bash
# Design-system detection counts: docs/design-system/09-ai-implementation-playbook.md section 8 plus arbitrary px text sizes.
# Prints "label: N" (matching lines) per check and "total: N". Exit 0 unless --strict and total > 0; --report always exits 0; exit 2 if git grep itself fails. Not in CI (spec D17).
# Uses `git grep -P` (same patterns as the section 8 `rg` lines; ripgrep is not on the Git Bash PATH here). Tracked files only.
set -u
cd "$(dirname "$0")/.."
STRICT=0
REPORT=0
[ "${1:-}" = "--strict" ] && STRICT=1
[ "${1:-}" = "--report" ] && REPORT=1

NOTEST=':(exclude,glob)**/*.test.*'
total=0

count() { # label, pattern, pathspecs...
  local label="$1" pattern="$2" n
  shift 2
  local out rc
  out=$(git grep -P -h --untracked -e "$pattern" -- "$@" "$NOTEST" 2>&1)
  rc=$?
  if [ "$rc" -ge 2 ]; then echo "design-lint: git grep failed for '$label' (exit $rc): $out" >&2; exit 2; fi
  if [ -z "$out" ]; then n=0; else n=$(printf '%s
' "$out" | wc -l | tr -d ' '); fi
  echo "$label: $n"
  total=$((total + n))
}

WEB=apps/web/src
UI=packages/ui/src
count shadow-card 'shadow-card' $WEB $UI
count radius-14-2xl-xl 'rounded-\[14px\]|rounded-2xl|rounded-xl' $WEB $UI
count off-scale-text-25-39 'text-\[(2[5-9]|3\d)px\]' $WEB
count font-extrabold 'font-extrabold' $WEB $UI ':(exclude,glob)**/wordmark.tsx'
count uppercase-tracking 'uppercase tracking' $WEB
count focus-ring-legacy 'ring-ring/50|ring-\[3px\]' $WEB $UI
count hex-literals-tsx '#[0-9A-Fa-f]{6}\b' ":(glob)$WEB/**/*.tsx" ':(exclude,glob)**/charts/change-grid.tsx' ':(exclude,glob)**/charts/geo-grid.tsx' ':(exclude,glob)**/charts/topic-heatmap.tsx'
count bg-amber 'bg-amber' $WEB
count shadow-sm-md-lg-xl 'shadow-(sm|md|lg|xl)\b' $WEB $UI
count badge-usage '<Badge\b' $WEB ':(exclude)apps/web/src/lib/page-gates.ts'
count text-px-arbitrary 'text-\[[0-9]+px\]' $WEB $UI

echo "total: $total"
if [ "$REPORT" = 0 ] && [ "$STRICT" = 1 ] && [ "$total" -gt 0 ]; then exit 1; fi
exit 0
