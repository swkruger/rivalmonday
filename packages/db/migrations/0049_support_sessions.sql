CREATE TABLE "support_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_user_id" text NOT NULL,
	"agency_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "support_session_reason_check" CHECK (char_length(reason) BETWEEN 5 AND 300),
	CONSTRAINT "support_session_end_reason_check" CHECK (end_reason IN ('exit','expired','replaced','revoked'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "support_session_id" uuid;--> statement-breakpoint
ALTER TABLE "agency" ADD COLUMN "notify_support_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "support_session" ADD CONSTRAINT "support_session_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_session_open_uq" ON "support_session" USING btree ("platform_user_id") WHERE "support_session"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "support_session_agency_idx" ON "support_session" USING btree ("agency_id","started_at" DESC);