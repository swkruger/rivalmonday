CREATE TABLE "ad_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"source_url_sha" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"fail_reason" text,
	"source_sha256" text,
	"shows_person" boolean,
	"shows_price" boolean,
	"shows_offer" boolean,
	"theme" text,
	"service_ids" jsonb,
	"triage" jsonb,
	"evidence_id" uuid,
	"read_status" text,
	"read_at" timestamp with time zone,
	"triaged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_image_ad_url_unique" UNIQUE("ad_id","source_url_sha"),
	CONSTRAINT "ad_image_status_check" CHECK (status IN ('pending', 'rejected', 'triaged')),
	CONSTRAINT "ad_image_fail_reason_check" CHECK (fail_reason IS NULL OR fail_reason IN ('too_large', 'bad_type', 'bad_image', 'expired', 'robots', 'ssrf')),
	CONSTRAINT "ad_image_rejected_reason" CHECK ((status = 'rejected') = (fail_reason IS NOT NULL)),
	CONSTRAINT "ad_image_read_status_check" CHECK (read_status IS NULL OR read_status IN ('read', 'no_price', 'unconfirmed', 'failed')),
	CONSTRAINT "ad_image_person_unstored" CHECK (shows_person IS NOT TRUE OR evidence_id IS NULL)
);
--> statement-breakpoint
ALTER TABLE "price_point" ADD COLUMN "ad_image_id" uuid;--> statement-breakpoint
ALTER TABLE "ad_image" ADD CONSTRAINT "ad_image_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_image" ADD CONSTRAINT "ad_image_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_image" ADD CONSTRAINT "ad_image_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_image_source_sha_idx" ON "ad_image" USING btree ("source_sha256");--> statement-breakpoint
CREATE INDEX "ad_image_competitor_stored_idx" ON "ad_image" USING btree ("competitor_id","source_sha256") WHERE evidence_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ad_image_competitor_read_idx" ON "ad_image" USING btree ("competitor_id","read_at");--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_ad_image_id_ad_image_id_fk" FOREIGN KEY ("ad_image_id") REFERENCES "public"."ad_image"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_point_ad_image_idx" ON "price_point" USING btree ("ad_image_id") WHERE ad_image_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_ad_image_has_ad" CHECK (ad_image_id IS NULL OR ad_id IS NOT NULL);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON ad_image FROM app_user;
--> statement-breakpoint
ALTER TABLE ad_image ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ad_image FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ad_image_visible ON ad_image FOR SELECT USING (app_competitor_visible(competitor_id));
