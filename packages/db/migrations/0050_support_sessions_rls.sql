ALTER TABLE support_session ADD CONSTRAINT support_session_platform_user_id_fk FOREIGN KEY (platform_user_id) REFERENCES auth."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
REVOKE ALL ON support_session FROM app_user;
--> statement-breakpoint
ALTER TABLE support_session ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE support_session FORCE ROW LEVEL SECURITY;
