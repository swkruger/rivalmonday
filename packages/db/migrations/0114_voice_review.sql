ALTER TABLE "brief" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "brief" ADD COLUMN "review_terms" jsonb;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "review_terms" jsonb;--> statement-breakpoint
ALTER TABLE "brief" ADD CONSTRAINT "brief_review_reason_check" CHECK (review_reason IN ('banned_term'));--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_review_reason_check" CHECK (review_reason IN ('banned_term'));--> statement-breakpoint
-- Hand-added (V10): the sample agency's host slug no longer carries the product name.
DO $$ DECLARE sid uuid; BEGIN
  SELECT (value->>'agencyId')::uuid INTO sid FROM platform_setting WHERE key = 'sample_agency_id';
  IF sid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('agency_host_slug'));
    UPDATE agency SET host_slug = agency_host_slug_for('Samples', id)
     WHERE id = sid AND host_slug ~ '^rival-monday-samples(-[0-9]+)?$';
  END IF;
END $$;
