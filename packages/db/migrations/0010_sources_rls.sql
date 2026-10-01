REVOKE INSERT, UPDATE, DELETE ON competitor_source, vendor_task, observation, review, ad, rank_snapshot FROM app_user;
--> statement-breakpoint
REVOKE INSERT, DELETE ON competitor_suggestion FROM app_user;
--> statement-breakpoint
ALTER TABLE competitor_source ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE competitor_source FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vendor_task ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE vendor_task FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE observation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE observation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY observation_visible ON observation FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE review ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE review FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY review_visible ON review FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE ad ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ad FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ad_visible ON ad FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE competitor_suggestion ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE competitor_suggestion FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY competitor_suggestion_select ON competitor_suggestion FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
CREATE POLICY competitor_suggestion_update ON competitor_suggestion FOR UPDATE
  USING (agency_id = app_agency_id() AND app_client_visible(client_id))
  WITH CHECK (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE rank_snapshot ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rank_snapshot FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rank_snapshot_select ON rank_snapshot FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
