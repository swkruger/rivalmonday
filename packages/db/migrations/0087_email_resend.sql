CREATE TABLE "email_resend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_resend_hash_sent_idx" ON "email_resend" USING btree ("email_hash","sent_at");