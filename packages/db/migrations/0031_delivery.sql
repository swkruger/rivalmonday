CREATE TABLE "agency_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"kinds" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_webhook_kind_check" CHECK (kind IN ('slack', 'teams'))
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"score" double precision NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"written" text,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"delivery" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"dismiss_reason" text,
	"delivered_at" timestamp with time zone,
	"delivered_local_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_status_check" CHECK (status IN ('drafting', 'pending_review', 'approved', 'delivered', 'dismissed', 'withdrawn', 'expired')),
	CONSTRAINT "alert_mode_check" CHECK (mode IN ('direct', 'after_am_check', 'digest_only')),
	CONSTRAINT "alert_delivery_check" CHECK (delivery IS NULL OR delivery IN ('immediate', 'digest')),
	CONSTRAINT "alert_written_check" CHECK (written IS NULL OR written IN ('model', 'template'))
);
--> statement-breakpoint
CREATE TABLE "alert_event" (
	"alert_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_event_alert_id_event_id_pk" PRIMARY KEY("alert_id","event_id"),
	CONSTRAINT "alert_event_client_event_unique" UNIQUE("client_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid,
	"role" text NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"timezone" text,
	"quiet_hours" jsonb,
	"client_scope" jsonb,
	"user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"links_revoked_before" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_role_check" CHECK (role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')),
	CONSTRAINT "contact_role_scope_check" CHECK ((client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))),
	CONSTRAINT "contact_email_check" CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid,
	"webhook_id" uuid,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"address" text,
	"payload" jsonb,
	"status" text NOT NULL,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"provider_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "notification_channel_check" CHECK (channel IN ('in_app', 'email', 'slack', 'teams', 'sms')),
	CONSTRAINT "notification_status_check" CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
	CONSTRAINT "notification_recipient_check" CHECK ((contact_id IS NULL) <> (webhook_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notification_pref" (
	"contact_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "notification_pref_contact_id_kind_channel_pk" PRIMARY KEY("contact_id","kind","channel"),
	CONSTRAINT "notification_pref_channel_check" CHECK (channel IN ('in_app', 'email', 'sms'))
);
--> statement-breakpoint
CREATE TABLE "trend_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"quarter" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"data" jsonb,
	"status" text NOT NULL,
	"pdf_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "trend_report_client_quarter_unique" UNIQUE("client_id","quarter"),
	CONSTRAINT "trend_report_status_check" CHECK (status IN ('ready', 'sent')),
	CONSTRAINT "trend_report_quarter_check" CHECK (quarter ~ '^[0-9]{4}-Q[1-4]$')
);
--> statement-breakpoint
ALTER TABLE "brief" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brief" ADD COLUMN "pdf_key" text;--> statement-breakpoint
ALTER TABLE "agency" ADD COLUMN "branding" jsonb;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "alert_mode" text DEFAULT 'after_am_check' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "brief_auto_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_webhook" ADD CONSTRAINT "agency_webhook_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_alert_id_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alert"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_event" ADD CONSTRAINT "alert_event_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_webhook_id_agency_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."agency_webhook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_report" ADD CONSTRAINT "trend_report_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_report" ADD CONSTRAINT "trend_report_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_webhook_agency_idx" ON "agency_webhook" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "alert_client_status_idx" ON "alert" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "alert_client_competitor_idx" ON "alert" USING btree ("client_id","competitor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_email_unique" ON "contact" USING btree ("agency_id",coalesce("client_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("email"));--> statement-breakpoint
CREATE INDEX "contact_client_idx" ON "contact" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "notification_due_idx" ON "notification" USING btree ("status","not_before");--> statement-breakpoint
CREATE INDEX "notification_contact_idx" ON "notification" USING btree ("contact_id","created_at");--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_alert_mode_check" CHECK (alert_mode IN ('direct', 'after_am_check', 'digest_only'));