-- Competitor-search frequency cap (owner decision 2026-10-15): a monthly automatic refresh starts runs with trigger 'scheduled'.
ALTER TABLE "discovery_run" DROP CONSTRAINT "discovery_run_trigger_check";--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "discovery_run_trigger_check" CHECK ("discovery_run"."trigger" IN ('auto','manual','convert','scheduled'));
