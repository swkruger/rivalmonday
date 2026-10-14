REVOKE INSERT, UPDATE, DELETE ON discovery_run, competitor_signal FROM app_user;
--> statement-breakpoint
ALTER TABLE discovery_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE discovery_run FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY discovery_run_select ON discovery_run FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE competitor_signal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE competitor_signal FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY competitor_signal_select ON competitor_signal FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
REVOKE UPDATE ON client_competitor FROM app_user;
