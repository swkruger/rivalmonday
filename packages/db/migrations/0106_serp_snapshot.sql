CREATE TABLE "serp_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"scan_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"capture_id" uuid,
	"captured_at" timestamp with time zone NOT NULL,
	"organic" jsonb NOT NULL,
	"local_services" jsonb,
	CONSTRAINT "serp_snapshot_scan_keyword_unique" UNIQUE("scan_id","keyword")
);
--> statement-breakpoint
ALTER TABLE "serp_snapshot" ADD CONSTRAINT "serp_snapshot_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshot" ADD CONSTRAINT "serp_snapshot_scan_id_rank_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."rank_scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshot" ADD CONSTRAINT "serp_snapshot_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshot" ADD CONSTRAINT "serp_snapshot_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "serp_snapshot_client_keyword_idx" ON "serp_snapshot" USING btree ("client_id","keyword","captured_at" DESC NULLS LAST);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON serp_snapshot FROM app_user;
--> statement-breakpoint
ALTER TABLE serp_snapshot ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE serp_snapshot FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY serp_snapshot_select ON serp_snapshot FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
