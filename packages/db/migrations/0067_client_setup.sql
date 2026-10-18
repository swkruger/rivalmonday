CREATE TABLE "client_setup" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"lookup" jsonb,
	"suggestions" jsonb DEFAULT '{"status":"none"}'::jsonb NOT NULL,
	"skipped" text[] DEFAULT '{}'::text[] NOT NULL,
	"competitors_done_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"last_changed_by" uuid,
	"last_changed_role" text,
	"last_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_setup_source_check" CHECK ("client_setup"."source" IN ('staff','agency_link','platform_lead')),
	CONSTRAINT "client_setup_skipped_check" CHECK ("client_setup"."skipped" <@ ARRAY['search','competitors']::text[])
);
--> statement-breakpoint
ALTER TABLE "client_setup" ADD CONSTRAINT "client_setup_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_setup" ADD CONSTRAINT "client_setup_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_setup_open_idx" ON "client_setup" USING btree ("agency_id") WHERE "client_setup"."completed_at" IS NULL AND "client_setup"."dismissed_at" IS NULL;
--> statement-breakpoint
INSERT INTO client_setup (client_id, agency_id, completed_at)
SELECT id, agency_id, now() FROM client
ON CONFLICT (client_id) DO NOTHING;
