CREATE TABLE "capture_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"tracked_page_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"block_key" text NOT NULL,
	"path" text NOT NULL,
	"text" text NOT NULL,
	"text_sha" text NOT NULL,
	"embedding" vector(512),
	CONSTRAINT "capture_block_capture_ord_unique" UNIQUE("capture_id","ord")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"services" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"zips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(512),
	"confidence" double precision NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"keys" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "detected_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"tracked_page_id" uuid,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"before_capture_id" uuid,
	"after_capture_id" uuid NOT NULL,
	"block_key" text,
	"before_text" text,
	"after_text" text,
	"similarity" double precision,
	"numeric_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stage_version" integer NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detected_change_unique" UNIQUE("after_capture_id","kind","block_key","stage_version")
);
--> statement-breakpoint
CREATE TABLE "event_change" (
	"event_id" uuid NOT NULL,
	"change_id" uuid NOT NULL,
	CONSTRAINT "event_change_event_id_change_id_pk" PRIMARY KEY("event_id","change_id"),
	CONSTRAINT "event_change_change_unique" UNIQUE("change_id")
);
--> statement-breakpoint
CREATE TABLE "event_score" (
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"route" text NOT NULL,
	"factors" jsonb NOT NULL,
	"pack_version" integer NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_score_client_id_event_id_pk" PRIMARY KEY("client_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "stage_run" (
	"stage" text NOT NULL,
	"stage_version" integer NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "stage_run_stage_stage_version_subject_id_pk" PRIMARY KEY("stage","stage_version","subject_id")
);
--> statement-breakpoint
CREATE TABLE "volatile_block" (
	"tracked_page_id" uuid NOT NULL,
	"block_key" text NOT NULL,
	"masked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "volatile_block_tracked_page_id_block_key_pk" PRIMARY KEY("tracked_page_id","block_key")
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "score_thresholds" jsonb;--> statement-breakpoint
ALTER TABLE "capture_block" ADD CONSTRAINT "capture_block_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_block" ADD CONSTRAINT "capture_block_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_block" ADD CONSTRAINT "capture_block_tracked_page_id_tracked_page_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_tracked_page_id_tracked_page_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_before_capture_id_capture_id_fk" FOREIGN KEY ("before_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_after_capture_id_capture_id_fk" FOREIGN KEY ("after_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_change" ADD CONSTRAINT "event_change_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_change" ADD CONSTRAINT "event_change_change_id_detected_change_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."detected_change"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_score" ADD CONSTRAINT "event_score_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_score" ADD CONSTRAINT "event_score_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_score" ADD CONSTRAINT "event_score_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volatile_block" ADD CONSTRAINT "volatile_block_tracked_page_id_tracked_page_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_block_page_key_idx" ON "capture_block" USING btree ("tracked_page_id","block_key");--> statement-breakpoint
CREATE INDEX "event_competitor_time_idx" ON "event" USING btree ("competitor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "event_created_idx" ON "event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "decision_review_open_idx" ON "decision_review" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "detected_change_status_idx" ON "detected_change" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "detected_change_page_key_idx" ON "detected_change" USING btree ("tracked_page_id","block_key");--> statement-breakpoint
CREATE INDEX "event_score_agency_idx" ON "event_score" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "event_score_client_route_idx" ON "event_score" USING btree ("client_id","route","scored_at");--> statement-breakpoint
CREATE INDEX "stage_run_status_idx" ON "stage_run" USING btree ("status","started_at");