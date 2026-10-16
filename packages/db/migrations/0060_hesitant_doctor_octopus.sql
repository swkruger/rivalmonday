CREATE TABLE "agency_connect" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"stripe_account_id" text,
	"status" text NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"default_price_cents" integer,
	"default_setup_fee_cents" integer,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_product_id" text,
	"stripe_default_price_id" text,
	"application_fee_percent" numeric(5, 2),
	"auto_pause_after_days" integer,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_connect_stripe_account_id_unique" UNIQUE("stripe_account_id"),
	CONSTRAINT "agency_connect_status_check" CHECK ("agency_connect"."status" IN ('pending','connected','restricted','disconnected')),
	CONSTRAINT "agency_connect_default_price_cents_check" CHECK ("agency_connect"."default_price_cents" >= 0),
	CONSTRAINT "agency_connect_default_setup_fee_cents_check" CHECK ("agency_connect"."default_setup_fee_cents" >= 0),
	CONSTRAINT "agency_connect_auto_pause_after_days_check" CHECK ("agency_connect"."auto_pause_after_days" BETWEEN 1 AND 90)
);
--> statement-breakpoint
CREATE TABLE "client_billing" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"price_cents" integer,
	"setup_fee_cents" integer,
	"stripe_price_id" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"state" text NOT NULL,
	"checkout_sent_at" timestamp with time zone,
	"payment_failed_since" timestamp with time zone,
	"last_paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"last_stripe_event_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_billing_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "client_billing_price_cents_check" CHECK ("client_billing"."price_cents" >= 0),
	CONSTRAINT "client_billing_setup_fee_cents_check" CHECK ("client_billing"."setup_fee_cents" >= 0),
	CONSTRAINT "client_billing_state_check" CHECK ("client_billing"."state" IN ('off','invited','active','payment_needed','cancelled','disconnected'))
);
--> statement-breakpoint
CREATE TABLE "platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_connect_event" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "billing_notice" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_notice" ADD COLUMN "audience" text DEFAULT 'agency' NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_daily_stat" ADD COLUMN "client_mrr_cents" integer;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "paused_by" text;--> statement-breakpoint
ALTER TABLE "agency_connect" ADD CONSTRAINT "agency_connect_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing" ADD CONSTRAINT "client_billing_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_billing" ADD CONSTRAINT "client_billing_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_notice" ADD CONSTRAINT "billing_notice_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_notice" ADD CONSTRAINT "billing_notice_audience_check" CHECK ("billing_notice"."audience" IN ('agency','client'));