CREATE TABLE "ask_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"citations" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"counts_toward_quota" boolean DEFAULT false NOT NULL,
	"action" jsonb,
	"trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_message_role_check" CHECK (role IN ('user', 'assistant', 'action')),
	CONSTRAINT "ask_message_status_check" CHECK (status IN ('ok', 'quota', 'refused', 'error', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "ask_starter" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"questions" text[] NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_starter_questions_check" CHECK (cardinality(questions) BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "ask_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ask_thread_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "ask_thread_title_check" CHECK (length(title) BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_kind_check";--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "ask_monthly_quota" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "ask_review_allowed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ask_message" ADD CONSTRAINT "ask_message_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_message" ADD CONSTRAINT "ask_message_thread_id_user_id_ask_thread_id_user_id_fk" FOREIGN KEY ("thread_id","user_id") REFERENCES "public"."ask_thread"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_message" ADD CONSTRAINT "ask_message_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_starter" ADD CONSTRAINT "ask_starter_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_starter" ADD CONSTRAINT "ask_starter_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_thread" ADD CONSTRAINT "ask_thread_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_thread" ADD CONSTRAINT "ask_thread_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ask_message_thread_idx" ON "ask_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "ask_message_quota_idx" ON "ask_message" USING btree ("client_id","created_at") WHERE counts_toward_quota;--> statement-breakpoint
CREATE INDEX "ask_thread_user_idx" ON "ask_thread" USING btree ("user_id","client_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_kind_check" CHECK (kind IN ('edit', 'drop', 'reorder', 'rating', 'status', 'created'));--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_ask_monthly_quota_check" CHECK (ask_monthly_quota BETWEEN 0 AND 100000);