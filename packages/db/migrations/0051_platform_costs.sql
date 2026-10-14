CREATE TABLE "platform_cost_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"amount_usd" numeric(12, 2) NOT NULL,
	"period" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"billing_url" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "platform_cost_item_name_check" CHECK (length("platform_cost_item"."name") between 1 and 80),
	CONSTRAINT "platform_cost_item_kind_check" CHECK ("platform_cost_item"."kind" in ('recurring','one_off')),
	CONSTRAINT "platform_cost_item_amount_check" CHECK ("platform_cost_item"."amount_usd" >= 0),
	CONSTRAINT "platform_cost_item_period_check" CHECK ("platform_cost_item"."period" in ('monthly','yearly')),
	CONSTRAINT "platform_cost_item_billing_url_check" CHECK (length("platform_cost_item"."billing_url") <= 500),
	CONSTRAINT "platform_cost_item_notes_check" CHECK (length("platform_cost_item"."notes") <= 500),
	CONSTRAINT "platform_cost_item_period_ck" CHECK (("platform_cost_item"."kind" = 'recurring') = ("platform_cost_item"."period" is not null)),
	CONSTRAINT "platform_cost_item_oneoff_ck" CHECK ("platform_cost_item"."kind" = 'recurring' or "platform_cost_item"."ends_on" is null),
	CONSTRAINT "platform_cost_item_dates_ck" CHECK ("platform_cost_item"."ends_on" is null or "platform_cost_item"."ends_on" >= "platform_cost_item"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "platform_cost_service" (
	"service" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"billing_url" text,
	"low_threshold_usd" numeric(12, 2),
	"warn_days" integer DEFAULT 7 NOT NULL,
	"unit_rate_usd" numeric(14, 8),
	"alerted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "platform_cost_service_service_check" CHECK ("platform_cost_service"."service" in ('openrouter','dataforseo','scrapecreators','apify','anthropic','neon')),
	CONSTRAINT "platform_cost_service_warn_days_check" CHECK ("platform_cost_service"."warn_days" between 0 and 90)
);
--> statement-breakpoint
CREATE TABLE "platform_cost_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"kind" text NOT NULL,
	"amount_usd" numeric(14, 4),
	"units" numeric(20, 4),
	"cap_usd" numeric(14, 4),
	"error" text,
	CONSTRAINT "platform_cost_snapshot_status_check" CHECK ("platform_cost_snapshot"."status" in ('ok','error','unavailable')),
	CONSTRAINT "platform_cost_snapshot_kind_check" CHECK ("platform_cost_snapshot"."kind" in ('balance','usage')),
	CONSTRAINT "platform_cost_snapshot_error_check" CHECK (length("platform_cost_snapshot"."error") <= 120)
);
--> statement-breakpoint
ALTER TABLE "platform_cost_snapshot" ADD CONSTRAINT "platform_cost_snapshot_service_platform_cost_service_service_fk" FOREIGN KEY ("service") REFERENCES "public"."platform_cost_service"("service") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_cost_snapshot_service_taken_idx" ON "platform_cost_snapshot" USING btree ("service","taken_at" DESC);
--> statement-breakpoint
REVOKE ALL ON platform_cost_service, platform_cost_snapshot, platform_cost_item FROM app_user;
--> statement-breakpoint
ALTER TABLE platform_cost_service ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_cost_service FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_cost_snapshot ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_cost_snapshot FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_cost_item ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_cost_item FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
INSERT INTO platform_cost_service (service, billing_url) VALUES
  ('openrouter','https://openrouter.ai/settings/credits'),
  ('dataforseo','https://app.dataforseo.com/billing'),
  ('scrapecreators','https://app.scrapecreators.com'),
  ('apify','https://console.apify.com/billing'),
  ('anthropic','https://platform.claude.com/settings/billing'),
  ('neon','https://console.neon.tech/app/billing');
