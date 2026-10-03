CREATE TABLE "brief" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"delivery_date" date NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"kind" text DEFAULT 'standard' NOT NULL,
	"status" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"trend" jsonb,
	"dropped" jsonb DEFAULT '{"items":0,"sentences":0}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error" text,
	"generated_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brief_client_delivery_unique" UNIQUE("client_id","delivery_date"),
	CONSTRAINT "brief_status_check" CHECK (status IN ('generating', 'failed', 'ready', 'approved', 'sent')),
	CONSTRAINT "brief_kind_check" CHECK (kind IN ('standard', 'quiet'))
);
--> statement-breakpoint
CREATE TABLE "brief_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"ord" integer NOT NULL,
	"competitor_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"what_changed" text NOT NULL,
	"why_it_matters" text NOT NULL,
	"recommended_action" text NOT NULL,
	"confidence" double precision NOT NULL,
	"effort" text NOT NULL,
	"impact" text NOT NULL,
	"event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"move_id" uuid,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"upsell_tag" text,
	"playbook_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"edited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brief_item_status_check" CHECK (status IN ('active', 'dropped')),
	CONSTRAINT "brief_item_effort_check" CHECK (effort IN ('L', 'M', 'H')),
	CONSTRAINT "brief_item_impact_check" CHECK (impact IN ('L', 'M', 'H'))
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_kind_check" CHECK (kind IN ('edit', 'drop', 'reorder', 'rating', 'status'))
);
--> statement-breakpoint
CREATE TABLE "playbook_override" (
	"agency_id" uuid NOT NULL,
	"vertical_id" text NOT NULL,
	"playbook_id" text NOT NULL,
	"title" text,
	"template" text,
	"disabled_by" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbook_override_agency_id_vertical_id_playbook_id_pk" PRIMARY KEY("agency_id","vertical_id","playbook_id")
);
--> statement-breakpoint
CREATE TABLE "recommendation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"move_id" uuid,
	"brief_item_id" uuid,
	"playbook_id" text,
	"effort" text NOT NULL,
	"impact" text NOT NULL,
	"owner" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"dismiss_reason" text,
	"due_at" timestamp with time zone,
	"source" text NOT NULL,
	"upsell_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_status_check" CHECK (status IN ('todo', 'in_progress', 'done', 'dismissed')),
	CONSTRAINT "recommendation_effort_check" CHECK (effort IN ('L', 'M', 'H')),
	CONSTRAINT "recommendation_impact_check" CHECK (impact IN ('L', 'M', 'H')),
	CONSTRAINT "recommendation_owner_check" CHECK (owner IN ('client', 'agency')),
	CONSTRAINT "recommendation_source_check" CHECK (source IN ('brief', 'move', 'ask'))
);
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "timezone" text DEFAULT 'America/Chicago' NOT NULL;--> statement-breakpoint
ALTER TABLE "brief" ADD CONSTRAINT "brief_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief" ADD CONSTRAINT "brief_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_brief_id_brief_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."brief"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_move_id_move_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."move"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_override" ADD CONSTRAINT "playbook_override_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_move_id_move_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."move"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_brief_item_id_brief_item_id_fk" FOREIGN KEY ("brief_item_id") REFERENCES "public"."brief_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brief_agency_status_idx" ON "brief" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "brief_item_brief_idx" ON "brief_item" USING btree ("brief_id","ord");--> statement-breakpoint
CREATE INDEX "feedback_subject_idx" ON "feedback" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "recommendation_client_status_idx" ON "recommendation" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_brief_item_unique" ON "recommendation" USING btree ("brief_item_id") WHERE brief_item_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_move_unique" ON "recommendation" USING btree ("move_id") WHERE source = 'move' AND move_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_timezone_check" CHECK (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$' OR timezone = 'UTC');