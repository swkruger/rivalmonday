ALTER TABLE "client_setup"
  ADD COLUMN "invited_contact_id" uuid REFERENCES "contact"("id") ON DELETE SET NULL,
  ADD COLUMN "invited_by" uuid;
--> statement-breakpoint
ALTER TABLE "client_setup" DROP CONSTRAINT "client_setup_skipped_check";
--> statement-breakpoint
ALTER TABLE "client_setup" ADD CONSTRAINT "client_setup_skipped_check"
  CHECK ("client_setup"."skipped" <@ ARRAY['search','competitors','invite','billing']::text[]);
