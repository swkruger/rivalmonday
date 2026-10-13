CREATE TABLE "kb_article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"agency_id" uuid,
	"client_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"previous_body_md" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"client_visible" boolean DEFAULT true NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"seed_key" text,
	"auto_sync" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"sync_failures" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_article_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "kb_article_level_check" CHECK (level IN ('platform','agency','client')),
	CONSTRAINT "kb_article_kind_check" CHECK (kind IN ('help','playbook','qa','blog','fact')),
	CONSTRAINT "kb_article_title_check" CHECK (char_length(title) BETWEEN 1 AND 200),
	CONSTRAINT "kb_article_body_check" CHECK (octet_length(body_md) <= 204800),
	CONSTRAINT "kb_article_status_check" CHECK (status IN ('draft','published')),
	CONSTRAINT "kb_article_source_check" CHECK (source IN ('manual','url','seed')),
	CONSTRAINT "kb_article_scope_check" CHECK ((level = 'platform' AND agency_id IS NULL AND client_id IS NULL)
        OR (level = 'agency' AND agency_id IS NOT NULL AND client_id IS NULL)
        OR (level = 'client' AND agency_id IS NOT NULL AND client_id IS NOT NULL)),
	CONSTRAINT "kb_article_url_check" CHECK ((source = 'url') = (source_url IS NOT NULL)),
	CONSTRAINT "kb_article_seed_check" CHECK (source = 'seed' OR seed_key IS NULL),
	CONSTRAINT "kb_article_autosync_check" CHECK (NOT auto_sync OR source = 'url')
);
--> statement-breakpoint
CREATE TABLE "kb_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"level" text NOT NULL,
	"agency_id" uuid,
	"client_id" uuid,
	"client_visible" boolean DEFAULT true NOT NULL,
	"ord" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(512),
	CONSTRAINT "kb_chunk_article_id_ord_unique" UNIQUE("article_id","ord")
);
--> statement-breakpoint
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunk" ADD CONSTRAINT "kb_chunk_article_id_kb_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."kb_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_article_scope_idx" ON "kb_article" USING btree ("level","agency_id","client_id","status");--> statement-breakpoint
-- SQL-only, as 0039: Drizzle cannot express generated tsvector columns.
ALTER TABLE "kb_chunk" ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;
--> statement-breakpoint
CREATE INDEX "kb_chunk_tsv_idx" ON "kb_chunk" USING gin ("search_tsv");
