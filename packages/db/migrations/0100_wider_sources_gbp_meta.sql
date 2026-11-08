DROP INDEX "price_point_open_unique";--> statement-breakpoint
ALTER TABLE "price_point" ALTER COLUMN "tracked_page_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "price_point" ADD COLUMN "ad_id" uuid;--> statement-breakpoint
ALTER TABLE "ad" ADD COLUMN "event" jsonb;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_ad_id_ad_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_point_ad_open_unique" ON "price_point" USING btree ("ad_id","vertical_id","service_id","unit","qualifier","amount") WHERE ended_at IS NULL AND ad_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "price_point_ad_idx" ON "price_point" USING btree ("ad_id") WHERE ad_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "price_point_open_unique" ON "price_point" USING btree ("tracked_page_id","vertical_id","service_id","unit","qualifier","amount") WHERE ended_at IS NULL AND tracked_page_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "price_point" ADD CONSTRAINT "price_point_subject_check" CHECK ((tracked_page_id IS NULL) <> (ad_id IS NULL));
--> statement-breakpoint
-- 18a-1 D1: new change-type weights, audience size curve, scoring v5 for the shipped packs. DB-created verticals
-- inherit generic's via assemblePack. vertical.updated_at left alone (see 0099). Idempotent.
-- backfill:start
UPDATE vertical
SET config = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(config,
      '{type_weights,status_change}', '1.0'::jsonb, true),
      '{type_weights,profile_change}', '0.8'::jsonb, true),
      '{type_weights,audience_growth}', '0.7'::jsonb, true),
      '{scoring,size,audience_pct_for_full}', '20'::jsonb, true),
      '{scoring,version}', '5'::jsonb, true)
WHERE id IN ('generic', 'hvac_plumbing', 'dental')
  AND jsonb_typeof(config -> 'type_weights') = 'object'
  AND jsonb_typeof(config #> '{scoring,size}') = 'object'
  AND coalesce((config #>> '{scoring,version}')::int, 0) < 5;
