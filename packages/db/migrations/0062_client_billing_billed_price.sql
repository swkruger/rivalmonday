ALTER TABLE "client_billing" ADD COLUMN "billed_price_cents" integer;--> statement-breakpoint
ALTER TABLE "client_billing" ADD COLUMN "checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "client_billing" ADD CONSTRAINT "client_billing_billed_price_cents_check" CHECK ("client_billing"."billed_price_cents" >= 0);