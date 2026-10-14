-- Phase 9a: billing tables are service-role only (forced RLS, no policy, nothing for app_user).
-- The service role is app_service; 0001_rls.sql default privileges already grant it SELECT/INSERT/UPDATE/DELETE
-- on new public tables, so no GRANT is needed. agency_daily_stat's three columns come from 0052.
ALTER TABLE plan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE plan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_billing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_billing FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_billing_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_billing_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stripe_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stripe_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE discount_code ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE discount_code FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_invite_link ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agency_invite_link FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_notice ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE billing_notice FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON plan, agency_billing, agency_billing_event, stripe_event, discount_code, agency_invite_link, billing_notice FROM app_user;
--> statement-breakpoint
INSERT INTO plan (code, version, name, base_price_cents, included_seats, seat_price_cents, trial_days, is_current, created_by)
VALUES ('standard', 1, 'Standard', 22900, 3, 9900, 30, true, 'migration');
--> statement-breakpoint
INSERT INTO agency_billing (agency_id, state, plan_id)
SELECT a.id, 'pilot', (SELECT id FROM plan WHERE code = 'standard' AND version = 1) FROM agency a
ON CONFLICT (agency_id) DO NOTHING;
