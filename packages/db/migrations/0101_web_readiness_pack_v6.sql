-- 18a-2 D1: site_feature and new_page weights, scoring v6 for the shipped packs. DB-created verticals
-- inherit generic's via assemblePack. vertical.updated_at left alone (see 0099). Idempotent.
-- backfill:start
UPDATE vertical
SET config = jsonb_set(jsonb_set(jsonb_set(config,
      '{type_weights,site_feature}', '0.7'::jsonb, true),
      '{type_weights,new_page}', '0.7'::jsonb, true),
      '{scoring,version}', '6'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental')
  AND jsonb_typeof(config -> 'type_weights') = 'object'
  AND jsonb_typeof(config -> 'scoring') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 6;
