REVOKE INSERT, UPDATE, DELETE ON decision_sample, decision_label, model_batch, score_failure FROM app_user;
--> statement-breakpoint
ALTER TABLE decision_sample ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_sample FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_label ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE decision_label FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE model_batch ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE model_batch FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE score_failure ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE score_failure FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Phase 3d decision 21: a table-wide UPDATE let app_user point client.self_competitor_id at any competitor and so
-- gain RLS visibility of it. Postgres has no column-level REVOKE finer than the table grant, so revoke the table
-- grant and re-grant the editable columns one by one.
REVOKE UPDATE ON client FROM app_user;
--> statement-breakpoint
GRANT UPDATE (name, vertical_id, features, services, keywords, service_area, place_id, score_thresholds) ON client TO app_user;
