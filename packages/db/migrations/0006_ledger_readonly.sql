REVOKE INSERT, UPDATE, DELETE ON audit_log, llm_call, vendor_call FROM app_user;
--> statement-breakpoint
DROP POLICY audit_log_isolation ON audit_log;
--> statement-breakpoint
CREATE POLICY audit_log_isolation ON audit_log FOR SELECT
  USING (agency_id = app_agency_id() AND current_setting('app.client_scope', true) = 'all');
--> statement-breakpoint
DROP POLICY llm_call_isolation ON llm_call;
--> statement-breakpoint
CREATE POLICY llm_call_isolation ON llm_call FOR SELECT
  USING (
    agency_id = app_agency_id()
    AND (
      current_setting('app.client_scope', true) = 'all'
      OR (client_id IS NOT NULL AND app_client_visible(client_id))
    )
  );
--> statement-breakpoint
DROP POLICY vendor_call_isolation ON vendor_call;
--> statement-breakpoint
CREATE POLICY vendor_call_isolation ON vendor_call FOR SELECT
  USING (
    agency_id = app_agency_id()
    AND (
      current_setting('app.client_scope', true) = 'all'
      OR (client_id IS NOT NULL AND app_client_visible(client_id))
    )
  );
