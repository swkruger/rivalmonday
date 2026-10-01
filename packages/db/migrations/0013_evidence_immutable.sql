-- Spec §4.4: captures and evidence are immutable and append-only. Triggers bind every role,
-- including the table owner; the only permitted change is toggling capture.legal_hold.
-- Retention deletion (spec §4.5, Phase 7) must add its own audited path that honours legal_hold.
CREATE OR REPLACE FUNCTION evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'capture'
     AND (to_jsonb(NEW) - 'legal_hold') = (to_jsonb(OLD) - 'legal_hold') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% rows are immutable evidence (% refused)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER capture_immutable BEFORE UPDATE OR DELETE ON capture FOR EACH ROW EXECUTE FUNCTION evidence_guard();
--> statement-breakpoint
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION evidence_guard();
--> statement-breakpoint
REVOKE UPDATE, DELETE ON capture, evidence FROM app_service;
--> statement-breakpoint
GRANT UPDATE (legal_hold) ON capture TO app_service;
