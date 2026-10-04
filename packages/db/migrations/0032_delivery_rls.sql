REVOKE INSERT, UPDATE, DELETE ON contact, notification_pref, agency_webhook, notification, alert, alert_event, trend_report FROM app_user;
--> statement-breakpoint
-- Service role only (Phase 4b decision 19): contacts, preferences, webhook secrets and the outbox (AM-only text,
-- unapproved alerts) are not readable by app_user at all; Phase 5 reads them through role-checked service functions.
REVOKE SELECT ON contact, notification_pref, agency_webhook, notification FROM app_user;
--> statement-breakpoint
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contact FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_pref ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_pref FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_webhook ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_webhook FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE alert ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE alert FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY alert_select ON alert FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE alert_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE alert_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY alert_event_select ON alert_event FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
ALTER TABLE trend_report ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE trend_report FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY trend_report_select ON trend_report FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
