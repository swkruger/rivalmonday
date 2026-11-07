-- brief-signal D2: scoring.relevance.whole_business = 1 and scoring.version 4 for the shipped packs (generic,
-- hvac_plumbing, dental). DB-created verticals have no `scoring` key and inherit generic's via assemblePack's deep merge.
-- vertical.updated_at is left alone on purpose: the review re-ask reads it as "seed topics edited". Idempotent.
-- backfill:start
UPDATE vertical
SET config = jsonb_set(jsonb_set(config, '{scoring,relevance,whole_business}', '1'::jsonb, true), '{scoring,version}', '4'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental')
  AND jsonb_typeof(config #> '{scoring,relevance}') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 4;
