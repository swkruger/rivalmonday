-- Phase 13a1: agency_domain / agency_sending_domain are read-only for app_user (agency admins and account managers of
-- the agency); every write runs on the service connection inside tools (plan Appendix A § 0112, pattern 0066).
REVOKE ALL ON agency_domain, agency_sending_domain FROM app_user;
--> statement-breakpoint
GRANT SELECT ON agency_domain, agency_sending_domain TO app_user;
--> statement-breakpoint
ALTER TABLE agency_domain ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_domain FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_domain_read ON agency_domain FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
--> statement-breakpoint
ALTER TABLE agency_sending_domain ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_sending_domain FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_sending_domain_read ON agency_sending_domain FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
