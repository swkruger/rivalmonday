ALTER TABLE theme_proposal RENAME TO topic_proposal;
--> statement-breakpoint
ALTER TABLE topic_proposal RENAME COLUMN theme_id TO topic_id;
--> statement-breakpoint
ALTER TABLE topic_proposal RENAME CONSTRAINT theme_proposal_pkey TO topic_proposal_pkey;
--> statement-breakpoint
ALTER INDEX theme_proposal_live_unique RENAME TO topic_proposal_live_unique;
--> statement-breakpoint
ALTER INDEX theme_proposal_pending_unique RENAME TO topic_proposal_pending_unique;
--> statement-breakpoint
ALTER INDEX theme_proposal_vertical_idx RENAME TO topic_proposal_vertical_idx;
--> statement-breakpoint
ALTER TABLE review_analysis RENAME COLUMN themes TO topics;
--> statement-breakpoint
-- backfill:start
CREATE OR REPLACE FUNCTION topic_rename_ids(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(
           regexp_replace(regexp_replace(regexp_replace(t,
             '\mtheme_weakness\M', 'topic_weakness', 'g'),
             '\mtheme_strength\M', 'topic_strength', 'g'),
             '\mfix_theme\M', 'fix_topic', 'g'),
           '{{theme}}', '{{topic}}')
$$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM runbook_item a JOIN runbook_item b
               ON b.runbook_id = a.runbook_id AND b.item_key = topic_rename_ids(a.item_key)
             WHERE a.item_key <> topic_rename_ids(a.item_key))
  OR EXISTS (SELECT 1 FROM playbook_override a JOIN playbook_override b
               ON b.agency_id = a.agency_id AND b.vertical_id = a.vertical_id AND b.playbook_id = 'fix_topic'
             WHERE a.playbook_id = 'fix_theme')
  THEN RAISE EXCEPTION 'topic_rename: old and new ids both present'; END IF;
END $$;
--> statement-breakpoint
UPDATE vertical SET config = (config - 'themes') || jsonb_build_object('topics', config -> 'themes')
  WHERE jsonb_typeof(config) = 'object' AND config ? 'themes';
--> statement-breakpoint
UPDATE vertical SET draft_evidence = (draft_evidence - 'themes') || jsonb_build_object('topics', draft_evidence -> 'themes')
  WHERE jsonb_typeof(draft_evidence) = 'object' AND draft_evidence ? 'themes';
--> statement-breakpoint
UPDATE vertical_draft SET draft = (draft - 'themes') || jsonb_build_object('topics', draft -> 'themes')
  WHERE jsonb_typeof(draft) = 'object' AND draft ? 'themes';
--> statement-breakpoint
UPDATE vertical SET config = topic_rename_ids(config::text)::jsonb WHERE config::text <> topic_rename_ids(config::text);
--> statement-breakpoint
UPDATE vertical SET draft_evidence = topic_rename_ids(draft_evidence::text)::jsonb
  WHERE draft_evidence IS NOT NULL AND draft_evidence::text <> topic_rename_ids(draft_evidence::text);
--> statement-breakpoint
UPDATE vertical_draft SET draft = topic_rename_ids(draft::text)::jsonb WHERE draft::text <> topic_rename_ids(draft::text);
--> statement-breakpoint
UPDATE runbook_item SET
    item_key = topic_rename_ids(item_key),
    content = topic_rename_ids(content::text)::jsonb,
    upstream_snapshot = CASE WHEN upstream_snapshot IS NULL THEN NULL ELSE topic_rename_ids(upstream_snapshot::text)::jsonb END
  WHERE item_key <> topic_rename_ids(item_key)
     OR content::text <> topic_rename_ids(content::text)
     OR coalesce(upstream_snapshot::text, '') <> topic_rename_ids(coalesce(upstream_snapshot::text, ''));
--> statement-breakpoint
UPDATE playbook_override SET playbook_id = topic_rename_ids(playbook_id),
    template = CASE WHEN template IS NULL THEN NULL ELSE topic_rename_ids(template) END
  WHERE playbook_id <> topic_rename_ids(playbook_id) OR coalesce(template, '') <> topic_rename_ids(coalesce(template, ''));
--> statement-breakpoint
UPDATE brief_item SET playbook_id = 'fix_topic' WHERE playbook_id = 'fix_theme';
--> statement-breakpoint
UPDATE recommendation SET playbook_id = 'fix_topic' WHERE playbook_id = 'fix_theme';
--> statement-breakpoint
UPDATE detected_change SET details = (details - 'theme' - 'themeName')
    || jsonb_build_object('topic', details -> 'theme')
    || CASE WHEN details ? 'themeName' THEN jsonb_build_object('topicName', details -> 'themeName') ELSE '{}'::jsonb END
  WHERE details ? 'theme';
--> statement-breakpoint
UPDATE "event" SET details = (details - 'theme' - 'themeName')
    || jsonb_build_object('topic', details -> 'theme')
    || CASE WHEN details ? 'themeName' THEN jsonb_build_object('topicName', details -> 'themeName') ELSE '{}'::jsonb END
  WHERE details ? 'theme';
--> statement-breakpoint
UPDATE move SET details = jsonb_set(details #- '{facts,theme}', '{facts,topic}', details #> '{facts,theme}')
  WHERE details #> '{facts,theme}' IS NOT NULL;
--> statement-breakpoint
UPDATE model_batch SET items = (
    SELECT jsonb_object_agg(k, CASE WHEN jsonb_typeof(v) = 'object' AND v ? 'themeIds'
                                    THEN (v - 'themeIds') || jsonb_build_object('topicIds', v -> 'themeIds') ELSE v END)
    FROM jsonb_each(items) AS e(k, v))
  WHERE jsonb_typeof(items) = 'object'
    AND EXISTS (SELECT 1 FROM jsonb_each(items) AS e(k, v) WHERE jsonb_typeof(v) = 'object' AND v ? 'themeIds');
--> statement-breakpoint
DROP FUNCTION topic_rename_ids(text);
