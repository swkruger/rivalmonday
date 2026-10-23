CREATE TABLE "spend_guard_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"agency_id" uuid,
	"client_id" uuid,
	"month" date,
	"scope" text,
	"observed_usd" numeric(14, 6),
	"baseline_usd" numeric(14, 6),
	"limit_usd" numeric(10, 2),
	"actor" text DEFAULT 'system' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_guard_event_kind_check" CHECK (kind IN ('client_reached','client_paused','client_unpaused','spike_warn','spike_paused','spike_reset')),
	CONSTRAINT "spend_guard_event_scope_check" CHECK (scope IN ('total','openrouter','anthropic')),
	CONSTRAINT "spend_guard_event_note_check" CHECK (length(note) <= 200)
);
--> statement-breakpoint
ALTER TABLE "llm_call" ADD COLUMN "competitor_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_call" ADD COLUMN "competitor_id" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "spend_limit_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "spend_paused_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "spend_guard_event_client_once" ON "spend_guard_event" USING btree ("client_id","kind","month") WHERE kind IN ('client_reached','client_paused');--> statement-breakpoint
CREATE INDEX "spend_guard_event_created_idx" ON "spend_guard_event" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_call_created_idx" ON "llm_call" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_call_competitor_created_idx" ON "llm_call" USING btree ("competitor_id","created_at") WHERE competitor_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "vendor_call_competitor_created_idx" ON "vendor_call" USING btree ("competitor_id","created_at") WHERE competitor_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_spend_limit_check" CHECK (spend_limit_usd > 0 AND spend_limit_usd <= 10000);--> statement-breakpoint
ALTER TABLE "client" DROP CONSTRAINT "client_monthly_cap_check";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "monthly_cap_usd";;--> statement-breakpoint
ALTER TABLE "spend_guard_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spend_guard_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "spend_guard_event" FROM app_user;--> statement-breakpoint
INSERT INTO platform_setting (key, value, updated_by) VALUES ('spend_guard_settings', '{}', 'migration'),
  ('ai_guard_state', '{"state":"ok"}', 'migration') ON CONFLICT DO NOTHING;
