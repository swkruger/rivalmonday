export const REQUIRED_PROD_ENV: readonly string[] = [
  'DATABASE_URL', 'SERVICE_DATABASE_URL', 'APP_URL', 'LINK_SIGNING_SECRET', 'EMAIL_FROM', 'POSTMARK_SERVER_TOKEN',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'OPENROUTER_API_KEY', 'TYPESAFE_API_KEY', 'SENTRY_DSN',
];

/** Names of required env vars that are unset or blank; always [] outside production. */
export function missingProdEnv(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return REQUIRED_PROD_ENV.filter((k) => !env[k]?.trim());
}

/** Rehearsal switches (7c2 spec §4): they only work on staging or outside production. */
export const REHEARSAL_ENV = ['AI_PROVIDER_MODE', 'REHEARSAL_LIVE_CLIENT_IDS', 'VENDOR_FAKE_MODE', 'CRAWL_HOST_ALLOWLIST'] as const;

/** Spec §4 Env: rehearsal switches only on staging or outside production. Fail closed: anything unclear refuses. */
export function rehearsalEnvErrors(env: NodeJS.ProcessEnv): string[] {
  const set = REHEARSAL_ENV.filter((k) => (env[k] ?? '').trim() !== '');
  const staging = env.SENTRY_ENVIRONMENT === 'staging';
  const allowed = staging || (env.NODE_ENV !== undefined && env.NODE_ENV !== 'production');
  const errors: string[] = [];
  if (set.length > 0 && !allowed) errors.push(`refusing rehearsal settings outside staging: ${set.join(', ')}`);
  if (env.AI_PROVIDER_MODE && !['live', 'rehearsal'].includes(env.AI_PROVIDER_MODE)) errors.push('AI_PROVIDER_MODE must be live or rehearsal');
  if (env.VENDOR_FAKE_MODE && env.VENDOR_FAKE_MODE !== 'fixtures') errors.push('VENDOR_FAKE_MODE must be fixtures');
  if (staging && env.WEB_MONITORING_ENABLED === 'true' && !(env.CRAWL_HOST_ALLOWLIST ?? '').trim()) errors.push('staging crawling requires CRAWL_HOST_ALLOWLIST');
  if (staging && env.AI_PROVIDER_MODE !== 'rehearsal' && (env.REHEARSAL_LIVE_CLIENT_IDS ?? '').trim()) errors.push('REHEARSAL_LIVE_CLIENT_IDS needs AI_PROVIDER_MODE=rehearsal');
  return errors;
}
