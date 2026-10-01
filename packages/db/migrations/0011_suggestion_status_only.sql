REVOKE UPDATE ON competitor_suggestion FROM app_user;
--> statement-breakpoint
GRANT UPDATE (status) ON competitor_suggestion TO app_user;
--> statement-breakpoint
ALTER TABLE competitor_suggestion ADD CONSTRAINT competitor_suggestion_status_check CHECK (status IN ('suggested', 'accepted', 'dismissed'));
