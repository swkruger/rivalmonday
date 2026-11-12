CREATE TABLE "listed_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"start_date" date NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"sources" text[] NOT NULL,
	"url" text,
	"venue" text,
	"ticketed" boolean DEFAULT false NOT NULL,
	"series" boolean DEFAULT false NOT NULL,
	"first_capture_id" uuid NOT NULL,
	"last_capture_id" uuid NOT NULL,
	"status_capture_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"status_changed_at" timestamp with time zone,
	CONSTRAINT "listed_event_key_unique" UNIQUE("competitor_id","event_key"),
	CONSTRAINT "listed_event_status_check" CHECK ("listed_event"."status" IN ('scheduled','cancelled','postponed','sold_out')),
	CONSTRAINT "listed_event_sources_check" CHECK ("listed_event"."sources" <@ ARRAY['web','meta_ads','google_panel']::text[] AND cardinality("listed_event"."sources") > 0)
);
--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "tripadvisor_id" text;--> statement-breakpoint
ALTER TABLE "competitor" ADD COLUMN "tripadvisor_url" text;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_first_capture_id_capture_id_fk" FOREIGN KEY ("first_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_last_capture_id_capture_id_fk" FOREIGN KEY ("last_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listed_event" ADD CONSTRAINT "listed_event_status_capture_id_capture_id_fk" FOREIGN KEY ("status_capture_id") REFERENCES "public"."capture"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listed_event_upcoming_idx" ON "listed_event" USING btree ("competitor_id","start_date");
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON listed_event FROM app_user;
--> statement-breakpoint
ALTER TABLE listed_event ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listed_event FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY listed_event_visible ON listed_event FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
-- backfill:start

