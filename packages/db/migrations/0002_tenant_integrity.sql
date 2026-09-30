ALTER TABLE "client" ADD CONSTRAINT "client_id_agency_id_unique" UNIQUE("id","agency_id");
--> statement-breakpoint
ALTER TABLE "client_competitor" DROP CONSTRAINT "client_competitor_client_id_client_id_fk";
--> statement-breakpoint
ALTER TABLE "client_competitor" ADD CONSTRAINT "client_competitor_client_id_agency_id_client_id_agency_id_fk" FOREIGN KEY ("client_id","agency_id") REFERENCES "public"."client"("id","agency_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_competitor_competitor_idx" ON "client_competitor" USING btree ("competitor_id");
