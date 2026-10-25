ALTER TABLE "agency" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agency" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "agency" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "agency" ADD CONSTRAINT "agency_suspended_reason_len" CHECK ("agency"."suspended_reason" IS NULL OR char_length("agency"."suspended_reason") BETWEEN 3 AND 500);--> statement-breakpoint
ALTER TABLE "agency" ADD CONSTRAINT "agency_suspended_consistent" CHECK (("agency"."suspended_at" IS NULL) = ("agency"."suspended_reason" IS NULL) AND ("agency"."suspended_at" IS NULL) = ("agency"."suspended_by" IS NULL));