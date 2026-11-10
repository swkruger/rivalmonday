CREATE TABLE "gbp_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"text" text,
	"url" text,
	"button_url" text,
	"posted_at" timestamp with time zone,
	"first_capture_id" uuid NOT NULL,
	"last_capture_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"ended_capture_id" uuid,
	"ended_at" timestamp with time zone,
	CONSTRAINT "gbp_post_external_unique" UNIQUE("competitor_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "price_point" DROP CONSTRAINT "price_point_subject_check";--> statement-breakpoint
ALTER TABLE "price_point" ADD COLUMN "gbp_post_id" uuid;--> statement-breakpoint
ALTER TABLE "gbp_post" ADD CONSTRAINT "gbp_post_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_post" ADD CONSTRAINT "gbp_post_first_capture_id_capture_id_fk" FOREIGN KEY ("first_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_post" ADD CONSTRAINT "gbp_post_last_capture_id_capture_id_fk" FOREIGN KEY ("last_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gbp_post" ADD CONSTRAINT "gbp_post_ended_capture_id_capture_id_fk" FOREIGN KEY ("ended_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gbp_post_competitor_idx" ON "gbp_post" USING btree ("competitor_id") WHERE ended_at IS NULL;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_gbp_post_id_gbp_post_id_fk" FOREIGN KEY ("gbp_post_id") REFERENCES "public"."gbp_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_point_post_open_unique" ON "price_point" USING btree ("gbp_post_id","vertical_id","service_id","unit","qualifier","amount") WHERE ended_at IS NULL AND gbp_post_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "price_point_post_idx" ON "price_point" USING btree ("gbp_post_id") WHERE gbp_post_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_subject_check" CHECK (num_nonnulls(tracked_page_id, ad_id, gbp_post_id) = 1);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON gbp_post FROM app_user;
--> statement-breakpoint
ALTER TABLE gbp_post ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE gbp_post FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY gbp_post_visible ON gbp_post FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
INSERT INTO competitor_source (competitor_id, source)
  SELECT competitor_id, 'gbp_posts' FROM competitor_source WHERE source = 'gbp' ON CONFLICT DO NOTHING;
