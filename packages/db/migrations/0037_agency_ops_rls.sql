-- 5b-2: prospect reports are written by the worker/service role only; tenants read their own through RLS (same as trend_report, 0032).
REVOKE INSERT, UPDATE, DELETE ON prospect_report FROM app_user;
--> statement-breakpoint
ALTER TABLE prospect_report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prospect_report FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY prospect_report_select ON prospect_report FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
