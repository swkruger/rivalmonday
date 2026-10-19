CREATE TABLE "runbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"agency_id" uuid,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tailored_at" timestamp with time zone,
	"tailor_status" text,
	CONSTRAINT "runbook_level_check" CHECK ("runbook"."level" IN ('platform','agency','client')),
	CONSTRAINT "runbook_tailor_status_check" CHECK ("runbook"."tailor_status" IN ('pending','done','failed','skipped')),
	CONSTRAINT "runbook_owner_check" CHECK (("runbook"."level" = 'platform' AND "runbook"."agency_id" IS NULL AND "runbook"."client_id" IS NULL)
      OR ("runbook"."level" = 'agency' AND "runbook"."agency_id" IS NOT NULL AND "runbook"."client_id" IS NULL)
      OR ("runbook"."level" = 'client' AND "runbook"."agency_id" IS NOT NULL AND "runbook"."client_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "runbook_item" (
	"runbook_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"business_area_ids" text[],
	"version" integer DEFAULT 1 NOT NULL,
	"upstream_version" integer,
	"upstream_snapshot" jsonb,
	"dismissed_upstream_version" integer,
	"customised" boolean DEFAULT false NOT NULL,
	"removed_upstream" boolean DEFAULT false NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runbook_item_runbook_id_item_key_pk" PRIMARY KEY("runbook_id","item_key"),
	CONSTRAINT "runbook_item_key_check" CHECK ("runbook_item"."item_key" ~ '^(play|self_rule|knob):[a-z][a-z0-9_]{0,79}$'),
	CONSTRAINT "runbook_item_kind_check" CHECK ("runbook_item"."kind" IN ('play','self_rule','knob')),
	CONSTRAINT "runbook_item_version_check" CHECK ("runbook_item"."version" > 0),
	CONSTRAINT "runbook_item_key_kind_check" CHECK (split_part("runbook_item"."item_key", ':', 1) = "runbook_item"."kind")
);
--> statement-breakpoint
ALTER TABLE "brief_item" ADD COLUMN "playbook_version" integer;--> statement-breakpoint
ALTER TABLE "recommendation" ADD COLUMN "playbook_version" integer;--> statement-breakpoint
ALTER TABLE "runbook" ADD CONSTRAINT "runbook_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runbook" ADD CONSTRAINT "runbook_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runbook_item" ADD CONSTRAINT "runbook_item_runbook_id_runbook_id_fk" FOREIGN KEY ("runbook_id") REFERENCES "public"."runbook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runbook_platform_uq" ON "runbook" USING btree ("level") WHERE level = 'platform';--> statement-breakpoint
CREATE UNIQUE INDEX "runbook_agency_uq" ON "runbook" USING btree ("agency_id") WHERE level = 'agency';--> statement-breakpoint
CREATE UNIQUE INDEX "runbook_client_uq" ON "runbook" USING btree ("client_id") WHERE level = 'client';--> statement-breakpoint
REVOKE ALL ON runbook, runbook_item FROM app_user;--> statement-breakpoint
ALTER TABLE runbook ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runbook FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runbook_item ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE runbook_item FORCE ROW LEVEL SECURITY;
