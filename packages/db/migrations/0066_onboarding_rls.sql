-- Phase 10: onboarding tables. pending_signup is service-role only (forced RLS, no policy, nothing for app_user).
-- agency_profile: admins/account managers read, admins write. agency_onboarding: read-only for app_user; writes run on
-- the service connection inside tools. app_service gets privileges from 0001_rls.sql default privileges (no GRANT needed).
REVOKE ALL ON pending_signup FROM app_user;
--> statement-breakpoint
ALTER TABLE pending_signup ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pending_signup FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON agency_profile, agency_onboarding FROM app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON agency_profile TO app_user;
--> statement-breakpoint
GRANT SELECT ON agency_onboarding TO app_user;
--> statement-breakpoint
ALTER TABLE agency_profile ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_profile FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_profile_read ON agency_profile FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
--> statement-breakpoint
CREATE POLICY agency_profile_insert ON agency_profile FOR INSERT
  WITH CHECK (agency_id = app_agency_id() AND app_role() = 'agency_admin');
--> statement-breakpoint
CREATE POLICY agency_profile_update ON agency_profile FOR UPDATE
  USING (agency_id = app_agency_id() AND app_role() = 'agency_admin')
  WITH CHECK (agency_id = app_agency_id() AND app_role() = 'agency_admin');
--> statement-breakpoint
ALTER TABLE agency_onboarding ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_onboarding FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY agency_onboarding_read ON agency_onboarding FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
--> statement-breakpoint
INSERT INTO agency_onboarding (agency_id, source, completed_at) SELECT id, 'legacy', now() FROM agency
ON CONFLICT (agency_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO agency_profile (agency_id) SELECT id FROM agency ON CONFLICT (agency_id) DO NOTHING;
