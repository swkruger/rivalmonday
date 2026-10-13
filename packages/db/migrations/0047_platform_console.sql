CREATE TABLE "agency_daily_stat" (
	"agency_id" uuid NOT NULL,
	"day" date NOT NULL,
	"clients_active" integer,
	"clients_prospect" integer,
	"agency_seats" integer,
	"client_seats" integer,
	"wau" integer,
	"briefs_sent" integer,
	"alerts_sent" integer,
	"prospect_reports" integer,
	"ask_questions" integer,
	"mcp_calls" integer,
	"spend_usd" numeric(12, 4),
	"last_activity_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_daily_stat_agency_id_day_pk" PRIMARY KEY("agency_id","day")
);
--> statement-breakpoint
CREATE TABLE "platform_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "platform_admin_role_check" CHECK (role IN ('owner', 'staff', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tool" text NOT NULL,
	"input_hash" text NOT NULL,
	"outcome" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_daily_stat" ADD CONSTRAINT "agency_daily_stat_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admin_active_user_uq" ON "platform_admin" USING btree ("user_id") WHERE "platform_admin"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "platform_audit_log_created_idx" ON "platform_audit_log" USING btree ("created_at");