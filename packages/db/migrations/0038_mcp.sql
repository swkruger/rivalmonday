CREATE TABLE "api_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "api_token_name_check" CHECK (length(name) BETWEEN 1 AND 80),
	CONSTRAINT "api_token_scope_check" CHECK (scope IN ('read', 'feedback', 'manage'))
);
--> statement-breakpoint
CREATE TABLE "mcp_rate_window" (
	"token_key" text NOT NULL,
	"window_kind" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mcp_rate_window_token_key_window_kind_window_start_pk" PRIMARY KEY("token_key","window_kind","window_start"),
	CONSTRAINT "mcp_rate_window_kind_check" CHECK (window_kind IN ('minute', 'day'))
);
--> statement-breakpoint
CREATE TABLE "oauth_grant_binding" (
	"consent_id" text PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"oauth_client_id" text NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"client_id" uuid,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "oauth_grant_binding_id_unique" UNIQUE("id"),
	CONSTRAINT "oauth_grant_binding_scope_check" CHECK (scope IN ('read', 'feedback', 'manage'))
);
--> statement-breakpoint
ALTER TABLE "recommendation" DROP CONSTRAINT "recommendation_source_check";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "channel" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "token_id" uuid;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant_binding" ADD CONSTRAINT "oauth_grant_binding_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant_binding" ADD CONSTRAINT "oauth_grant_binding_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_token_user_idx" ON "api_token" USING btree ("user_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "api_token_agency_idx" ON "api_token" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "oauth_grant_binding_user_idx" ON "oauth_grant_binding" USING btree ("user_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "oauth_grant_binding_agency_idx" ON "oauth_grant_binding" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "audit_log_token_created_idx" ON "audit_log" USING btree ("token_id","created_at") WHERE token_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendation" ADD CONSTRAINT "recommendation_source_check" CHECK (source IN ('brief', 'move', 'ask', 'mcp'));--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_channel_check" CHECK (channel IN ('web', 'mcp', 'ask'));