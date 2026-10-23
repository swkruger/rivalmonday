-- 15b-3b §4: generic's topic id technician_professionalism -> staff_professionalism, for generic and every vertical that
-- inherits generic's topic list (no 'topics' key in vertical.config). hvac_plumbing (own topics) keeps its id. Idempotent.
-- backfill:start
CREATE OR REPLACE FUNCTION _gt_verticals() RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(id ORDER BY id), '{}') FROM vertical WHERE id = 'generic' OR NOT (config ? 'topics')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION _gt_arr(a jsonb, old text, new text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(a) IS DISTINCT FROM 'array' OR NOT (a ? old) THEN a ELSE (
    SELECT coalesce(jsonb_agg(to_jsonb(d.x) ORDER BY d.o), '[]'::jsonb)
    FROM (SELECT m.x, min(m.o) AS o
          FROM (SELECT CASE WHEN e.v = old THEN new ELSE e.v END AS x, e.o
                FROM jsonb_array_elements_text(a) WITH ORDINALITY AS e(v, o)) m
          GROUP BY m.x) d) END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION _gt_obj(o jsonb, vs text[]) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text; k_old text; k_new text;
BEGIN
  IF o IS NULL OR jsonb_typeof(o) <> 'object' THEN RETURN o; END IF;
  FOREACH v IN ARRAY vs LOOP
    k_old := 'theme_' || v || '__technician_professionalism';
    k_new := 'theme_' || v || '__staff_professionalism';
    IF o ? k_old THEN
      o := CASE WHEN o ? k_new THEN o - k_old ELSE (o - k_old) || jsonb_build_object(k_new, o -> k_old) END;
    END IF;
  END LOOP;
  RETURN o;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION _gt_keys(a jsonb, vs text[]) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY vs LOOP
    a := _gt_arr(a, 'theme_' || v || '__technician_professionalism', 'theme_' || v || '__staff_professionalism');
  END LOOP;
  RETURN a;
END $$;
--> statement-breakpoint
UPDATE vertical SET config = jsonb_set(config, '{topics}', (
    SELECT jsonb_agg(CASE WHEN t ->> 'id' = 'technician_professionalism' THEN jsonb_set(t, '{id}', '"staff_professionalism"') ELSE t END ORDER BY o)
    FROM jsonb_array_elements(config -> 'topics') WITH ORDINALITY AS x(t, o)))
  WHERE id = 'generic' AND config -> 'topics' @> '[{"id": "technician_professionalism"}]';
--> statement-breakpoint
UPDATE review_analysis
  SET asked = _gt_arr(asked, 'technician_professionalism', 'staff_professionalism'),
      topics = _gt_arr(topics, 'technician_professionalism', 'staff_professionalism')
  WHERE vertical_id = ANY (_gt_verticals()) AND (asked ? 'technician_professionalism' OR topics ? 'technician_professionalism');
--> statement-breakpoint
DELETE FROM topic_proposal p
  WHERE p.topic_id = 'technician_professionalism' AND p.vertical_id = ANY (_gt_verticals())
    AND EXISTS (SELECT 1 FROM topic_proposal q WHERE q.vertical_id = p.vertical_id AND q.topic_id = 'staff_professionalism');
--> statement-breakpoint
UPDATE topic_proposal SET topic_id = 'staff_professionalism'
  WHERE topic_id = 'technician_professionalism' AND vertical_id = ANY (_gt_verticals());
--> statement-breakpoint
DELETE FROM decision_label l USING unnest(_gt_verticals()) AS v(id)
  WHERE l.question_key = 'theme_' || v.id || '__technician_professionalism'
    AND EXISTS (SELECT 1 FROM decision_label t WHERE t.sample_id = l.sample_id AND t.question_key = 'theme_' || v.id || '__staff_professionalism');
--> statement-breakpoint
UPDATE decision_label l SET question_key = 'theme_' || v.id || '__staff_professionalism'
  FROM unnest(_gt_verticals()) AS v(id)
  WHERE l.question_key = 'theme_' || v.id || '__technician_professionalism';
--> statement-breakpoint
UPDATE decision_sample SET
    questions = _gt_obj(questions, _gt_verticals()),
    primary_answers = CASE WHEN jsonb_typeof(primary_answers -> 'answers') = 'object'
      THEN jsonb_set(primary_answers, '{answers}', _gt_obj(primary_answers -> 'answers', _gt_verticals())) ELSE primary_answers END,
    fallback_answers = CASE WHEN jsonb_typeof(fallback_answers -> 'answers') = 'object'
      THEN jsonb_set(fallback_answers, '{answers}', _gt_obj(fallback_answers -> 'answers', _gt_verticals())) ELSE fallback_answers END,
    final_answers = _gt_obj(final_answers, _gt_verticals()),
    needs_review = _gt_keys(needs_review, _gt_verticals())
  WHERE strpos(questions::text || coalesce(primary_answers::text, '') || coalesce(fallback_answers::text, '')
               || final_answers::text || needs_review::text, '__technician_professionalism') > 0;
--> statement-breakpoint
UPDATE decision_review SET keys = _gt_keys(keys, _gt_verticals()), answers = _gt_obj(answers, _gt_verticals()),
    resolution = _gt_obj(resolution, _gt_verticals())
  WHERE strpos(keys::text || answers::text || coalesce(resolution::text, ''), '__technician_professionalism') > 0;
--> statement-breakpoint
UPDATE detected_change SET
    details = CASE WHEN details ->> 'topic' = 'technician_professionalism'
      THEN jsonb_set(details, '{topic}', '"staff_professionalism"') ELSE details END,
    block_key = CASE WHEN block_key = 'reviews:complaints:' || (details ->> 'verticalId') || ':technician_professionalism'
      THEN 'reviews:complaints:' || (details ->> 'verticalId') || ':staff_professionalism' ELSE block_key END
  WHERE details ->> 'verticalId' = ANY (_gt_verticals())
    AND (details ->> 'topic' = 'technician_professionalism' OR block_key LIKE '%:technician\_professionalism');
--> statement-breakpoint
UPDATE "event" SET details = jsonb_set(details, '{topic}', '"staff_professionalism"')
  WHERE details ->> 'topic' = 'technician_professionalism' AND details ->> 'verticalId' = ANY (_gt_verticals());
--> statement-breakpoint
UPDATE model_batch b SET items = (
    SELECT jsonb_object_agg(e.k, CASE WHEN e.k = ANY (_gt_verticals())
      THEN replace(e.v::text, '"technician_professionalism"', '"staff_professionalism"')::jsonb ELSE e.v END)
    FROM jsonb_each(b.items) AS e(k, v))
  WHERE jsonb_typeof(b.items) = 'object' AND strpos(b.items::text, '"technician_professionalism"') > 0;
--> statement-breakpoint
UPDATE vertical SET draft_evidence = replace(draft_evidence::text, '"technician_professionalism"', '"staff_professionalism"')::jsonb
  WHERE id = ANY (_gt_verticals()) AND strpos(coalesce(draft_evidence::text, ''), '"technician_professionalism"') > 0;
--> statement-breakpoint
UPDATE vertical_draft SET draft = replace(draft::text, '"technician_professionalism"', '"staff_professionalism"')::jsonb
  WHERE strpos(draft::text, '"technician_professionalism"') > 0;
--> statement-breakpoint
DROP FUNCTION _gt_keys(jsonb, text[]);
--> statement-breakpoint
DROP FUNCTION _gt_obj(jsonb, text[]);
--> statement-breakpoint
DROP FUNCTION _gt_arr(jsonb, text, text);
--> statement-breakpoint
DROP FUNCTION _gt_verticals();
