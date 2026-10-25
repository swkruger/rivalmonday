CREATE TABLE "ops_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"severity" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emailed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "ops_alert_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "ops_alert_kind_check" CHECK (kind IN ('brief_readiness')),
	CONSTRAINT "ops_alert_severity_check" CHECK (severity IN ('warning','critical'))
);
--> statement-breakpoint
CREATE INDEX "notification_provider_id_idx" ON "notification" USING btree ("provider_id");--> statement-breakpoint
ALTER TABLE ops_alert ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ops_alert FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON ops_alert FROM app_user;
--> statement-breakpoint
REVOKE INSERT ON client FROM app_user;
