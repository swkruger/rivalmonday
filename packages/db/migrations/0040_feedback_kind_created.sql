ALTER TABLE "feedback" DROP CONSTRAINT "feedback_kind_check";--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_kind_check" CHECK (kind IN ('edit', 'drop', 'reorder', 'rating', 'status', 'created'));
