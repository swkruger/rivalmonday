CREATE TABLE "prospect_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text NOT NULL,
	"data" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "prospect_report_status_check" CHECK (status IN ('running', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "monthly_cap_usd" double precision DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "competitor_limit" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_report" ADD CONSTRAINT "prospect_report_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_report" ADD CONSTRAINT "prospect_report_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_report_client_idx" ON "prospect_report" USING btree ("client_id","created_at");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_status_check" CHECK (status IN ('active', 'prospect'));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_monthly_cap_check" CHECK (monthly_cap_usd > 0 AND monthly_cap_usd <= 10000);--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_competitor_limit_check" CHECK (competitor_limit BETWEEN 1 AND 10);