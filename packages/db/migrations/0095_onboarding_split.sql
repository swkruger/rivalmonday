ALTER TABLE "agency_onboarding" ADD COLUMN "wizard_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_setup" ADD COLUMN "owner_pick_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_setup" ADD COLUMN "location_source" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "address" jsonb;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "client_setup" ADD CONSTRAINT "client_setup_location_source_chk" CHECK ("client_setup"."location_source" IS NULL OR "client_setup"."location_source" IN ('listing','geocoded'));--> statement-breakpoint
GRANT UPDATE ("phone", "address", "logo_url") ON "client" TO app_user;
