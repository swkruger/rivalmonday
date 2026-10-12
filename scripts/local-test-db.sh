#!/usr/bin/env bash
# Local PostgreSQL 18 + pgvector cluster for tests (Windows, Git Bash). Neon round trips cost ~50 ms per query; a
# local cluster makes the unit suite and E2E several times faster. Only `cs_test` lives here — cs_dev/cs_demo stay
# on Neon. Throwaway data: fsync is off.
#
#   bash scripts/local-test-db.sh setup    # once: copy PG18 binaries, build pgvector, initdb, roles, cs_test
#   bash scripts/local-test-db.sh start    # after a reboot
#   bash scripts/local-test-db.sh stop | status | env
#
# Needs: PostgreSQL 18 installed (server binaries), VS 2022 Build Tools (C++), git. No admin rights: everything
# lives under $RM_PG_DIR.
set -euo pipefail

RM_PG_DIR="${RM_PG_DIR:-/d/rm-pg}"
PG_SRC="${PG_SRC:-/d/Program Files/PostgreSQL/18}"
PGVECTOR_TAG="${PGVECTOR_TAG:-v0.8.1}" # first release with PostgreSQL 18 support
PORT="${RM_PG_PORT:-5444}"
VCVARS="${VCVARS:-C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat}"
BIN="$RM_PG_DIR/pg18/bin"
DATA="$RM_PG_DIR/data"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
winpath() { cygpath -w "$1"; }

psql_su() { PGPASSWORD=postgres "$BIN/psql.exe" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

case "${1:-}" in
  setup)
    [ -d "$DATA" ] && { echo "Already set up at $RM_PG_DIR (run 'start')."; exit 0; }
    mkdir -p "$RM_PG_DIR/pg18"
    echo "Copying PostgreSQL binaries from $PG_SRC …"
    cp -r "$PG_SRC/bin" "$PG_SRC/lib" "$PG_SRC/share" "$PG_SRC/include" "$RM_PG_DIR/pg18/"
    echo "Building pgvector $PGVECTOR_TAG …"
    rm -rf "$RM_PG_DIR/src/pgvector"
    git -c advice.detachedHead=false clone -q --depth 1 --branch "$PGVECTOR_TAG" https://github.com/pgvector/pgvector.git "$RM_PG_DIR/src/pgvector"
    cat > "$RM_PG_DIR/build-pgvector.bat" <<EOF
@echo off
call "$VCVARS" >nul
set "PGROOT=$(winpath "$RM_PG_DIR/pg18")"
cd /d $(winpath "$RM_PG_DIR/src/pgvector")
nmake /NOLOGO /F Makefile.win || exit /b 1
nmake /NOLOGO /F Makefile.win install
EOF
    cmd //c "$(winpath "$RM_PG_DIR/build-pgvector.bat")" >"$RM_PG_DIR/build-pgvector.log" 2>&1 || { echo "pgvector build failed — see $RM_PG_DIR/build-pgvector.log"; exit 1; }
    echo "Creating the cluster on 127.0.0.1:$PORT …"
    printf 'postgres\n' >"$RM_PG_DIR/pw.txt"
    "$BIN/initdb.exe" -D "$DATA" -U postgres --pwfile="$RM_PG_DIR/pw.txt" -A scram-sha-256 -E UTF8 --locale=C >"$RM_PG_DIR/initdb.log"
    rm "$RM_PG_DIR/pw.txt"
    cat >>"$DATA/postgresql.conf" <<EOF
# Rival Monday local test cluster
port = $PORT
listen_addresses = '127.0.0.1'
max_connections = 200
fsync = off
synchronous_commit = off
full_page_writes = off
EOF
    "$BIN/pg_ctl.exe" -D "$DATA" -l "$RM_PG_DIR/server.log" -w start >/dev/null
    psql_su -f "$REPO/infra/db/init/01-roles.sql" # same roles and cs_test as CI
    echo "Done. Point the three TEST_* URLs in .env at it:"; "$0" env
    ;;
  start) "$BIN/pg_ctl.exe" -D "$DATA" -l "$RM_PG_DIR/server.log" -w start ;;
  stop) "$BIN/pg_ctl.exe" -D "$DATA" -w stop ;;
  status) "$BIN/pg_ctl.exe" -D "$DATA" status ;;
  env)
    echo "TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:$PORT/cs_test"
    echo "TEST_APP_DATABASE_URL=postgres://app_user:app_user@127.0.0.1:$PORT/cs_test"
    echo "TEST_SERVICE_DATABASE_URL=postgres://app_service:app_service@127.0.0.1:$PORT/cs_test"
    ;;
  *) echo "usage: $0 setup|start|stop|status|env"; exit 2 ;;
esac
