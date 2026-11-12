CREATE TABLE "listed_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"start_date" date NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sources" text[] NOT NULL,
	"url" text,
	"venue" text,
	"ticketed" boolean DEFAULT false NOT NULL,
	"series" boolean DEFAULT false NOT NULL,
	"first_capture_id" uuid NOT NULL,
	"last_capture_id" uuid NOT NULL,
	"status_capture_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"status_changed_at" timestamp with time zone,
	CONSTRAINT "listed_event_key_unique" UNIQUE("competitor_id","event_key"),
	CONSTRAINT "listed_event_status_check" CHECK ("listed_event"."status" IN ('scheduled','cancelled','postponed','sold_out')),
	CONSTRAINT "listed_event_sources_check" CHECK ("listed_event"."sources" <@ ARRAY['web','meta_ads','google_panel']::text[] AND cardinality("listed_event"."sources") > 0)
);
--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "tripadvisor_id" text;--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "tripadvisor_url" text;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_first_capture_id_capture_id_fk" FOREIGN KEY ("first_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_last_capture_id_capture_id_fk" FOREIGN KEY ("last_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_status_capture_id_capture_id_fk" FOREIGN KEY ("status_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listed_event_upcoming_idx" ON "listed_event" USING btree ("competitor_id","start_date");
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON listed_event FROM app_user;
--> statement-breakpoint
ALTER TABLE listed_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listed_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY listed_event_visible ON listed_event FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
-- backfill:start
