DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_worker') OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cs_web') THEN
    RAISE EXCEPTION 'roles cs_worker/cs_web missing: run infra/db/init/01-roles.sql (local) or docs/DEPLOY.md § Roles (Neon) first';
  END IF;
END $$;
--> statement-breakpoint
-- A non-superuser owner (Neon) may only hand objects to a role it can SET ROLE to (PG16+); CREATEROLE gives ADMIN, not membership.
GRANT cs_worker TO CURRENT_USER;
--> statement-breakpoint
-- pg-boss runs `CREATE SCHEMA IF NOT EXISTS pgboss` on a fresh DB, which checks CREATE on the database first.
DO $$ BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO cs_worker', current_database()); END $$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS pgboss;
--> statement-breakpoint
ALTER SCHEMA pgboss OWNER TO cs_worker;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'pgboss' AND c.relkind IN ('r','p','v','m','S')
              AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a','i'))) LOOP
    EXECUTE format('ALTER %s pgboss.%I OWNER TO cs_worker',
      CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.relname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'pgboss' LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO cs_worker', r.sig);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'pgboss' AND t.typtype IN ('e','d') LOOP
    EXECUTE format('ALTER TYPE pgboss.%I OWNER TO cs_worker', r.typname);
  END LOOP;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA pgboss TO cs_web;
--> statement-breakpoint
-- cs_web needs exactly: version (start), queue (send), job (send + status). Queries go through the partitioned parent,
-- so per-queue partitions need no grant. Absent on a fresh DB: the worker's ensureQueueGrants() grants them after boss.start().
DO $$ BEGIN
  IF to_regclass('pgboss.version') IS NOT NULL THEN GRANT SELECT ON pgboss.version, pgboss.queue TO cs_web; END IF;
  IF to_regclass('pgboss.job') IS NOT NULL THEN GRANT SELECT, INSERT ON pgboss.job TO cs_web; END IF;
END $$;
-- no grants on schema public for either role
