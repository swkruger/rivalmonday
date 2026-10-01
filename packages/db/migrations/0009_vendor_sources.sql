CREATE TABLE "competitor_suggestion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"place_id" text,
	"cid" text,
	"rating" double precision,
	"votes" integer,
	"appearances" integer NOT NULL,
	"best_rank" integer,
	"overlap_score" double precision NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_suggestion_client_place_unique" UNIQUE("client_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "rank_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"capture_id" uuid,
	"results" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"advertiser_id" text,
	"format" text,
	"title" text,
	"text" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"landing_url" text,
	"publisher_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_capture_id" uuid,
	"last_capture_id" uuid,
	CONSTRAINT "ad_platform_external_unique" UNIQUE("platform","external_id")
);
--> statement-breakpoint
CREATE TABLE "competitor_source" (
	"competitor_id" uuid NOT NULL,
	"source" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	CONSTRAINT "competitor_source_competitor_id_source_pk" PRIMARY KEY("competitor_id","source")
);
--> statement-breakpoint
CREATE TABLE "observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_capture_kind_key_unique" UNIQUE("capture_id","kind","key")
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"source" text DEFAULT 'google' NOT NULL,
	"dedupe_key" text NOT NULL,
	"external_id" text,
	"rating" integer,
	"text" text,
	"reviewer_hash" text,
	"posted_at" timestamp with time zone,
	"owner_answer" text,
	"owner_answered_at" timestamp with time zone,
	"first_capture_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_dedupe_unique" UNIQUE("competitor_id","source","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "vendor_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"kind" text NOT NULL,
	"external_task_id" text NOT NULL,
	"competitor_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "vendor_task_external_task_id_unique" UNIQUE("external_task_id")
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "services" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "service_area" jsonb;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "cid" text;--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "meta_page_id" text;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD CONSTRAINT "competitor_suggestion_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_suggestion" ADD CONSTRAINT "competitor_suggestion_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD CONSTRAINT "rank_snapshot_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD CONSTRAINT "rank_snapshot_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshot" ADD CONSTRAINT "rank_snapshot_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_first_capture_id_capture_id_fk" FOREIGN KEY ("first_capture_id") REFERENCES "public"."capture"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad" ADD CONSTRAINT "ad_last_capture_id_capture_id_fk" FOREIGN KEY ("last_capture_id") REFERENCES "public"."capture"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_source" ADD CONSTRAINT "competitor_source_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_first_capture_id_capture_id_fk" FOREIGN KEY ("first_capture_id") REFERENCES "public"."capture"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_task" ADD CONSTRAINT "vendor_task_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitor_suggestion_agency_idx" ON "competitor_suggestion" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "rank_snapshot_client_idx" ON "rank_snapshot" USING btree ("client_id","keyword","captured_at");--> statement-breakpoint
CREATE INDEX "ad_competitor_active_idx" ON "ad" USING btree ("competitor_id","is_active");--> statement-breakpoint
CREATE INDEX "competitor_source_due_idx" ON "competitor_source" USING btree ("active","next_due_at");--> statement-breakpoint
CREATE INDEX "observation_competitor_kind_idx" ON "observation" USING btree ("competitor_id","kind","observed_at");--> statement-breakpoint
CREATE INDEX "review_competitor_posted_idx" ON "review" USING btree ("competitor_id","posted_at");--> statement-breakpoint
ALTER TABLE "competitor" ADD CONSTRAINT "competitor_cid_unique" UNIQUE("cid");