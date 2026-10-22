-- Phase 7a2 (spec D16, archived = deleted for tenants): every tenant child policy goes through app_client_visible(), so an
-- archived client's alerts, briefs, recommendations, Ask threads, links etc. disappear for app_user here, in one place.
-- `client` has FORCE RLS: the archived lookup runs as the migration owner (superuser locally, BYPASSRLS on Neon), so it
-- reads the row without recursing through client_isolation. It returns only a boolean; NULL / unknown ids are "not archived".
CREATE OR REPLACE FUNCTION app_client_archived(cid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.client c WHERE c.id = cid AND c.archived_at IS NOT NULL)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_client_archived(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_client_archived(uuid) TO app_user;
--> statement-breakpoint
-- The 0001 CASE is kept unchanged; a NULL client id (agency-level rows) yields exactly what it did before.
CREATE OR REPLACE FUNCTION app_client_visible(cid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN current_setting('app.client_scope', true) = 'all' THEN true
    WHEN coalesce(current_setting('app.client_scope', true), '') = '' THEN false
    ELSE cid = ANY (string_to_array(current_setting('app.client_scope', true), ',')::uuid[])
  END AND NOT app_client_archived(cid)
$$;
