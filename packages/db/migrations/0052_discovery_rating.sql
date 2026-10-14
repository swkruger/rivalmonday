CREATE TABLE "competitor_signal" (
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"overlap" double precision,
	"activity" double precision,
	"signals" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_signal_client_id_competitor_id_pk" PRIMARY KEY("client_id","competitor_id"),
	CONSTRAINT "competitor_signal_tier_check" CHECK ("competitor_signal"."tier" IN ('top','watch','minor'))
);
--> statement-breakpoint
CREATE TABLE "discovery_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grid_size" integer,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kept" integer,
	"hidden" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "discovery_run_status_check" CHECK ("discovery_run"."status" IN ('queued','searching','checking','finalising','done','failed')),
	CONSTRAINT "discovery_run_trigger_check" CHECK ("discovery_run"."trigger" IN ('auto','manual','convert'))
);
--> statement-breakpoint
ALTER TABLE "vendor_task" ALTER COLUMN "competitor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "distance_km" double precision;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "overlap" double precision;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "activity" double precision;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "signals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "ad_matches" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_task" ADD COLUMN "suggestion_id" uuid;--> statement-breakpoint
ALTER TABLE "client_competitor" ADD COLUMN "pending_ad_matches" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor_signal" ADD CONSTRAINT "competitor_signal_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_signal" ADD CONSTRAINT "competitor_signal_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_signal" ADD CONSTRAINT "competitor_signal_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "discovery_run_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "discovery_run_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_run_agency_day_idx" ON "discovery_run" USING btree ("agency_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_run_one_live" ON "discovery_run" USING btree ("client_id") WHERE "discovery_run"."status" IN ('queued','searching','checking','finalising');--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD CONSTRAINT "competitor_suggestion_run_id_discovery_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."discovery_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_task" ADD CONSTRAINT "vendor_task_suggestion_id_competitor_suggestion_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."competitor_suggestion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD CONSTRAINT "competitor_suggestion_tier_check" CHECK ("competitor_suggestion"."tier" IN ('top','watch','minor'));--> statement-breakpoint
ALTER TABLE "vendor_task" ADD CONSTRAINT "vendor_task_subject_check" CHECK ((competitor_id IS NULL) <> (suggestion_id IS NULL));