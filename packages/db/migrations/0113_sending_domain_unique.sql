-- Phase 13a1 Task 10 review: one agency at a time may hold a sending domain (the Postmark account is shared; a second
-- agency must never adopt another's domain). Mirrors agency_domain_hostname_active.
CREATE UNIQUE INDEX IF NOT EXISTS "agency_sending_domain_domain_active" ON "agency_sending_domain" USING btree ("domain") WHERE "agency_sending_domain"."status" <> 'removed';
