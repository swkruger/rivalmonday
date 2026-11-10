ALTER TABLE citation_audit_run DROP CONSTRAINT citation_audit_run_trigger_check;
--> statement-breakpoint
ALTER TABLE citation_audit_run ADD CONSTRAINT citation_audit_run_trigger_check CHECK (trigger IN ('setup','monthly','manual'));
--> statement-breakpoint
CREATE INDEX citation_audit_run_manual_idx ON citation_audit_run (agency_id, started_at) WHERE trigger = 'manual';
--> statement-breakpoint
-- 18c-2: pack v8 (claim_url on generic's directory_groups; fix_citations play wording, replaced by id not appended).
-- DB-created verticals inherit generic's via assemblePack. vertical.updated_at left alone (see 0099). Idempotent.
-- backfill:start
UPDATE vertical SET config = jsonb_set(config, '{citations,directory_groups}', $json${"general":[{"host":"facebook.com","label":"Facebook","add_listing_url":"https://www.facebook.com/pages/create","claim_url":"https://business.facebook.com/"},{"host":"bbb.org","label":"Better Business Bureau","add_listing_url":"https://www.bbb.org/get-listed"},{"host":"yellowpages.com","label":"Yellow Pages","add_listing_url":"https://www.yellowpages.com/claim-your-listing"},{"host":"manta.com","label":"Manta","add_listing_url":"https://www.manta.com/business-listings/add-your-company"},{"host":"foursquare.com","label":"Foursquare","add_listing_url":"https://business.foursquare.com/claim"},{"host":"mapquest.com","label":"MapQuest","add_listing_url":"https://business.mapquest.com/"}],"home_services":[{"host":"angi.com","label":"Angi","add_listing_url":"https://signup.angi.com/pro","claim_url":"https://office.angi.com/"},{"host":"homeadvisor.com","label":"HomeAdvisor","add_listing_url":"https://pro.homeadvisor.com/","claim_url":"https://pro.homeadvisor.com/pro/login"},{"host":"thumbtack.com","label":"Thumbtack","add_listing_url":"https://www.thumbtack.com/pro","claim_url":"https://www.thumbtack.com/login"},{"host":"houzz.com","label":"Houzz","add_listing_url":"https://pro.houzz.com/pro"},{"host":"porch.com","label":"Porch","add_listing_url":"https://pro.porch.com/how-it-works"}],"dental_health":[{"host":"findadentist.ada.org","label":"ADA Find-a-Dentist","add_listing_url":"https://www.ada.org/join-the-ada/member-benefits/find-a-dentist","claim_url":"https://www.ada.org/myada"}]}$json$::jsonb, true)
WHERE id = 'generic' AND jsonb_typeof(config #> '{citations,directory_groups}') = 'object'
  AND (config #>> '{citations,directory_groups,general,0,claim_url}') IS NULL;
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{playbooks}', (
  SELECT jsonb_agg(CASE WHEN r.elem ->> 'id' = 'fix_citations' THEN r.elem || $json${"title":"Fix your directory listings","template":"Add or correct your listings on {{directories}} (links on the Listings page), with the same name and phone as your Google profile."}$json$::jsonb ELSE r.elem END ORDER BY r.ord)
  FROM jsonb_array_elements(config -> 'playbooks') WITH ORDINALITY AS r(elem, ord)))
WHERE id IN ('generic', 'hvac_plumbing', 'dental') AND jsonb_typeof(config -> 'playbooks') = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(config -> 'playbooks') r WHERE r ->> 'id' = 'fix_citations' AND r ->> 'title' IS DISTINCT FROM 'Fix your directory listings');
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{scoring,version}', '8'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental') AND jsonb_typeof(config -> 'scoring') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 8;
