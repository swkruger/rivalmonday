ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_isolation ON audit_log FOR ALL
  USING (agency_id = app_agency_id()) WITH CHECK (agency_id = app_agency_id());
--> statement-breakpoint
ALTER TABLE llm_call ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE llm_call FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY llm_call_isolation ON llm_call FOR ALL
  USING (agency_id = app_agency_id()) WITH CHECK (agency_id = app_agency_id());
--> statement-breakpoint
ALTER TABLE vendor_call ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vendor_call FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY vendor_call_isolation ON vendor_call FOR ALL
  USING (agency_id = app_agency_id()) WITH CHECK (agency_id = app_agency_id());
