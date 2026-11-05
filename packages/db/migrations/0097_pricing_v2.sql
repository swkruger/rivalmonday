ALTER TABLE plan
  ADD COLUMN seat_tiers jsonb,
  ADD COLUMN base_price_year_cents integer CHECK (base_price_year_cents IS NULL OR base_price_year_cents >= 0),
  ADD COLUMN stripe_base_price_year_id text,
  ADD COLUMN stripe_seat_price_year_id text;
--> statement-breakpoint
UPDATE plan SET seat_tiers = jsonb_build_array(jsonb_build_object('upTo', NULL, 'unitCents', seat_price_cents));
--> statement-breakpoint
ALTER TABLE plan ALTER COLUMN seat_tiers SET NOT NULL,
  ADD CONSTRAINT plan_seat_tiers_check CHECK (jsonb_typeof(seat_tiers) = 'array' AND jsonb_array_length(seat_tiers) BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE plan DROP COLUMN seat_price_cents;
--> statement-breakpoint
ALTER TABLE agency_billing
  ADD COLUMN billing_interval text NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year'));
--> statement-breakpoint
ALTER TABLE pending_signup
  ADD COLUMN website text,
  ADD COLUMN clients_served text CHECK (clients_served IS NULL OR clients_served IN ('0', '1-5', '6-20', '21+'));
--> statement-breakpoint
ALTER TABLE agency_onboarding
  ADD COLUMN clients_served text CHECK (clients_served IS NULL OR clients_served IN ('0', '1-5', '6-20', '21+'));
