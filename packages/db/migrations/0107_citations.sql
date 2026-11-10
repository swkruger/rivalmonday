CREATE TABLE "citation_audit_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"competitor_ids" uuid[] NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"est_usd" numeric(8, 4) DEFAULT '0' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "citation_audit_run_trigger_check" CHECK (trigger IN ('setup','monthly')),
	CONSTRAINT "citation_audit_run_status_check" CHECK (status IN ('running','done','capped','failed'))
);
--> statement-breakpoint
CREATE TABLE "citation_listing" (
	"competitor_id" uuid NOT NULL,
	"host" text NOT NULL,
	"status" text NOT NULL,
	"name_match" boolean,
	"phone_match" boolean,
	"listing_url" text,
	"listing_title" text,
	"shown_phone" text,
	"capture_id" uuid,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"newly_found_at" timestamp with time zone,
	"in_catalogue" boolean DEFAULT true NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "citation_listing_competitor_id_host_pk" PRIMARY KEY("competitor_id","host"),
	CONSTRAINT "citation_listing_status_check" CHECK (status IN ('listed','not_found','not_checked'))
);
--> statement-breakpoint
ALTER TABLE "recommendation" DROP CONSTRAINT "recommendation_source_check";--> statement-breakpoint
ALTER TABLE "citation_audit_run" ADD CONSTRAINT "citation_audit_run_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_audit_run" ADD CONSTRAINT "citation_audit_run_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_listing" ADD CONSTRAINT "citation_listing_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_listing" ADD CONSTRAINT "citation_listing_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "citation_audit_run_one_live" ON "citation_audit_run" USING btree ("client_id") WHERE status = 'running';--> statement-breakpoint
CREATE INDEX "citation_audit_run_client_idx" ON "citation_audit_run" USING btree ("client_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_listings_live_unique" ON "recommendation" USING btree ("client_id") WHERE source = 'listings' AND status IN ('todo', 'in_progress');--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_source_check" CHECK (source IN ('brief', 'move', 'ask', 'mcp', 'listings'));
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON citation_listing FROM app_user;
--> statement-breakpoint
ALTER TABLE citation_listing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE citation_listing FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY citation_listing_visible ON citation_listing FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON citation_audit_run FROM app_user;
--> statement-breakpoint
ALTER TABLE citation_audit_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE citation_audit_run FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY citation_audit_run_select ON citation_audit_run FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
