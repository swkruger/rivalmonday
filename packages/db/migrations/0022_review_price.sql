CREATE TABLE "price_block_map" (
	"text_sha" text NOT NULL,
	"vertical_id" text NOT NULL,
	"service_id" text,
	"confidence" double precision NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"mapped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_block_map_text_sha_vertical_id_pk" PRIMARY KEY("text_sha","vertical_id")
);
--> statement-breakpoint
CREATE TABLE "price_point" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"tracked_page_id" uuid NOT NULL,
	"vertical_id" text NOT NULL,
	"service_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"unit" text NOT NULL,
	"qualifier" text NOT NULL,
	"promo" boolean DEFAULT false NOT NULL,
	"raw" text NOT NULL,
	"context" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"first_capture_id" uuid NOT NULL,
	"last_capture_id" uuid NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_capture_id" uuid
);
--> statement-breakpoint
CREATE TABLE "review_analysis" (
	"review_id" uuid NOT NULL,
	"vertical_id" text NOT NULL,
	"competitor_id" uuid NOT NULL,
	"text_sha" text NOT NULL,
	"asked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"other" boolean DEFAULT false NOT NULL,
	"sentiment" integer,
	"confidence" double precision NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"analysis_version" integer NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_analysis_review_id_vertical_id_pk" PRIMARY KEY("review_id","vertical_id")
);
--> statement-breakpoint
CREATE TABLE "theme_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical_id" text NOT NULL,
	"theme_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"other_count" integer NOT NULL,
	"sample_review_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "self_competitor_id" uuid;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_tracked_page_id_tracked_page_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_first_capture_id_capture_id_fk" FOREIGN KEY ("first_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_last_capture_id_capture_id_fk" FOREIGN KEY ("last_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_ended_capture_id_capture_id_fk" FOREIGN KEY ("ended_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analysis" ADD CONSTRAINT "review_analysis_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_analysis" ADD CONSTRAINT "review_analysis_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_point_open_unique" ON "price_point" USING btree ("tracked_page_id","vertical_id","service_id","unit","qualifier","amount") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "price_point_series_idx" ON "price_point" USING btree ("competitor_id","vertical_id","service_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "review_analysis_competitor_idx" ON "review_analysis" USING btree ("competitor_id","vertical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "theme_proposal_live_unique" ON "theme_proposal" USING btree ("vertical_id","theme_id") WHERE status IN ('proposed', 'approved');--> statement-breakpoint
CREATE INDEX "theme_proposal_vertical_idx" ON "theme_proposal" USING btree ("vertical_id","created_at");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_self_competitor_id_competitor_id_fk" FOREIGN KEY ("self_competitor_id") REFERENCES "public"."competitor"("id") ON DELETE set null ON UPDATE no action;