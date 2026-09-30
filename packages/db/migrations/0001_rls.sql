GRANT USAGE ON SCHEMA public TO app_user, app_service;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, app_service;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_service;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_agency_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.agency_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_client_visible(cid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN current_setting('app.client_scope', true) = 'all' THEN true
    WHEN coalesce(current_setting('app.client_scope', true), '') = '' THEN false
    ELSE cid = ANY (string_to_array(current_setting('app.client_scope', true), ',')::uuid[])
  END
$$;
--> statement-breakpoint
ALTER TABLE agency ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_isolation ON agency FOR ALL
  USING (id = app_agency_id()) WITH CHECK (id = app_agency_id());
--> statement-breakpoint
ALTER TABLE client ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY client_isolation ON client FOR ALL
  USING (agency_id = app_agency_id() AND app_client_visible(id))
  WITH CHECK (agency_id = app_agency_id() AND app_client_visible(id));
--> statement-breakpoint
ALTER TABLE client_competitor ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client_competitor FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY client_competitor_isolation ON client_competitor FOR ALL
  USING (agency_id = app_agency_id() AND app_client_visible(client_id))
  WITH CHECK (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE competitor ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE competitor FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Global public data: app_user may only read competitors linked to a client it can see.
-- Writes to competitor go through the service role (dedupe by domain/place_id).
CREATE POLICY competitor_visible_via_link ON competitor FOR SELECT
  USING (EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = competitor.id));
