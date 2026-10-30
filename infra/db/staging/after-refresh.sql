-- Staging only (docs/STAGING.md § Refresh). Runs as the staging branch owner right after the branch is reset from
-- cs_dev, before migrate and before the worker restarts. Nothing queued in dev may run, post or send from staging.
\set ON_ERROR_STOP on

-- Refuse anything that is not a cs_dev copy. The workflow only ever connects with the staging branch's owner URL.
DO $$
BEGIN
  IF current_database() <> 'cs_dev' THEN
    RAISE EXCEPTION 'after-refresh.sql: expected database cs_dev on the staging branch; nothing changed';
  END IF;
END $$;

BEGIN;

-- Dev sign-ins and magic links never carry over (staging has its own BETTER_AUTH_SECRET anyway).
DELETE FROM auth.session;
DELETE FROM auth.verification;
-- Dev MCP credentials (OAuth tokens, personal access tokens) must not work against staging.
DELETE FROM auth."oauthAccessToken";
DELETE FROM auth."oauthRefreshToken";
UPDATE oauth_grant_binding SET revoked_at = now() WHERE revoked_at IS NULL;
UPDATE api_token SET revoked_at = now() WHERE revoked_at IS NULL;

-- Dev Slack/Teams webhooks are real URLs: staging never posts to them. Re-add a staging webhook by hand if needed.
UPDATE agency_webhook SET active = false WHERE active;

-- Dev's unsent outbox rows are not staging's to send.
UPDATE notification SET status = 'skipped', error = 'staging refresh' WHERE status IN ('pending', 'sending');
UPDATE billing_notice SET sent_at = now(), last_error = 'staging refresh' WHERE sent_at IS NULL;

-- Dev's queued and running jobs belong to the dev worker; schedules stay (the worker re-registers them on start).
DO $$
BEGIN
  IF to_regclass('pgboss.job') IS NOT NULL THEN
    DELETE FROM pgboss.job WHERE state IN ('created', 'retry', 'active');
  END IF;
END $$;

COMMIT;
