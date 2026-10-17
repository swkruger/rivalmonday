CREATE TABLE "intake_link" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_link_slug_unique" UNIQUE("slug"),
	CONSTRAINT "intake_link_slug_check" CHECK ("intake_link"."slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')
);
--> statement-breakpoint
CREATE TABLE "intake_rate" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "intake_rate_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid,
	"source" text NOT NULL,
	"ref" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"message" text,
	"lookup" jsonb NOT NULL,
	"preview" jsonb DEFAULT '{"status":"none"}'::jsonb NOT NULL,
	"verify_token_hash" text,
	"verify_expires_at" timestamp with time zone,
	"view_token_hash" text,
	"verified_at" timestamp with time zone,
	"assigned_by" text,
	"assigned_at" timestamp with time zone,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"client_id" uuid,
	"ip_hash" text,
	"confirmation_sent_at" timestamp with time zone,
	"agency_notified_at" timestamp with time zone,
	"declined_notified_at" timestamp with time zone,
	"pool_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_source_check" CHECK ("lead"."source" IN ('agency_link','platform')),
	CONSTRAINT "lead_status_check" CHECK ("lead"."status" IN ('unverified','verified','accepted','declined','expired')),
	CONSTRAINT "lead_ref_check" CHECK (char_length("lead"."ref") <= 80),
	CONSTRAINT "lead_contact_name_check" CHECK (char_length("lead"."contact_name") BETWEEN 1 AND 120),
	CONSTRAINT "lead_email_check" CHECK (char_length("lead"."email") <= 320),
	CONSTRAINT "lead_phone_check" CHECK (char_length("lead"."phone") <= 40),
	CONSTRAINT "lead_message_check" CHECK (char_length("lead"."message") <= 500)
);
--> statement-breakpoint
ALTER TABLE "intake_link" ADD CONSTRAINT "intake_link_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_agency_status_idx" ON "lead" USING btree ("agency_id","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX "lead_pool_idx" ON "lead" USING btree ("created_at" DESC) WHERE "lead"."agency_id" IS NULL AND "lead"."status" = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX "lead_dedupe_idx" ON "lead" USING btree (coalesce("agency_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("email"),("lookup"->>'placeId')) WHERE "lead"."status" IN ('unverified','verified');