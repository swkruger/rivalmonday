CREATE OR REPLACE FUNCTION app_competitor_visible(cid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  -- Runs as the caller, so client_competitor RLS limits this to links the tenant context can see.
  SELECT EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = cid)
$$;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON competitor, tracked_page, capture, evidence FROM app_user;
--> statement-breakpoint
ALTER TABLE tracked_page ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tracked_page FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tracked_page_visible ON tracked_page FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE capture ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE capture FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY capture_visible ON capture FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY evidence_visible ON evidence FOR SELECT
  USING (EXISTS (SELECT 1 FROM capture c WHERE c.id = evidence.capture_id));
