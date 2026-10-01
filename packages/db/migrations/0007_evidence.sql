CREATE TABLE "capture" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"tracked_page_id" uuid,
	"source" text NOT NULL,
	"url" text,
	"status" text NOT NULL,
	"http_status" integer,
	"error" text,
	"collector_version" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_capture_kind_unique" UNIQUE("capture_id","kind")
);
--> statement-breakpoint
CREATE TABLE "tracked_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"url" text NOT NULL,
	"page_type" text NOT NULL,
	"source" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"cadence" text NOT NULL,
	"next_due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_page_competitor_url_unique" UNIQUE("competitor_id","url")
);
--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_tracked_page_id_tracked_page_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_page"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_page" ADD CONSTRAINT "tracked_page_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_competitor_time_idx" ON "capture" USING btree ("competitor_id","captured_at");--> statement-breakpoint
CREATE INDEX "capture_page_time_idx" ON "capture" USING btree ("tracked_page_id","captured_at");--> statement-breakpoint
CREATE INDEX "evidence_sha_idx" ON "evidence" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "tracked_page_due_idx" ON "tracked_page" USING btree ("active","next_due_at");