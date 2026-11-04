const REQUIRED = [
  'STAGING_DB_DIRECT_HOST', 'STAGING_DB_POOLED_HOST', 'WORKER_DATABASE_URL', 'SERVICE_DATABASE_URL', 'SERVICE_DATABASE_POOLED_URL',
  'APP_URL', 'LINK_SIGNING_SECRET', 'EMAIL_FROM', 'POSTMARK_SERVER_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET',
  'OPENROUTER_API_KEY', 'REVIEWER_HASH_SALT', 'SENTRY_DSN', 'SENTRY_ENVIRONMENT', 'VENDOR_FAKE_MODE',
] as const;

/** Copied from the file to the worker: everything required except the file-only names. */
const PASSED = REQUIRED.filter((k) => !['STAGING_DB_DIRECT_HOST', 'STAGING_DB_POOLED_HOST', 'WORKER_DATABASE_URL'].includes(k));

/** Never inherited from the shell (STAGING.md § 2): staging crawls nothing, pays no vendor (except opt-in rank scans, from the file) and has no dev panel. */
const DROPPED_FROM_SHELL = [
  'WEB_MONITORING_ENABLED', 'AI_PROVIDER_MODE', 'REHEARSAL_LIVE_CLIENT_IDS', 'CRAWL_HOST_ALLOWLIST', 'VENDOR_LIVE_RANK_SCANS',
  'DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD', 'APIFY_TOKEN', 'SCRAPECREATORS_API_KEY', 'STADIA_API_KEY',
  'DEV_PANEL', 'RM_DEV_ENV_FILE', 'EVIDENCE_FS_DIR',
];

/** Copied from the file only when it sets `VENDOR_LIVE_RANK_SCANS`: real rank scans + rank maps (STAGING.md § 2); the worker refuses missing or dummy keys. */
const LIVE_RANK_PASSED = ['VENDOR_LIVE_RANK_SCANS', 'DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD', 'STADIA_API_KEY'] as const;

/** Errors name the variable only: these URLs carry passwords. */
function assertDbUrl(key: string, value: string, role: string, host: string): void {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`${key} is not a valid URL`);
  }
  if (u.hostname !== host || u.username !== role || u.pathname !== '/cs_dev') {
    throw new Error(`Refusing ${key}: it must be role ${role}, database cs_dev, on host ${host}`);
  }
}

/**
 * docs/STAGING.md § Local worker: the environment of the local staging worker, from `.env.staging` and the shell.
 * Throws unless the file really describes staging, so this process can never start against cs_dev or production.
 */
export function stagingWorkerEnv(file: Record<string, string | undefined>, shell: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const missing = REQUIRED.filter((k) => !file[k]?.trim());
  if (missing.length) throw new Error(`Fill in ${missing.join(', ')} in .env.staging`);

  if (file.SENTRY_ENVIRONMENT !== 'staging') throw new Error('Refusing: SENTRY_ENVIRONMENT must be staging');
  if (file.VENDOR_FAKE_MODE !== 'fixtures') throw new Error('Refusing: VENDOR_FAKE_MODE must be fixtures');
  if (!file.R2_BUCKET!.trim().endsWith('-staging')) throw new Error('Refusing: only a bucket whose name ends in -staging is a target');

  const direct = file.STAGING_DB_DIRECT_HOST!.trim();
  assertDbUrl('WORKER_DATABASE_URL', file.WORKER_DATABASE_URL!, 'cs_worker', direct);
  assertDbUrl('SERVICE_DATABASE_URL', file.SERVICE_DATABASE_URL!, 'app_service', direct);
  assertDbUrl('SERVICE_DATABASE_POOLED_URL', file.SERVICE_DATABASE_POOLED_URL!, 'app_service', file.STAGING_DB_POOLED_HOST!.trim());

  const env: NodeJS.ProcessEnv = { ...shell };
  for (const k of DROPPED_FROM_SHELL) delete env[k];
  for (const k of PASSED) env[k] = file[k];
  const live = file.VENDOR_LIVE_RANK_SCANS?.trim();
  if (live && live !== 'true') throw new Error('VENDOR_LIVE_RANK_SCANS must be true; remove the line to turn it off');
  if (live) for (const k of LIVE_RANK_PASSED) if (file[k] !== undefined) env[k] = file[k];
  env.DATABASE_URL = file.WORKER_DATABASE_URL;
  env.NODE_ENV = 'production';
  // 8080 is the dev worker's default; both can run side by side.
  env.PORT = '8081';
  return env;
}
