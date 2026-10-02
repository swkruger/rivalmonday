CREATE TABLE "decision_label" (
	"sample_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"value" text NOT NULL,
	"source" text NOT NULL,
	"labeled_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_label_sample_id_question_key_pk" PRIMARY KEY("sample_id","question_key")
);
--> statement-breakpoint
CREATE TABLE "decision_sample" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"reason" text NOT NULL,
	"agency_id" uuid,
	"client_id" uuid,
	"state" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"primary_answers" jsonb,
	"fallback_answers" jsonb,
	"final_answers" jsonb NOT NULL,
	"needs_review" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"provider_batch_id" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"items" jsonb NOT NULL,
	"request_count" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "model_batch_provider_batch_id_unique" UNIQUE("provider_batch_id")
);
--> statement-breakpoint
CREATE TABLE "score_failure" (
	"event_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error" text,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_failure_event_id_client_id_pk" PRIMARY KEY("event_id","client_id")
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "retracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "retraction_reason" text;--> statement-breakpoint
ALTER TABLE "decision_review" ADD COLUMN "sample_id" uuid;--> statement-breakpoint
ALTER TABLE "decision_review" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "decision_review" ADD COLUMN "resolution" jsonb;--> statement-breakpoint
ALTER TABLE "volatile_block" ADD COLUMN "unmasked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decision_label" ADD CONSTRAINT "decision_label_sample_id_decision_sample_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."decision_sample"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_sample" ADD CONSTRAINT "decision_sample_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_sample" ADD CONSTRAINT "decision_sample_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_failure" ADD CONSTRAINT "score_failure_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_failure" ADD CONSTRAINT "score_failure_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_failure" ADD CONSTRAINT "score_failure_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_sample_task_idx" ON "decision_sample" USING btree ("task","created_at");--> statement-breakpoint
CREATE INDEX "model_batch_status_idx" ON "model_batch" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "decision_review" ADD CONSTRAINT "decision_review_sample_id_decision_sample_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."decision_sample"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_score_thresholds_check" CHECK (score_thresholds IS NULL OR (
        (score_thresholds ? 'alert') AND (score_thresholds ? 'brief')
        AND jsonb_typeof(score_thresholds->'alert') = 'number' AND jsonb_typeof(score_thresholds->'brief') = 'number'
        AND (score_thresholds->>'brief')::numeric >= 0 AND (score_thresholds->>'alert')::numeric <= 100
        AND (score_thresholds->>'brief')::numeric < (score_thresholds->>'alert')::numeric));