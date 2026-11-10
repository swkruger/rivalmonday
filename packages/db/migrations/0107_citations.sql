CREATE TABLE "citation_audit_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"competitor_ids" uuid[] NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"est_usd" numeric(8, 4) DEFAULT '0' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "citation_audit_run_trigger_check" CHECK (trigger IN ('setup','monthly')),
	CONSTRAINT "citation_audit_run_status_check" CHECK (status IN ('running','done','capped','failed'))
);
--> statement-breakpoint
CREATE TABLE "citation_listing" (
	"competitor_id" uuid NOT NULL,
	"host" text NOT NULL,
	"status" text NOT NULL,
	"name_match" boolean,
	"phone_match" boolean,
	"listing_url" text,
	"listing_title" text,
	"shown_phone" text,
	"capture_id" uuid,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"newly_found_at" timestamp with time zone,
	"in_catalogue" boolean DEFAULT true NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "citation_listing_competitor_id_host_pk" PRIMARY KEY("competitor_id","host"),
	CONSTRAINT "citation_listing_status_check" CHECK (status IN ('listed','not_found','not_checked'))
);
--> statement-breakpoint
ALTER TABLE "recommendation" DROP CONSTRAINT "recommendation_source_check";--> statement-breakpoint
ALTER TABLE "citation_audit_run" ADD CONSTRAINT "citation_audit_run_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_audit_run" ADD CONSTRAINT "citation_audit_run_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_listing" ADD CONSTRAINT "citation_listing_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_listing" ADD CONSTRAINT "citation_listing_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "citation_audit_run_one_live" ON "citation_audit_run" USING btree ("client_id") WHERE status = 'running';--> statement-breakpoint
CREATE INDEX "citation_audit_run_client_idx" ON "citation_audit_run" USING btree ("client_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_listings_live_unique" ON "recommendation" USING btree ("client_id") WHERE source = 'listings' AND status IN ('todo', 'in_progress');--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_source_check" CHECK (source IN ('brief', 'move', 'ask', 'mcp', 'listings'));
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON citation_listing FROM app_user;
--> statement-breakpoint
ALTER TABLE citation_listing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE citation_listing FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY citation_listing_visible ON citation_listing FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON citation_audit_run FROM app_user;
--> statement-breakpoint
ALTER TABLE citation_audit_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE citation_audit_run FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY citation_audit_run_select ON citation_audit_run FOR SELECT USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
-- 18c-1: pack v7 for the shipped packs (citation_added weight, citations block, citation_gap rule, fix_citations play).
-- DB-created verticals inherit generic's via assemblePack. vertical.updated_at left alone (see 0099). Idempotent.
-- backfill:start
UPDATE vertical
SET config = jsonb_set(jsonb_set(config, '{type_weights,citation_added}', '0.3'::jsonb, true), '{scoring,version}', '7'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental')
  AND jsonb_typeof(config -> 'type_weights') = 'object'
  AND jsonb_typeof(config -> 'scoring') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 7;
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{citations}', $json${"directory_groups":{"general":[{"host":"facebook.com","label":"Facebook","add_listing_url":"https://www.facebook.com/pages/create"},{"host":"bbb.org","label":"Better Business Bureau","add_listing_url":"https://www.bbb.org/get-listed"},{"host":"yellowpages.com","label":"Yellow Pages","add_listing_url":"https://www.yellowpages.com/claim-your-listing"},{"host":"manta.com","label":"Manta","add_listing_url":"https://www.manta.com/business-listings/add-your-company"},{"host":"foursquare.com","label":"Foursquare","add_listing_url":"https://business.foursquare.com/claim"},{"host":"mapquest.com","label":"MapQuest","add_listing_url":"https://business.mapquest.com/"}],"home_services":[{"host":"angi.com","label":"Angi","add_listing_url":"https://signup.angi.com/pro"},{"host":"homeadvisor.com","label":"HomeAdvisor","add_listing_url":"https://pro.homeadvisor.com/"},{"host":"thumbtack.com","label":"Thumbtack","add_listing_url":"https://www.thumbtack.com/pro"},{"host":"houzz.com","label":"Houzz","add_listing_url":"https://pro.houzz.com/pro"},{"host":"porch.com","label":"Porch","add_listing_url":"https://pro.porch.com/how-it-works"}],"dental_health":[{"host":"findadentist.ada.org","label":"ADA Find-a-Dentist","add_listing_url":"https://www.ada.org/join-the-ada/member-benefits/find-a-dentist"}]},"groups":["general"],"min_missing":3}$json$::jsonb, true)
WHERE id = 'generic' AND NOT config ? 'citations';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{citations}', '{"groups":["general","home_services"],"min_missing":3}'::jsonb, true)
WHERE id = 'hvac_plumbing' AND NOT config ? 'citations';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{citations}', '{"groups":["general","dental_health"],"min_missing":3}'::jsonb, true)
WHERE id = 'dental' AND NOT config ? 'citations';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{self_rules}', (config -> 'self_rules') || '[{"id":"citation_gap","weight":0.6,"playbook":"fix_citations","params":{"min_missing":3}}]'::jsonb)
WHERE id IN ('generic', 'hvac_plumbing', 'dental') AND jsonb_typeof(config -> 'self_rules') = 'array'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config -> 'self_rules') r WHERE r ->> 'id' = 'citation_gap');
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{playbooks}', (config -> 'playbooks') || $json$[{"id":"fix_citations","trigger":"citation_gap","title":"Get listed on the directories you're missing","template":"Add your business to {{directories}} using each directory's sign-up page (links on the Listings page), with the same name and phone as your Google profile.","effort":"L","impact":"M"}]$json$::jsonb)
WHERE id IN ('generic', 'hvac_plumbing', 'dental') AND jsonb_typeof(config -> 'playbooks') = 'array'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config -> 'playbooks') r WHERE r ->> 'id' = 'fix_citations');
