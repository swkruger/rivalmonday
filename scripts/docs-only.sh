#!/usr/bin/env bash
# Exits 0 when every file changed between <base> and <head> (default HEAD) is docs-only, 1 otherwise.
# Used by CI (.github/workflows/ci.yml `changes` job) and /rm-merge to skip tests for docs-only changes.
# Usage: bash scripts/docs-only.sh <base> [<head>]   (diffs <base>...<head>, i.e. from their merge base)
#
# Docs-only = all of: anything under docs/ EXCEPT docs/help/** (seeded into the app by kb:seed, checked by the page
# gate) and docs/copy/** (copy sign-off ledger, read by tests); anything under .claude/; any CLAUDE.md or AGENTS.md;
# any other *.md outside apps/ and packages/ (Markdown there can be site content or checked by tests).
# An unknown base, an empty diff or a git error counts as code (run everything).
set -u
base="${1:-}"
head="${2:-HEAD}"
[ -n "$base" ] || exit 1
git cat-file -e "${base}^{commit}" 2>/dev/null || exit 1
files="$(git diff --name-only "${base}...${head}" 2>/dev/null)" || exit 1
[ -n "$files" ] || exit 1
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    docs/help/*|docs/copy/*) exit 1 ;;
    docs/*|.claude/*) ;;
    CLAUDE.md|AGENTS.md|*/CLAUDE.md|*/AGENTS.md) ;;
    apps/*|packages/*) exit 1 ;;
    *.md) ;;
    *) exit 1 ;;
  esac
done <<EOF
$files
EOF
exit 0
