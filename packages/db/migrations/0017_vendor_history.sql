CREATE TABLE "rank_scan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"snapshots" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"rating" integer,
	"text" text,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_by_capture_id" uuid
);
--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD COLUMN "scan_id" uuid;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "ended_capture_id" uuid;--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "meta_page_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "google_advertiser_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_scan" ADD CONSTRAINT "rank_scan_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_scan" ADD CONSTRAINT "rank_scan_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_revision" ADD CONSTRAINT "review_revision_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_revision" ADD CONSTRAINT "review_revision_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_revision" ADD CONSTRAINT "review_revision_replaced_by_capture_id_capture_id_fk" FOREIGN KEY ("replaced_by_capture_id") REFERENCES "public"."capture"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rank_scan_client_idx" ON "rank_scan" USING btree ("client_id","finished_at");--> statement-breakpoint
CREATE INDEX "review_revision_review_idx" ON "review_revision" USING btree ("review_id","replaced_at");--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD CONSTRAINT "rank_snapshot_scan_id_rank_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."rank_scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_ended_capture_id_capture_id_fk" FOREIGN KEY ("ended_capture_id") REFERENCES "public"."capture"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "competitor" SET "meta_page_ids" = jsonb_build_array("meta_page_id") WHERE "meta_page_id" IS NOT NULL;