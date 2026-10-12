-- Phase 6b: per-client Ask quota usage. ask_message RLS is author-only, so an app_user count would only see the caller's
-- own questions; the quota is per client (all users). This SECURITY DEFINER function returns ONLY a count, and only for a
-- client in the caller's agency and visible scope. Callers never receive rows, content or other users' ids.
CREATE OR REPLACE FUNCTION ask_quota_used(p_client_id uuid, p_since timestamptz) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*)::integer FROM ask_message m
  WHERE m.client_id = p_client_id AND m.agency_id = app_agency_id() AND app_client_visible(p_client_id)
    AND m.counts_toward_quota AND m.created_at >= p_since
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ask_quota_used(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ask_quota_used(uuid, timestamptz) TO app_user;
