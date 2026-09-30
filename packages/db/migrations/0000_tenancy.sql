CREATE TABLE "agency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vertical_id" text NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_competitor" (
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_competitor_client_id_competitor_id_pk" PRIMARY KEY("client_id","competitor_id")
);
--> statement-breakpoint
CREATE TABLE "competitor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"place_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_domain_unique" UNIQUE("domain"),
	CONSTRAINT "competitor_place_id_unique" UNIQUE("place_id")
);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_competitor" ADD CONSTRAINT "client_competitor_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_competitor" ADD CONSTRAINT "client_competitor_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_competitor" ADD CONSTRAINT "client_competitor_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_agency_idx" ON "client" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "client_competitor_agency_idx" ON "client_competitor" USING btree ("agency_id");