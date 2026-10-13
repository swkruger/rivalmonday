ALTER TABLE platform_admin ADD CONSTRAINT platform_admin_user_id_fk FOREIGN KEY (user_id) REFERENCES auth."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON platform_admin, agency_daily_stat, platform_audit_log FROM app_user;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON platform_audit_log FROM app_service;
--> statement-breakpoint
ALTER TABLE platform_admin ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_admin FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_daily_stat ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_daily_stat FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_audit_log FORCE ROW LEVEL SECURITY;
