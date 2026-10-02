REVOKE INSERT, UPDATE, DELETE ON review_revision, rank_scan FROM app_user;
--> statement-breakpoint
ALTER TABLE review_revision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE review_revision FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY review_revision_visible ON review_revision FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE rank_scan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rank_scan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rank_scan_select ON rank_scan FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
