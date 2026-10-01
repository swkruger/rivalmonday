REVOKE INSERT, UPDATE, DELETE ON stage_run, capture_block, volatile_block, detected_change, event, event_change, event_score, decision_review FROM app_user;
--> statement-breakpoint
ALTER TABLE stage_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stage_run FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE volatile_block ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE volatile_block FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_review ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_review FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE capture_block ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE capture_block FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY capture_block_visible ON capture_block FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE detected_change ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE detected_change FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY detected_change_visible ON detected_change FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY event_visible ON event FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE event_change ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE event_change FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY event_change_visible ON event_change FOR SELECT
  USING (EXISTS (SELECT 1 FROM event e WHERE e.id = event_change.event_id));
--> statement-breakpoint
ALTER TABLE event_score ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE event_score FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY event_score_select ON event_score FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
