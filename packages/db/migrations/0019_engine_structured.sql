CREATE TABLE "move" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"move_type" text NOT NULL,
	"status" text NOT NULL,
	"confidence" double precision NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb DEFAULT '{"eventCount":0,"channels":[],"facts":{}}'::jsonb NOT NULL,
	"rule_version" integer NOT NULL,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_held_at" timestamp with time zone NOT NULL,
	"last_evidence_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "move_event" (
	"move_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "move_event_move_id_event_id_pk" PRIMARY KEY("move_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "detected_change" ALTER COLUMN "after_capture_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "agency_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "channels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "detected_change" ADD COLUMN "rank_scan_id" uuid;--> statement-breakpoint
ALTER TABLE "detected_change" ADD COLUMN "agency_id" uuid;--> statement-breakpoint
ALTER TABLE "detected_change" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "detected_change" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "move" ADD CONSTRAINT "move_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move" ADD CONSTRAINT "move_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move" ADD CONSTRAINT "move_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_event" ADD CONSTRAINT "move_event_move_id_move_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."move"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_event" ADD CONSTRAINT "move_event_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "move_client_idx" ON "move" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "move_open_unique" ON "move" USING btree ("client_id","competitor_id","move_type") WHERE closed_at IS NULL;--> statement-breakpoint
CREATE INDEX "move_event_event_idx" ON "move_event" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_rank_scan_id_rank_scan_id_fk" FOREIGN KEY ("rank_scan_id") REFERENCES "public"."rank_scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_client_idx" ON "event" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_rank_unique" UNIQUE("rank_scan_id","competitor_id","kind","block_key","stage_version");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_tenant_check" CHECK ((client_id IS NULL) = (agency_id IS NULL));--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_subject_check" CHECK ((after_capture_id IS NOT NULL) <> (rank_scan_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "detected_change" ADD CONSTRAINT "detected_change_tenant_check" CHECK ((client_id IS NULL) = (agency_id IS NULL));