--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{type_weights,event_listed}', CASE id WHEN 'generic' THEN '0.5' ELSE '0.35' END::jsonb, true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'type_weights') = 'object' AND NOT (config->'type_weights') ? 'event_listed';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{scoring,size,events_for_full}', '5', true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config #> '{scoring,size}') = 'object' AND NOT (config #> '{scoring,size}') ? 'events_for_full';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{events}', '{"menu":false,"panel":false}', true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND NOT config ? 'events';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{citations,directory_groups,events_venues}', $json$[{"host":"tripadvisor.com","label":"Tripadvisor","add_listing_url":"https://www.tripadvisor.com/GetListedNew"},{"host":"theknot.com","label":"The Knot","add_listing_url":"https://www.theknot.com/vendors"},{"host":"eventbrite.com","label":"Eventbrite","add_listing_url":"https://www.eventbrite.com/organizer/overview/"},{"host":"peerspace.com","label":"Peerspace","add_listing_url":"https://www.peerspace.com/host"},{"host":"weddingwire.com","label":"WeddingWire","add_listing_url":"https://www.weddingwire.com/vendors"}]$json$::jsonb, true)
 WHERE id = 'generic' AND jsonb_typeof(config #> '{citations,directory_groups}') = 'object' AND NOT (config #> '{citations,directory_groups}') ? 'events_venues';
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{self_rules}', (config->'self_rules') || $json$[{"id":"event_gap","params":{"min_rival_events":2},"playbook":"list_your_events","weight":0.4}]$json$::jsonb)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'self_rules') = 'array'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config->'self_rules') r WHERE r->>'id' = 'event_gap');
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{playbooks}', (config->'playbooks') || $json$[{"effort":"L","id":"list_your_events","impact":"M","template":"Post each event on your Google profile with its date, and list it on your website's events page.","title":"Put your events where customers look","trigger":"event_gap"}]$json$::jsonb)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'playbooks') = 'array'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(config->'playbooks') r WHERE r->>'id' = 'list_your_events');
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{scoring,version}', '9', true)
 WHERE id IN ('generic','hvac_plumbing','dental') AND jsonb_typeof(config->'scoring') = 'object' AND coalesce((config #>> '{scoring,version}')::int, 0) < 9;
--> statement-breakpoint
-- seed: venues_attractions (vertical, areas, categories) as printed by `pnpm --filter @cs/verticals seed-sql`. vertical.updated_at untouched.
-- A category already claimed by a DB-created vertical keeps its owner (ON CONFLICT DO NOTHING).
--> statement-breakpoint
INSERT INTO vertical (id, name, status, version, gbp_categories, gbp_related_categories, config) VALUES ('venues_attractions', 'Venues & attractions', 'reviewed', 1, ARRAY['Event venue', 'Live music venue', 'Escape room center', 'Amusement center', 'Bowling alley', 'Wedding venue', 'Concert hall', 'Comedy club']::text[], ARRAY['Bar', 'Brewery', 'Distillery', 'Winery']::text[], $json${"audience_noun":"guests","citations":{"groups":["general","events_venues"],"min_missing":3},"discovery":{"cost_cap_usd":3,"grid":{"fallback_size":5,"size":7},"seed_keywords":["event venue","live music","wedding venue","escape room","things to do"],"shortlist":20,"tiers":{"top":{"activity":0.25,"overlap":0.55},"watch":{"activity":0.6,"overlap":0.35}}},"events":{"menu":true,"panel":true},"move_thresholds":{"ad_burst_starts_30d":3,"ad_surge_multiplier":2,"complaint_spike_multiplier":2,"hiring_push_postings_30d":3,"price_war_cuts_90d":2,"promo_blitz_window_days":14,"rating_drop_90d":0.2},"playbooks":[{"id":"price_cut_bundle","template":"{{competitor}} cut {{service}} to {{new_price}}. Rather than matching, offer {{service}} at a comparable price bundled with a visible extra (e.g. a free add-on or priority scheduling) and promote it on your Google Business Profile and in ads covering the affected ZIP codes.","title":"Answer a price cut with a value bundle","trigger":"price_change"},{"id":"price_war_hold_position","template":"{{competitor}} is repeatedly discounting overlapping services. Avoid a race to the bottom: lead with guarantees (upfront pricing, satisfaction guarantee, on-time promise) and a repeat-customer offer that locks in customers.","title":"Hold price, sell certainty","trigger":"price_war"},{"id":"territory_defend","template":"{{competitor}} is expanding into {{areas}}. Publish or refresh service-area pages for those towns, post weekly on your Google Business Profile, and raise Local Services Ads budget in the affected ZIP codes for 60 days.","title":"Defend the territory they are entering","trigger":"territory_expansion"},{"id":"new_service_response","template":"{{competitor}} launched {{service}}. If you offer it, make it prominent on your site and profile now; if not, decide whether to add it or partner, and prepare a comparison answer for sales calls.","title":"Respond to a new service line","trigger":"new_service_line"},{"id":"hiring_push_capacity","template":"{{competitor}} is hiring aggressively, signalling growth. Lock in existing customers with early renewals or repeat-customer offers and review your own recruiting message and pay against their postings.","title":"Prepare for added competitor capacity","trigger":"hiring_push"},{"id":"promo_blitz_counter","template":"{{competitor}} is running promotions across several channels. Run one targeted, time-limited offer on your highest-margin service and remind past customers by email/SMS.","title":"Counter a promo blitz without discounting everything","trigger":"promo_blitz"},{"id":"reputation_slump_capture","template":"{{competitor}}'s reviews show rising complaints about {{topic}}. Highlight your strength on {{topic}} in ads and on your homepage, backed by your own recent reviews that mention it.","title":"Win customers unhappy with a competitor","trigger":"reputation_slump"},{"id":"ad_surge_watch","template":"{{competitor}} has sharply increased advertising. Check your impression share for core services, protect branded search terms, and make sure your offer is visible where their ads run.","title":"Protect visibility during an ad surge","trigger":"ad_surge"},{"id":"map_climb_defend","template":"{{competitor}} is climbing into the Google Maps top 3 across your area. Refresh your Google Business Profile (photos, services, posts), ask recent customers for reviews, and check that your service-area pages cover the places where they gained.","title":"Defend your map visibility","trigger":"map_climb"},{"effort":"L","id":"ask_for_reviews","impact":"H","template":"Text every customer a Google review link right after the visit, and aim for a few new reviews each week.","title":"Ask more customers for a review","trigger":"review_velocity_gap"},{"effort":"L","id":"reply_to_reviews","impact":"M","template":"Reply to every new review within two days, starting with the last 20.","title":"Reply to your reviews","trigger":"reply_rate_gap"},{"effort":"M","id":"fix_top_complaint","impact":"H","template":"Read your lowest reviews from the last 90 days, pick the complaint customers repeat most, and fix it this month.","title":"Fix the most common complaint","trigger":"rating_gap"},{"effort":"M","id":"consider_search_ads","impact":"M","template":"Run a small Google search campaign for your main service in your service area so you show up next to those rivals.","title":"Try a small Google search ads budget","trigger":"rival_only_advertiser"},{"effort":"M","id":"fix_topic","impact":"M","template":"Name one change to fix {{topic}}, tell your team, and ask happy customers who notice it to say so in their review.","title":"Address a weak spot customers notice","trigger":"topic_weakness"},{"effort":"L","id":"promote_strength","impact":"M","template":"Feature {{topic}} as a strength on your website and Google profile, with a short quote from a customer review.","title":"Promote what customers praise","trigger":"topic_strength"},{"effort":"M","id":"improve_map_rank","impact":"H","template":"Add photos of your work, list every service and city you cover, and post an update on your Google profile each week, and make sure your name, address and phone match everywhere online.","title":"Climb the Google map results","trigger":"map_visibility_gap"},{"effort":"L","id":"complete_profile","impact":"M","template":"Claim your Google profile and fill in your hours, services and extra categories so customers see a complete listing.","title":"Complete your Google profile","trigger":"profile_gap"},{"effort":"L","id":"fix_citations","impact":"M","template":"Add or correct your listings on {{directories}} (links on the Listings page), with the same name and phone as your Google profile.","title":"Fix your directory listings","trigger":"citation_gap"},{"effort":"L","id":"list_your_events","impact":"M","template":"Post each event on your Google profile with its date, and list it on your website's events page.","title":"Put your events where customers look","trigger":"event_gap"},{"effort":"L","id":"counter_programme","impact":"M","template":"{{competitor}} has an event on {{date}}. Plan your own draw for that week and post it on your Google profile now.","title":"Counter-programme their event","trigger":"event_listed"},{"effort":"M","id":"early_bird","impact":"M","template":"Open bookings for your next event with a limited early-bird price and announce it on Google.","title":"Sell early with an early-bird price","trigger":"promo"},{"effort":"L","id":"sold_out_waitlist","impact":"M","template":"{{competitor}} sold out {{event}}. Offer a similar night soon and promote it in posts and ads.","title":"Catch the sold-out crowd","trigger":"event_listed"}],"scoring":{"alert_max_age_days":7,"novelty_similarity_floor":0.5,"novelty_window_days":365,"relevance":{"matched":1,"outside_territory":0.3,"unmapped":0.6,"unmatched":0.2,"whole_business":1},"routing":{"alert":70,"brief":40},"size":{"ads_for_full":5,"audience_pct_for_full":20,"default":0.6,"events_for_full":5,"jobs_for_full":5,"price_min":0.3,"price_pct_for_full":20,"rank_delta_for_full":5,"rating_delta_for_full":0.3,"review_z_for_full":4,"structured_min":0.3},"version":9},"self_rules":[{"id":"review_velocity_gap","params":{"ratio":0.5},"playbook":"ask_for_reviews","strength":false,"weight":1},{"id":"reply_rate_gap","params":{"gap":0.25},"playbook":"reply_to_reviews","strength":false,"weight":0.8},{"id":"rating_gap","params":{"gap":0.2},"playbook":"fix_top_complaint","strength":false,"weight":0.9},{"id":"rival_only_advertiser","params":{},"playbook":"consider_search_ads","strength":false,"weight":0.6},{"id":"topic_weakness","params":{"gap":0.1},"playbook":"fix_topic","strength":false,"weight":0.7},{"id":"topic_strength","params":{"gap":0.1},"playbook":"promote_strength","strength":true,"weight":0.5},{"id":"map_visibility_gap","params":{"gap":0.1},"playbook":"improve_map_rank","strength":false,"weight":0.8},{"id":"profile_gap","params":{"min_categories":2},"playbook":"complete_profile","strength":false,"weight":0.7},{"id":"citation_gap","params":{"min_missing":3},"playbook":"fix_citations","strength":false,"weight":0.6},{"id":"event_gap","params":{"min_rival_events":2},"playbook":"list_your_events","strength":false,"weight":0.4}],"topics":[{"description":"The feel of the place","id":"atmosphere","name":"Atmosphere"},{"description":"Friendliness","id":"staff","name":"Staff"},{"description":"Whether the price feels fair for the experience","id":"value","name":"Value"},{"description":"Sound quality","id":"sound_comfort","name":"Sound & comfort"},{"description":"Clean rooms","id":"cleanliness","name":"Cleanliness"},{"description":"How easy it is to find a date","id":"booking_ease","name":"Booking ease"}],"tripadvisor":true,"type_weights":{"ad_started":0.6,"ad_stopped":0.3,"audience_growth":0.7,"citation_added":0.3,"content":0.2,"cosmetic":0,"event_listed":0.8,"hiring":0.5,"new_location":0.9,"new_page":0.7,"new_service":0.7,"price_change":1,"profile_change":0.8,"promo":0.85,"rank_change":0.5,"rating_change":0.8,"review_spike":0.6,"service_area_change":0.9,"service_removed":0.5,"site_feature":0.7,"status_change":1,"tier_change":0.6}}$json$::jsonb) ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'private_events', 'Private events', ARRAY['private party', 'event hire', 'venue hire']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'live_music', 'Live music', ARRAY['concerts', 'live bands', 'gigs']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'weddings', 'Weddings', ARRAY['wedding venue', 'wedding reception', 'ceremony']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'corporate_events', 'Corporate events', ARRAY['team building', 'company party', 'business events']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'tickets_admission', 'Tickets & admission', ARRAY['tickets', 'entry fee', 'admission price']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'group_packages', 'Group packages', ARRAY['group bookings', 'party package', 'group rates']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'food_drink', 'Food & drink', ARRAY['catering', 'bar', 'drinks package']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO business_area (vertical_id, id, name, aliases, status) VALUES ('venues_attractions', 'tours_tastings', 'Tours & tastings', ARRAY['guided tour', 'tasting', 'behind the scenes']::text[], 'reviewed') ON CONFLICT (vertical_id, id) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('event venue', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('live music venue', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('escape room center', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('amusement center', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('bowling alley', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('wedding venue', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('concert hall', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('comedy club', 'venues_attractions', 'primary') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('bar', 'venues_attractions', 'related') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('brewery', 'venues_attractions', 'related') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('distillery', 'venues_attractions', 'related') ON CONFLICT (category_lc) DO NOTHING;
--> statement-breakpoint
INSERT INTO vertical_category (category_lc, vertical_id, kind) VALUES ('winery', 'venues_attractions', 'related') ON CONFLICT (category_lc) DO NOTHING;
