REVOKE INSERT, UPDATE, DELETE ON intake_link, lead FROM app_user;
--> statement-breakpoint
ALTER TABLE intake_link ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE intake_link FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY intake_link_select ON intake_link FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
--> statement-breakpoint
ALTER TABLE lead ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lead FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lead_select ON lead FOR SELECT
  USING (agency_id IS NOT NULL AND agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
--> statement-breakpoint
REVOKE ALL ON intake_rate FROM app_user;
--> statement-breakpoint
ALTER TABLE intake_rate ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE intake_rate FORCE ROW LEVEL SECURITY;
