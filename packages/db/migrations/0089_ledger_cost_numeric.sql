ALTER TABLE "llm_call" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(14, 6);--> statement-breakpoint
ALTER TABLE "vendor_call" ALTER COLUMN "cost_usd" SET DATA TYPE numeric(14, 6);