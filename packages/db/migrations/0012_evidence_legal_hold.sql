ALTER TABLE "capture" DROP CONSTRAINT "capture_competitor_id_competitor_id_fk";
--> statement-breakpoint
ALTER TABLE "capture" DROP CONSTRAINT "capture_tracked_page_id_tracked_page_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_capture_id_capture_id_fk";
--> statement-breakpoint
ALTER TABLE "capture" ADD COLUMN "legal_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_competitor_id_competitor_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_tracked_page_id_tracked_page_id_fk" FOREIGN KEY ("tracked_page_id") REFERENCES "public"."tracked_page"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_capture_id_capture_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."capture"("id") ON DELETE restrict ON UPDATE no action;