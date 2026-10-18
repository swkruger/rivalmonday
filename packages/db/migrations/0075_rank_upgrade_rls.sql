REVOKE INSERT, UPDATE, DELETE ON rank_map_image FROM app_user;
--> statement-breakpoint
ALTER TABLE rank_map_image ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rank_map_image FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rank_map_image_select ON rank_map_image FOR SELECT
  USING (agency_id = app_agency_id() AND app_client_visible(client_id));
--> statement-breakpoint
GRANT UPDATE (rank_keywords, rank_grid_size) ON client TO app_user;
--> statement-breakpoint
UPDATE rank_scan rs SET
  keywords = k.kw,
  grid_size = k.size,
  radius_km = LEAST(GREATEST((c.service_area->>'radiusKm')::float8, 2), 40)
FROM client c,
  (
    SELECT s.scan_id,
           jsonb_agg(DISTINCT s.keyword ORDER BY s.keyword) AS kw,
           round(sqrt(count(DISTINCT (s.lat, s.lng))))::smallint AS size
    FROM rank_snapshot s GROUP BY s.scan_id
  ) k
WHERE k.scan_id = rs.id AND c.id = rs.client_id AND rs.status = 'done' AND rs.grid_size IS NULL
  AND c.service_area IS NOT NULL AND k.kw IS NOT NULL;
