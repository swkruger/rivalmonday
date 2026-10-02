REVOKE INSERT, UPDATE, DELETE ON move, move_event FROM app_user;
--> statement-breakpoint
DROP POLICY detected_change_visible ON detected_change;
--> statement-breakpoint
CREATE POLICY detected_change_visible ON detected_change FOR SELECT
  USING (app_competitor_visible(competitor_id) AND (client_id IS NULL OR (agency_id = app_agency_id() AND app_client_visible(client_id))));
--> statement-breakpoint
DROP POLICY event_visible ON event;
--> statement-breakpoint
CREATE POLICY event_visible ON event FOR SELECT
  USING (app_competitor_visible(competitor_id) AND (client_id IS NULL OR (agency_id = app_agency_id() AND app_client_visible(client_id))));
--> statement-breakpoint
ALTER TABLE move ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE move FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY move_select ON move FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE move_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE move_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY move_event_visible ON move_event FOR SELECT
  USING (EXISTS (SELECT 1 FROM move m WHERE m.id = move_event.move_id));
