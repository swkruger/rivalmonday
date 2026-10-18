REVOKE INSERT, UPDATE, DELETE ON client_setup FROM app_user;
--> statement-breakpoint
ALTER TABLE client_setup ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client_setup FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY client_setup_select ON client_setup FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
