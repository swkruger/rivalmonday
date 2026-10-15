ALTER TABLE "brief" DROP CONSTRAINT "brief_kind_check";--> statement-breakpoint
ALTER TABLE "brief_item" ALTER COLUMN "competitor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "brief" ADD COLUMN "scorecard" jsonb;--> statement-breakpoint
ALTER TABLE "brief_item" ADD COLUMN "subject" text DEFAULT 'competitor' NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "brief_one_starting_point" ON "brief" USING btree ("client_id") WHERE kind = 'starting_point';--> statement-breakpoint
ALTER TABLE "brief" ADD CONSTRAINT "brief_kind_check" CHECK (kind IN ('standard', 'quiet', 'starting_point'));--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_subject_check" CHECK (subject = 'self' OR competitor_id IS NOT NULL);--> statement-breakpoint
ALTER TABLE "brief_item" ADD CONSTRAINT "brief_item_subject_values_check" CHECK (subject IN ('self', 'competitor'));