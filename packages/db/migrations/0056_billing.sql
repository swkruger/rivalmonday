CREATE TABLE "agency_billing" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"plan_id" uuid,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_ends_at" timestamp with time zone,
	"pilot_ends_at" timestamp with time zone,
	"past_due_since" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"review_flagged_at" timestamp with time zone,
	"billable_seats_synced" integer,
	"seat_sync_pending" boolean DEFAULT false NOT NULL,
	"attached_coupon_id" text,
	"seat_cap_exempt" boolean DEFAULT false NOT NULL,
	"last_stripe_event_at" timestamp with time zone,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_billing_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "agency_billing_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "agency_billing_state_check" CHECK ("agency_billing"."state" IN ('pilot','trialing','active','past_due','read_only','suspended','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "agency_billing_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"reason" text NOT NULL,
	"actor" text NOT NULL,
	"stripe_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_invite_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"offer" text NOT NULL,
	"pilot_ends_at" timestamp with time zone,
	"discount_code_id" uuid,
	"email_lock" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agency_invite_link_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "agency_invite_link_offer_check" CHECK ("agency_invite_link"."offer" IN ('pilot','trial')),
	CONSTRAINT "agency_invite_link_max_uses_check" CHECK ("agency_invite_link"."max_uses" >= 1)
);
--> statement-breakpoint
CREATE TABLE "billing_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "billing_notice_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "discount_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"stripe_coupon_id" text NOT NULL,
	"stripe_promotion_code_id" text,
	"percent_off" numeric(5, 2),
	"amount_off_cents" integer,
	"applies_to" text NOT NULL,
	"duration" text NOT NULL,
	"duration_months" integer,
	"restricted_agency_ids" uuid[],
	"expires_at" timestamp with time zone,
	"max_redemptions" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "discount_code_code_unique" UNIQUE("code"),
	CONSTRAINT "discount_code_applies_to_check" CHECK ("discount_code"."applies_to" IN ('base','seats','both')),
	CONSTRAINT "discount_code_duration_check" CHECK ("discount_code"."duration" IN ('once','repeating','forever')),
	CONSTRAINT "discount_code_off_xor_check" CHECK (("discount_code"."percent_off" IS NULL) <> ("discount_code"."amount_off_cents" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"base_price_cents" integer NOT NULL,
	"included_seats" integer NOT NULL,
	"seat_price_cents" integer NOT NULL,
	"trial_days" integer NOT NULL,
	"stripe_product_id" text,
	"stripe_base_price_id" text,
	"stripe_seat_price_id" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "plan_code_version_uq" UNIQUE("code","version"),
	CONSTRAINT "plan_base_price_cents_check" CHECK ("plan"."base_price_cents" >= 0),
	CONSTRAINT "plan_included_seats_check" CHECK ("plan"."included_seats" >= 0),
	CONSTRAINT "plan_seat_price_cents_check" CHECK ("plan"."seat_price_cents" >= 0),
	CONSTRAINT "plan_trial_days_check" CHECK ("plan"."trial_days" BETWEEN 0 AND 90)
);
--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "agency_daily_stat" ADD COLUMN "mrr_cents" integer;--> statement-breakpoint
ALTER TABLE "agency_daily_stat" ADD COLUMN "paid_seats" integer;--> statement-breakpoint
ALTER TABLE "agency_daily_stat" ADD COLUMN "billing_state" text;--> statement-breakpoint
ALTER TABLE "agency_billing" ADD CONSTRAINT "agency_billing_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_billing" ADD CONSTRAINT "agency_billing_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_billing_event" ADD CONSTRAINT "agency_billing_event_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_invite_link" ADD CONSTRAINT "agency_invite_link_discount_code_id_discount_code_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_code"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_notice" ADD CONSTRAINT "billing_notice_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_billing_event_agency_idx" ON "agency_billing_event" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_current_uq" ON "plan" USING btree ("code") WHERE "plan"."is_current";