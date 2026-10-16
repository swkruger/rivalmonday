-- Phase 9b: Connect tables are service-role only (forced RLS, no policy, nothing for app_user).
-- app_service gets privileges from 0001_rls.sql default privileges, so no GRANT is needed.
ALTER TABLE agency_connect ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_connect FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client_billing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client_billing FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stripe_connect_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stripe_connect_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_setting ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_setting FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON agency_connect, client_billing, stripe_connect_event, platform_setting FROM app_user;
--> statement-breakpoint
INSERT INTO platform_setting (key, value, updated_by) VALUES ('connect_application_fee_percent', '0'::jsonb, 'migration');
