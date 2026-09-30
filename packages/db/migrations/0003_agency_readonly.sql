DROP POLICY agency_isolation ON agency;
--> statement-breakpoint
CREATE POLICY agency_isolation ON agency FOR SELECT USING (id = app_agency_id());
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON agency FROM app_user;
