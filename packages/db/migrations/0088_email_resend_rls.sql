-- Phase 15c-2a (B4): email_resend is service-role only, as pending_signup (0066): forced RLS, no policy, nothing for
-- app_user. app_service gets privileges from 0001_rls.sql default privileges (no GRANT needed).
REVOKE ALL ON email_resend FROM app_user;
--> statement-breakpoint
ALTER TABLE email_resend ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE email_resend FORCE ROW LEVEL SECURITY;
