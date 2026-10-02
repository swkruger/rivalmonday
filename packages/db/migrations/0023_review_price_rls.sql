CREATE OR REPLACE FUNCTION app_competitor_visible(cid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  -- Runs as the caller, so client_competitor and client RLS limit this to links and clients the tenant context can see.
  -- A client's own business (client.self_competitor_id, Phase 3c) is visible to that client.
  SELECT EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = cid)
      OR EXISTS (SELECT 1 FROM client c WHERE c.self_competitor_id = cid)
$$;
--> statement-breakpoint
DROP POLICY competitor_visible_via_link ON competitor;
--> statement-breakpoint
CREATE POLICY competitor_visible_via_link ON competitor FOR SELECT USING (app_competitor_visible(competitor.id));
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON review_analysis, theme_proposal, price_block_map, price_point FROM app_user;
--> statement-breakpoint
ALTER TABLE review_analysis ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE review_analysis FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY review_analysis_visible ON review_analysis FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE price_point ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE price_point FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY price_point_visible ON price_point FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE theme_proposal ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE theme_proposal FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE price_block_map ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE price_block_map FORCE ROW LEVEL SECURITY;
