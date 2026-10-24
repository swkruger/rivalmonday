ALTER TABLE "model_batch" ALTER COLUMN "provider_batch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "move" ADD COLUMN "rec_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "move" ADD COLUMN "rec_retry_after" timestamp with time zone;