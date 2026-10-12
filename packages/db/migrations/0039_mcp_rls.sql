-- Phase 6a (P6): per-user settings for the token tables; withTenant sets them from the AccessContext.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.role', true), '')
$$;
--> statement-breakpoint
ALTER TABLE api_token ADD CONSTRAINT api_token_user_id_fk FOREIGN KEY (user_id) REFERENCES auth."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE oauth_grant_binding ADD CONSTRAINT oauth_grant_binding_user_id_fk FOREIGN KEY (user_id) REFERENCES auth."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
-- New tables inherit the default app_user grants (0001); take them all back, then grant only reads and revocation.
REVOKE ALL ON api_token, oauth_grant_binding, mcp_rate_window FROM app_user;
--> statement-breakpoint
GRANT SELECT (id, agency_id, user_id, client_id, name, token_prefix, scope, created_at, last_used_at, revoked_at) ON api_token TO app_user;
--> statement-breakpoint
GRANT UPDATE (revoked_at) ON api_token TO app_user;
--> statement-breakpoint
GRANT SELECT ON oauth_grant_binding TO app_user;
--> statement-breakpoint
GRANT UPDATE (revoked_at) ON oauth_grant_binding TO app_user;
--> statement-breakpoint
ALTER TABLE api_token ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE api_token FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY api_token_select ON api_token FOR SELECT
  USING (agency_id = app_agency_id() AND (user_id = app_user_id() OR app_role() = 'agency_admin'));
--> statement-breakpoint
CREATE POLICY api_token_revoke ON api_token FOR UPDATE
  USING (agency_id = app_agency_id() AND (user_id = app_user_id() OR app_role() = 'agency_admin'))
  WITH CHECK (agency_id = app_agency_id() AND (user_id = app_user_id() OR app_role() = 'agency_admin'));
--> statement-breakpoint
ALTER TABLE oauth_grant_binding ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE oauth_grant_binding FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY oauth_grant_binding_select ON oauth_grant_binding FOR SELECT
  USING (agency_id = app_agency_id() AND (user_id = app_user_id() OR app_role() = 'agency_admin'));
--> statement-breakpoint
CREATE POLICY oauth_grant_binding_revoke ON oauth_grant_binding FOR UPDATE
  USING (agency_id = app_agency_id() AND (user_id = app_user_id() OR app_role() = 'agency_admin'))
  WITH CHECK (agency_id = app_agency_id() AND (user_id = app_user_id() OR app_role() = 'agency_admin'));
--> statement-breakpoint
-- Service role only (token lookup by hash also uses the service role).
ALTER TABLE mcp_rate_window ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mcp_rate_window FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- d6 / P13: full-text search columns (not modelled in Drizzle).
ALTER TABLE event ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', summary)) STORED;
--> statement-breakpoint
CREATE INDEX event_search_tsv_idx ON event USING gin (search_tsv);
--> statement-breakpoint
ALTER TABLE brief_item ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', headline || ' ' || what_changed || ' ' || why_it_matters || ' ' || recommended_action)) STORED;
--> statement-breakpoint
CREATE INDEX brief_item_search_tsv_idx ON brief_item USING gin (search_tsv);
--> statement-breakpoint
ALTER TABLE recommendation ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || rationale)) STORED;
--> statement-breakpoint
CREATE INDEX recommendation_search_tsv_idx ON recommendation USING gin (search_tsv);
--> statement-breakpoint
ALTER TABLE alert ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', headline || ' ' || body)) STORED;
--> statement-breakpoint
CREATE INDEX alert_search_tsv_idx ON alert USING gin (search_tsv);
--> statement-breakpoint
ALTER TABLE review ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;
--> statement-breakpoint
CREATE INDEX review_search_tsv_idx ON review USING gin (search_tsv);
