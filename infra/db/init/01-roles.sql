-- Local/CI/compose roles and cs_test. Dev-only passwords (= name). Idempotent and safe under `psql -v ON_ERROR_STOP=1`:
-- re-run it on an existing volume/cluster (migration 0080 aborts until cs_worker/cs_web exist). Roles are cluster-wide;
-- scripts/local-test-db.sh `start` runs these DO blocks too, and a concurrent creator is not an error.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user LOGIN PASSWORD 'app_user'; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN CREATE ROLE app_service LOGIN PASSWORD 'app_service' BYPASSRLS; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;
-- Runtime roles (spec D9, migration 0080).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_worker') THEN CREATE ROLE cs_worker LOGIN PASSWORD 'cs_worker'; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_web') THEN CREATE ROLE cs_web LOGIN PASSWORD 'cs_web'; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;
-- CREATE DATABASE cannot run inside a DO block.
SELECT 'CREATE DATABASE cs_test' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'cs_test') \gexec
