-- Phase 13a1: agency web/sending domains (spec 13a § Data model) and agency.host_slug (P1/R4, plan Appendix A § 0111).
CREATE TABLE "agency_domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dns_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"live_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	CONSTRAINT "agency_domain_status_check" CHECK ("agency_domain"."status" IN ('pending','verifying','live','failed','removed'))
);
--> statement-breakpoint
CREATE TABLE "agency_sending_domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"local_part" text DEFAULT 'briefs' NOT NULL,
	"postmark_domain_id" bigint,
	"dkim_host" text,
	"dkim_value" text,
	"return_path_host" text,
	"return_path_value" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"dmarc_ok" boolean,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	CONSTRAINT "agency_sending_domain_status_check" CHECK ("agency_sending_domain"."status" IN ('pending','verified','failed','removed')),
	CONSTRAINT "agency_sending_domain_local_part_check" CHECK ("agency_sending_domain"."local_part" ~ '^[a-z0-9][a-z0-9._-]{0,39}$')
);
--> statement-breakpoint
ALTER TABLE "agency_domain" ADD CONSTRAINT "agency_domain_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_sending_domain" ADD CONSTRAINT "agency_sending_domain_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_domain_hostname_active" ON "agency_domain" USING btree ("hostname") WHERE "agency_domain"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "agency_domain_one_per_agency" ON "agency_domain" USING btree ("agency_id") WHERE "agency_domain"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "agency_sending_domain_one_per_agency" ON "agency_sending_domain" USING btree ("agency_id") WHERE "agency_sending_domain"."status" <> 'removed';--> statement-breakpoint
ALTER TABLE "agency" ADD COLUMN "host_slug" text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION agency_host_slug_for(p_name text, p_self uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  reserved constant text[] := ARRAY['www','mcp','mail','app','api','admin','support'];
  base text; candidate text; intake text; n int := 1;
BEGIN
  -- R4: the agency's intake slug (same regex, already public) when it is free and not reserved.
  IF p_self IS NOT NULL THEN
    SELECT slug INTO intake FROM intake_link WHERE agency_id = p_self;
    IF intake IS NOT NULL AND NOT (intake = ANY (reserved))
       AND NOT EXISTS (SELECT 1 FROM agency WHERE host_slug = intake AND id <> p_self) THEN
      RETURN intake;
    END IF;
  END IF;
  -- Else the name, as `slugBase` (@cs/tools tools/leads.ts) builds an intake slug.
  base := lower(regexp_replace(normalize(coalesce(p_name, ''), NFKD), '[̀-ͯ]', '', 'g'));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  base := regexp_replace(left(base, 40), '-+$', '');
  IF base = '' THEN base := 'agency';
  ELSIF length(base) < 3 OR base = ANY (reserved) THEN base := base || '-agency';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM agency WHERE host_slug = candidate AND (p_self IS NULL OR id <> p_self)) LOOP
    n := n + 1;
    candidate := regexp_replace(left(base, 39 - length(n::text)), '-+$', '') || '-' || n;
  END LOOP;
  RETURN candidate;
END $$;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
  -- Agencies with an intake link first, so a name-derived slug never takes an intake slug (R4).
  FOR r IN SELECT a.id, a.name FROM agency a
           ORDER BY (EXISTS (SELECT 1 FROM intake_link i WHERE i.agency_id = a.id)) DESC, a.created_at, a.id LOOP
    UPDATE agency SET host_slug = agency_host_slug_for(r.name, r.id) WHERE id = r.id;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION agency_host_slug_fill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.host_slug IS NULL THEN
    -- Serialises concurrent sign-ups with the same name; each query in the VOLATILE function sees committed rows.
    PERFORM pg_advisory_xact_lock(hashtext('agency_host_slug'));
    NEW.host_slug := agency_host_slug_for(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER agency_host_slug_fill BEFORE INSERT ON agency FOR EACH ROW EXECUTE FUNCTION agency_host_slug_fill();
--> statement-breakpoint
ALTER TABLE "agency" ALTER COLUMN "host_slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "agency" ADD CONSTRAINT "agency_host_slug_unique" UNIQUE ("host_slug");
--> statement-breakpoint
ALTER TABLE "agency" ADD CONSTRAINT "agency_host_slug_check" CHECK (host_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$' AND host_slug NOT IN ('www','mcp','mail','app','api','admin','support'));
