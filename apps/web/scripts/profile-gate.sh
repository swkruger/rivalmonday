#!/usr/bin/env bash
# Launch gate (spec 2026-11-04-launch-gate § Profiler, D5/D7): every page ≤ 8 sequential app DB stages.
#
#   bash apps/web/scripts/profile-gate.sh [--db local|neon-dev] [--seed] [--skip-build] [-- <extra profile:pages args>]
#
# Builds the production server with the E2E server env (playwright.config.ts `E2E_SERVER_ENV`), starts it with
# PROFILE_TOOLS=1 on port 3100, waits for /health, runs
#   profile:pages --params-from-seed --strict-routes --assert-db-stages 8 --json .profile/gate.json
# and stops the server. Exit code = the crawler's (0 pass, 1 an assertion failed, 2 usage/session), or 3 when the
# server never came up.
#   --db local     (default) the worktree's local test DB (TEST_* URLs in the root .env; cluster on 5444).
#   --db neon-dev  the cs_dev URLs from the root .env (APP_/SERVICE_/DATABASE_URL) instead; the seed ids are read
#                  there too, so pass the admin with PROFILE_SEED_ADMIN_EMAIL and a session with `-- --cookie FILE`.
#   --seed         (local only) re-seed the test DB exactly as E2E global setup does, and drop the stale admin
#                  storage state (the reset ends its session). Never while an E2E run uses the same test DB.
#   --skip-build   reuse the existing .next build.
# Never run alongside another server on 3100 (E2E uses it too).
set -uo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$WEB_DIR/../.." && pwd)"
PORT=3100
DB=local
SEED=0
BUILD=1
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB="${2:-}"; shift 2 ;;
    --db=*) DB="${1#--db=}"; shift ;;
    --seed) SEED=1; shift ;;
    --skip-build) BUILD=0; shift ;;
    --) shift; EXTRA=("$@"); break ;;
    *) echo "profile-gate: unknown argument $1" >&2; exit 2 ;;
  esac
done
case "$DB" in local|neon-dev) ;; *) echo "profile-gate: --db must be local or neon-dev" >&2; exit 2 ;; esac
if [ "$SEED" = 1 ] && [ "$DB" != local ]; then echo "profile-gate: --seed is local only" >&2; exit 2; fi

cd "$WEB_DIR" || exit 2

if curl -fsS -o /dev/null "http://localhost:$PORT/health" 2>/dev/null; then
  echo "profile-gate: something already serves port $PORT (an E2E run or another server); stop it first." >&2
  exit 2
fi

# The E2E server env, NUL-separated so no value is ever echoed or word-split.
export E2E_PORT=$PORT
while IFS= read -r -d '' kv; do export "$kv"; done < <(
  pnpm exec tsx -e "import('./playwright.config.ts').then(({ E2E_SERVER_ENV: e }) => { for (const [k, v] of Object.entries(e)) process.stdout.write(k + '=' + (v ?? '') + '\0'); })"
)
if [ "$DB" = neon-dev ]; then
  # Root .env values only; never printed.
  dev_url() { grep "^$1=" "$ROOT_DIR/.env" | head -n1 | cut -d= -f2-; }
  APP_DATABASE_URL="$(dev_url APP_DATABASE_URL)"
  SERVICE_DATABASE_URL="$(dev_url SERVICE_DATABASE_URL)"
  DATABASE_URL="$(dev_url DATABASE_URL)"
  export APP_DATABASE_URL SERVICE_DATABASE_URL DATABASE_URL
  export PROFILE_SEED_DATABASE_URL="$SERVICE_DATABASE_URL"
fi
for v in APP_DATABASE_URL SERVICE_DATABASE_URL DATABASE_URL; do
  case "${!v:-}" in ''|undefined) echo "profile-gate: $v is not set for --db $DB (root .env)" >&2; exit 2 ;; esac
done

if [ "$SEED" = 1 ]; then
  echo "profile-gate: seeding the test DB (E2E global setup)…"
  # The root .env first (as Playwright's config does before global setup): the test-DB URLs are read at import.
  pnpm exec tsx -e "process.loadEnvFile('../../.env'); import('./e2e/global-setup.ts').then((m) => m.default()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })" || exit 2
  rm -f test-results/admin-state.json
fi

if [ "$BUILD" = 1 ]; then
  echo "profile-gate: building…"
  # A Windows OOM (0xC0000409) needs one retry.
  pnpm build || { echo "profile-gate: build failed; retrying once"; pnpm build; } || exit 2
fi

mkdir -p .profile
rm -f .profile/tools.ndjson .profile/gate.json
echo "profile-gate: starting PROFILE_TOOLS=1 next start -p $PORT (log .profile/server.log)"
PROFILE_TOOLS=1 node node_modules/next/dist/bin/next start -p "$PORT" > .profile/server.log 2>&1 &
SERVER_PID=$!

stop_server() {
  [ -n "${SERVER_PID:-}" ] || return 0
  local win
  win="$(cat "/proc/$SERVER_PID/winpid" 2>/dev/null || true)"
  if [ -n "$win" ] && command -v taskkill >/dev/null 2>&1; then taskkill //T //F //PID "$win" >/dev/null 2>&1 || true; fi
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=
}
trap stop_server EXIT INT TERM

up=0
for _ in $(seq 1 120); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/health" 2>/dev/null; then up=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [ "$up" != 1 ]; then
  echo "profile-gate: the server did not come up; tail of .profile/server.log:" >&2
  tail -n 30 .profile/server.log >&2
  exit 3
fi

pnpm exec tsx scripts/profile-pages.ts --base "http://localhost:$PORT" --params-from-seed --strict-routes --assert-db-stages 8 --json .profile/gate.json "${EXTRA[@]}"
code=$?
stop_server
echo "profile-gate: exit $code (rows in apps/web/.profile/gate.json)"
exit $code
