CREATE TABLE "site_discovery" (
	"competitor_id" uuid PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"homepage_status" text,
	"urls" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_url" (
	"competitor_id" uuid NOT NULL,
	"url_key" text NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_url_pk" PRIMARY KEY("competitor_id","url_key"),
	CONSTRAINT "site_url_source_check" CHECK (source IN ('sitemap', 'nav'))
);
--> statement-breakpoint
ALTER TABLE "capture" ADD COLUMN "markup_sha" text;--> statement-breakpoint
ALTER TABLE "tracked_page" ADD COLUMN "inactive_reason" text;--> statement-breakpoint
ALTER TABLE "tracked_page" ADD COLUMN "appeared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_discovery" ADD CONSTRAINT "site_discovery_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_url" ADD CONSTRAINT "site_url_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_discovery_due_idx" ON "site_discovery" USING btree ("next_due_at");--> statement-breakpoint
UPDATE tracked_page SET inactive_reason = 'manual' WHERE NOT active AND inactive_reason IS NULL;
--> statement-breakpoint
ALTER TABLE tracked_page ADD CONSTRAINT tracked_page_inactive_reason_check CHECK (
  (active AND inactive_reason IS NULL) OR (NOT active AND inactive_reason IS NOT NULL AND inactive_reason IN ('gone', 'duplicate', 'replaced', 'manual')));
--> statement-breakpoint
ALTER TABLE site_url ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_url FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON site_url FROM app_user;
--> statement-breakpoint
ALTER TABLE site_discovery ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_discovery FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON site_discovery FROM app_user;
