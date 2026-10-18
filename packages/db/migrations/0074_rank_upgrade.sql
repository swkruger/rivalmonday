UPDATE rank_scan SET status = 'failed', finished_at = COALESCE(finished_at, now()) WHERE status = 'running' AND started_at < now() - interval '3 hours';
--> statement-breakpoint
CREATE TABLE "rank_map_image" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"settings_hash" text NOT NULL,
	"object_key" text NOT NULL,
	"bounds" jsonb NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rank_scan" ADD COLUMN "trigger" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_scan" ADD COLUMN "requested_by" uuid;--> statement-breakpoint
ALTER TABLE "rank_scan" ADD COLUMN "grid_size" smallint;--> statement-breakpoint
ALTER TABLE "rank_scan" ADD COLUMN "radius_km" double precision;--> statement-breakpoint
ALTER TABLE "rank_scan" ADD COLUMN "keywords" jsonb;--> statement-breakpoint
ALTER TABLE "rank_scan" ADD COLUMN "estimated_usd" double precision;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "rank_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "rank_grid_size" smallint DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_map_image" ADD CONSTRAINT "rank_map_image_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_map_image" ADD CONSTRAINT "rank_map_image_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_scan_running_unique" ON "rank_scan" USING btree ("client_id") WHERE status = 'running';--> statement-breakpoint
ALTER TABLE "rank_scan" ADD CONSTRAINT "rank_scan_trigger_check" CHECK ("trigger" IN ('scheduled', 'manual'));--> statement-breakpoint
ALTER TABLE "rank_scan" ADD CONSTRAINT "rank_scan_status_check" CHECK (status IN ('running', 'done', 'failed', 'skipped'));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_rank_grid_size_check" CHECK (rank_grid_size IN (5, 7));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_rank_keywords_check" CHECK (jsonb_typeof(rank_keywords) = 'array' AND jsonb_array_length(rank_keywords) <= 5);