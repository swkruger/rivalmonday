-- Phase 5a: memberships and invitations are service-role only, like contact/notification (Phase 4b decision 19).
REVOKE ALL ON membership, invitation FROM app_user;
--> statement-breakpoint
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membership FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitation FORCE ROW LEVEL SECURITY;
