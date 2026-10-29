CREATE TABLE "waitlist_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"org_name" text NOT NULL,
	"website" text,
	"location" text,
	"vertical_id" text,
	"vertical_other" text,
	"client_count_band" text,
	"sample_requested" boolean DEFAULT false NOT NULL,
	"sample_business_name" text,
	"sample_location" text,
	"sample_website" text,
	"sample_status" text,
	"sample_client_id" uuid,
	"sample_approved_at" timestamp with time zone,
	"sample_sent_at" timestamp with time zone,
	"invite_link_id" uuid,
	"lead_id" uuid,
	"source" text,
	"ip_hash" text NOT NULL,
	"confirm_token_hash" text,
	"confirm_expires_at" timestamp with time zone,
	"email_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	CONSTRAINT "waitlist_entry_kind_check" CHECK (kind IN ('agency','business')),
	CONSTRAINT "waitlist_entry_status_check" CHECK (status IN ('new','invited','assigned','declined')),
	CONSTRAINT "waitlist_entry_sample_status_check" CHECK (sample_status IS NULL OR sample_status IN ('requested','approved','sent','declined','failed')),
	CONSTRAINT "waitlist_entry_sample_consistent" CHECK (sample_requested = (sample_status IS NOT NULL)),
	CONSTRAINT "waitlist_entry_agency_only" CHECK (kind = 'agency' OR (NOT sample_requested AND client_count_band IS NULL AND invite_link_id IS NULL)),
	CONSTRAINT "waitlist_entry_business_only" CHECK (kind = 'business' OR (vertical_id IS NULL AND vertical_other IS NULL AND lead_id IS NULL)),
	CONSTRAINT "waitlist_entry_band_check" CHECK (client_count_band IS NULL OR client_count_band IN ('1-5','6-15','16-50','50+')),
	CONSTRAINT "waitlist_entry_email_check" CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
	CONSTRAINT "waitlist_entry_text_check" CHECK (char_length(contact_name) BETWEEN 1 AND 120 AND char_length(org_name) BETWEEN 1 AND 120
    AND coalesce(char_length(website), 0) <= 253 AND coalesce(char_length(location), 0) <= 120 AND coalesce(char_length(vertical_other), 0) <= 80
    AND coalesce(char_length(sample_business_name), 0) <= 120 AND coalesce(char_length(sample_location), 0) <= 120
    AND coalesce(char_length(sample_website), 0) <= 253 AND coalesce(char_length(source), 0) <= 200)
);
--> statement-breakpoint
ALTER TABLE "brief" ADD COLUMN "claims_checked" integer;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_vertical_id_vertical_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."vertical"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_sample_client_id_client_id_fk" FOREIGN KEY ("sample_client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_invite_link_id_agency_invite_link_id_fk" FOREIGN KEY ("invite_link_id") REFERENCES "public"."agency_invite_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entry" ADD CONSTRAINT "waitlist_entry_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_kind_email_unique" ON "waitlist_entry" USING btree ("kind","email");--> statement-breakpoint
CREATE INDEX "waitlist_entry_kind_status_idx" ON "waitlist_entry" USING btree ("kind","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "waitlist_entry_sample_idx" ON "waitlist_entry" USING btree ("sample_status","created_at" DESC NULLS LAST) WHERE sample_requested;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entry_confirm_token_idx" ON "waitlist_entry" USING btree ("confirm_token_hash") WHERE confirm_token_hash IS NOT NULL;--> statement-breakpoint
-- hand-written: platform class (forced RLS, no policy, no app_user privilege), like platform_cost_item (0051)
ALTER TABLE "waitlist_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist_entry" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "waitlist_entry" FROM app_user;
