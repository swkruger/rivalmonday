-- Phase 7a2: archival, plan feature flags, `skipped` outbox status, ledger/audit rows that outlive a purge.
ALTER TABLE agency ADD COLUMN archived_at timestamptz;
--> statement-breakpoint
ALTER TABLE client ADD COLUMN archived_at timestamptz;
--> statement-breakpoint
ALTER TABLE plan ADD COLUMN features jsonb NOT NULL DEFAULT '["ask","mcp"]'::jsonb;
--> statement-breakpoint
ALTER TABLE plan ADD CONSTRAINT plan_features_check CHECK (jsonb_typeof(features) = 'array' AND features <@ '["ask","mcp"]'::jsonb);
--> statement-breakpoint
ALTER TABLE notification DROP CONSTRAINT notification_status_check;
--> statement-breakpoint
ALTER TABLE notification ADD CONSTRAINT notification_status_check CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped'));
--> statement-breakpoint
ALTER TABLE audit_log DROP CONSTRAINT audit_log_agency_id_agency_id_fk;
--> statement-breakpoint
ALTER TABLE llm_call DROP CONSTRAINT llm_call_agency_id_agency_id_fk;
--> statement-breakpoint
ALTER TABLE llm_call DROP CONSTRAINT llm_call_client_id_client_id_fk;
--> statement-breakpoint
ALTER TABLE vendor_call DROP CONSTRAINT vendor_call_agency_id_agency_id_fk;
--> statement-breakpoint
ALTER TABLE vendor_call DROP CONSTRAINT vendor_call_client_id_client_id_fk;
--> statement-breakpoint
DROP POLICY client_isolation ON client;
--> statement-breakpoint
CREATE POLICY client_isolation ON client FOR ALL
  USING (agency_id = app_agency_id() AND app_client_visible(id) AND archived_at IS NULL)
  WITH CHECK (agency_id = app_agency_id() AND app_client_visible(id));
