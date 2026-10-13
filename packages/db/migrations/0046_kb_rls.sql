-- Phase 6c: knowledge-base RLS. app_user is read-only (writes run on the service connection inside platform tools).
-- app_role() is NULL when unset, so `NOT IN (...)` is NULL and the row stays hidden unless client_visible is true.
REVOKE ALL ON kb_article, kb_chunk FROM app_user;
--> statement-breakpoint
GRANT SELECT ON kb_article, kb_chunk TO app_user;
--> statement-breakpoint
ALTER TABLE kb_article ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kb_article FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_article_read ON kb_article FOR SELECT USING (
  status = 'published' AND (
    level = 'platform'
    OR (level = 'agency' AND agency_id = app_agency_id()
        AND (client_visible OR app_role() NOT IN ('client_owner','client_viewer')))
    OR (level = 'client' AND agency_id = app_agency_id() AND app_client_visible(client_id))));
--> statement-breakpoint
ALTER TABLE kb_chunk ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kb_chunk FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kb_chunk_read ON kb_chunk FOR SELECT USING (
  level = 'platform'
  OR (level = 'agency' AND agency_id = app_agency_id()
      AND (client_visible OR app_role() NOT IN ('client_owner','client_viewer')))
  OR (level = 'client' AND agency_id = app_agency_id() AND app_client_visible(client_id)));
