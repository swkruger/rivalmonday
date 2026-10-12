-- Phase 6b: Ask tables. Author-only RLS (not even agency admins read another user's thread through app_user).
ALTER TABLE ask_thread ADD CONSTRAINT ask_thread_user_id_fk FOREIGN KEY (user_id) REFERENCES auth."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
-- New tables inherit the default app_user/app_service grants (0001); take app_user's back, then grant only what Ask needs.
REVOKE ALL ON ask_thread, ask_message, ask_starter FROM app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON ask_thread TO app_user;
--> statement-breakpoint
GRANT UPDATE (title, updated_at) ON ask_thread TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT ON ask_message TO app_user;
--> statement-breakpoint
GRANT UPDATE (action) ON ask_message TO app_user;
--> statement-breakpoint
GRANT SELECT ON ask_starter TO app_user;
--> statement-breakpoint
ALTER TABLE ask_thread ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ask_thread FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ask_thread_owner ON ask_thread FOR ALL
  USING (agency_id = app_agency_id() AND user_id = app_user_id() AND app_client_visible(client_id))
  WITH CHECK (agency_id = app_agency_id() AND user_id = app_user_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE ask_message ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ask_message FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ask_message_owner ON ask_message FOR ALL
  USING (agency_id = app_agency_id() AND user_id = app_user_id() AND app_client_visible(client_id))
  WITH CHECK (agency_id = app_agency_id() AND user_id = app_user_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE ask_starter ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ask_starter FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ask_starter_select ON ask_starter FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
