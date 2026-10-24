ALTER TABLE "ask_thread" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ask_thread_user_live_idx" ON "ask_thread" USING btree ("client_id","user_id","updated_at" DESC NULLS LAST) WHERE "ask_thread"."deleted_at" IS NULL;--> statement-breakpoint
-- 0043 granted app_user only UPDATE (title, updated_at); the soft delete is an UPDATE by the owner (RLS ask_thread_owner).
GRANT UPDATE (deleted_at) ON ask_thread TO app_user;
