REVOKE INSERT, UPDATE, DELETE ON brief, brief_item, recommendation, playbook_override, feedback FROM app_user;
--> statement-breakpoint
ALTER TABLE brief ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE brief FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY brief_select ON brief FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE brief_item ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE brief_item FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY brief_item_select ON brief_item FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE recommendation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE recommendation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY recommendation_select ON recommendation FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE feedback FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY feedback_select ON feedback FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE playbook_override ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE playbook_override FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY playbook_override_select ON playbook_override FOR SELECT USING (agency_id = app_agency_id());
--> statement-breakpoint
-- Phase 4a decision 1: the client's time zone is AM-editable like its other profile columns (column grant, see 0026).
GRANT UPDATE (timezone) ON client TO app_user;
