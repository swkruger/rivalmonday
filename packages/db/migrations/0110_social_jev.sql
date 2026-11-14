CREATE TABLE "social_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"network" text NOT NULL,
	"handle" text NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"status" text NOT NULL,
	"confirmed_by" text,
	"confirmed_by_user" text,
	"gated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_pulled_at" timestamp with time zone,
	CONSTRAINT "social_account_handle_unique" UNIQUE("competitor_id","network","handle"),
	CONSTRAINT "social_account_network_check" CHECK ("social_account"."network" IN ('facebook','instagram')),
	CONSTRAINT "social_account_status_check" CHECK ("social_account"."status" IN ('confirmed','suggested','rejected')),
	CONSTRAINT "social_account_confirmed_by_check" CHECK ("social_account"."confirmed_by" IS NULL OR "social_account"."confirmed_by" IN ('website','agency'))
);
--> statement-breakpoint
CREATE TABLE "social_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"network" text NOT NULL,
	"post_id" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"is_video" boolean DEFAULT false NOT NULL,
	"reactions" integer,
	"comments" integer,
	"first_capture_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "social_post_network_post_unique" UNIQUE("network","post_id"),
	CONSTRAINT "social_post_network_check" CHECK ("social_post"."network" IN ('facebook','instagram'))
);
--> statement-breakpoint
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_first_capture_id_capture_id_fk" FOREIGN KEY ("first_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_account_one_confirmed" ON "social_account" USING btree ("competitor_id","network") WHERE "social_account"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "social_post_competitor_posted_idx" ON "social_post" USING btree ("competitor_id","posted_at" DESC NULLS LAST);
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON social_account FROM app_user;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON social_post FROM app_user;
--> statement-breakpoint
ALTER TABLE social_account ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE social_account FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY social_account_visible ON social_account FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE social_post ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE social_post FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY social_post_visible ON social_post FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
-- platform setting: decisions run Jev-only by default (18e B1). Absent row would mean cascade.
INSERT INTO platform_setting (key, value, updated_at, updated_by) VALUES ('ai_decision_mode', '{"mode":"jev_only","reevalUntil":null}'::jsonb, now(), 'migration') ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- backfill:start

--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{social}', 'true', true)
 WHERE id IN ('generic','hvac_plumbing','dental','venues_attractions') AND NOT config ? 'social';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{self_rules}', (config->'self_rules') || $json$[{"id":"social_gap","params":{"min_rival_posts":4,"min_rivals":2},"playbook":"post_weekly","weight":0.4}]$json$::jsonb)
 WHERE id IN ('generic','hvac_plumbing','dental','venues_attractions') AND jsonb_typeof(config->'self_rules') = 'array'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config->'self_rules') r WHERE r->>'id' = 'social_gap');
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{playbooks}', (config->'playbooks') || $json$[{"effort":"L","id":"post_weekly","impact":"M","template":"Post on Facebook and Instagram every week: a recent job, a team photo or an offer.","title":"Post every week where customers scroll","trigger":"social_gap"}]$json$::jsonb)
 WHERE id IN ('generic','hvac_plumbing','dental','venues_attractions') AND jsonb_typeof(config->'playbooks') = 'array'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config->'playbooks') r WHERE r->>'id' = 'post_weekly');
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{scoring,version}', '10', true)
 WHERE id IN ('generic','hvac_plumbing','dental','venues_attractions') AND jsonb_typeof(config->'scoring') = 'object' AND coalesce((config #>> '{scoring,version}')::int, 0) < 10;
