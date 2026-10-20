CREATE ROLE app_user LOGIN PASSWORD 'app_user';
CREATE ROLE app_service LOGIN PASSWORD 'app_service' BYPASSRLS;
-- Runtime roles (migration 0080 aborts without them). Dev-only passwords (= name). Cluster-wide and idempotent:
-- scripts/local-test-db.sh `start` runs the same blocks on existing clusters; a concurrent creator is not an error.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_worker') THEN CREATE ROLE cs_worker LOGIN PASSWORD 'cs_worker'; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_web') THEN CREATE ROLE cs_web LOGIN PASSWORD 'cs_web'; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
END $$;
CREATE DATABASE cs_test;
