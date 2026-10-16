CREATE TABLE "agency_onboarding" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"invite_link_id" uuid,
	"profile_done_at" timestamp with time zone,
	"profile_skipped_at" timestamp with time zone,
	"team_done_at" timestamp with time zone,
	"team_skipped_at" timestamp with time zone,
	"plan_done_at" timestamp with time zone,
	"plan_skipped_at" timestamp with time zone,
	"branding_done_at" timestamp with time zone,
	"branding_skipped_at" timestamp with time zone,
	"first_client_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"redirected_at" timestamp with time zone,
	"nudges_sent" smallint DEFAULT 0 NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_onboarding_source_check" CHECK ("agency_onboarding"."source" IN ('open','invite','legacy')),
	CONSTRAINT "agency_onboarding_nudges_sent_check" CHECK ("agency_onboarding"."nudges_sent" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "agency_profile" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text,
	"website" text,
	"contact_name" text,
	"contact_role" text,
	"contact_email" text,
	"phone" text,
	"line1" text,
	"line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text DEFAULT 'US' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"verticals" text[] DEFAULT '{}' NOT NULL,
	"billing_email" text,
	"billing_same_as_postal" boolean DEFAULT true NOT NULL,
	"billing_line1" text,
	"billing_line2" text,
	"billing_city" text,
	"billing_region" text,
	"billing_postal_code" text,
	"billing_country" text,
	"tax_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_signup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"agency_name" text NOT NULL,
	"contact_name" text,
	"invite_link_id" uuid,
	"source" text NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_agency_id" uuid,
	"completed_at" timestamp with time zone,
	CONSTRAINT "pending_signup_agency_name_check" CHECK (length("pending_signup"."agency_name") BETWEEN 1 AND 120),
	CONSTRAINT "pending_signup_contact_name_check" CHECK (length("pending_signup"."contact_name") <= 120),
	CONSTRAINT "pending_signup_source_check" CHECK ("pending_signup"."source" IN ('open','invite'))
);
--> statement-breakpoint
ALTER TABLE "agency_onboarding" ADD CONSTRAINT "agency_onboarding_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_onboarding" ADD CONSTRAINT "agency_onboarding_invite_link_id_agency_invite_link_id_fk" FOREIGN KEY ("invite_link_id") REFERENCES "public"."agency_invite_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD CONSTRAINT "agency_profile_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_invite_link_id_agency_invite_link_id_fk" FOREIGN KEY ("invite_link_id") REFERENCES "public"."agency_invite_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_signup" ADD CONSTRAINT "pending_signup_completed_agency_id_agency_id_fk" FOREIGN KEY ("completed_agency_id") REFERENCES "public"."agency"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_signup_open_email_uq" ON "pending_signup" USING btree ("email") WHERE "pending_signup"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "pending_signup_ip_idx" ON "pending_signup" USING btree ("ip_hash","created_at");