ALTER TABLE "kb_article" ADD COLUMN "help_key" text;--> statement-breakpoint
ALTER TABLE "kb_article" ADD COLUMN "audience" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "kb_article_help_key_uq" ON "kb_article" USING btree ("help_key","audience","level",COALESCE("agency_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "kb_article"."help_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "kb_article_help_key_idx" ON "kb_article" USING btree ("help_key") WHERE "kb_article"."help_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_audience_check" CHECK (audience IN ('all','agency','client','operator'));