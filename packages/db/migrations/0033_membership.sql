CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"client_id" uuid,
	"client_scope" jsonb,
	"invited_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitation_role_check" CHECK (role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')),
	CONSTRAINT "invitation_role_scope_check" CHECK ((client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))),
	CONSTRAINT "invitation_client_scope_check" CHECK (client_scope IS NULL OR (role = 'account_manager' AND jsonb_typeof(client_scope) = 'array' AND jsonb_array_length(client_scope) > 0)),
	CONSTRAINT "invitation_email_check" CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agency_id" uuid NOT NULL,
	"role" text NOT NULL,
	"client_id" uuid,
	"client_scope" jsonb,
	"contact_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_role_check" CHECK (role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')),
	CONSTRAINT "membership_role_scope_check" CHECK ((client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))),
	CONSTRAINT "membership_client_scope_check" CHECK (client_scope IS NULL OR (role = 'account_manager' AND jsonb_typeof(client_scope) = 'array' AND jsonb_array_length(client_scope) > 0))
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_unique" ON "invitation" USING btree ("agency_id",coalesce("client_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("email")) WHERE accepted_at IS NULL AND revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_scope_unique" ON "membership" USING btree ("user_id","agency_id",coalesce("client_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "membership_agency_idx" ON "membership" USING btree ("agency_id");