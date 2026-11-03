import { EMAIL_FROM_PROBLEM, isBareEmailAddress } from '@cs/email/branding';

/** 7c2: `SERVICE_DATABASE_POOLED_URL` too — the daemon sizes its app pool from the concurrency table (~33), too many for the direct URL. */
export const REQUIRED_PROD_ENV: readonly string[] = [
  'DATABASE_URL', 'SERVICE_DATABASE_URL', 'SERVICE_DATABASE_POOLED_URL', 'APP_URL', 'LINK_SIGNING_SECRET', 'EMAIL_FROM', 'POSTMARK_SERVER_TOKEN',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'OPENROUTER_API_KEY', 'SENTRY_DSN',
];

/** Names of required env vars that are unset or blank; always [] outside production. */
export function missingProdEnv(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return REQUIRED_PROD_ENV.filter((k) => !env[k]?.trim());
}

/** `EMAIL_FROM` must be a bare address (templates add the display name); unset is fine here (`missingProdEnv` covers production). */
export function emailFromErrors(env: NodeJS.ProcessEnv): string[] {
  const from = env.EMAIL_FROM?.trim();
  return from && !isBareEmailAddress(from) ? [EMAIL_FROM_PROBLEM] : [];
}

/** Rehearsal switches (7c2 spec §4): they only work on staging or outside production. */
export const REHEARSAL_ENV = ['AI_PROVIDER_MODE', 'REHEARSAL_LIVE_CLIENT_IDS', 'VENDOR_FAKE_MODE', 'CRAWL_HOST_ALLOWLIST', 'VENDOR_LIVE_RANK_SCANS'] as const;

/**
 * Real keys `VENDOR_LIVE_RANK_SCANS=true` needs: under `VENDOR_FAKE_MODE=fixtures` it sends rank scans (DataForSEO maps)
 * and rank-map images (Stadia) to the real vendors. Unset, blank or the fixture-mode dummy `fixture` refuses.
 */
export const LIVE_RANK_KEYS = ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD', 'STADIA_API_KEY'] as const;

/** Rehearsal tooling may run only on staging (`SENTRY_ENVIRONMENT=staging`) or when `NODE_ENV` is set and not production. */
export function rehearsalAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.SENTRY_ENVIRONMENT === 'staging' || (env.NODE_ENV !== undefined && env.NODE_ENV !== 'production');
}

/** Spec §4 Env: rehearsal switches only on staging or outside production. Fail closed: anything unclear refuses. */
export function rehearsalEnvErrors(env: NodeJS.ProcessEnv): string[] {
  const set = REHEARSAL_ENV.filter((k) => (env[k] ?? '').trim() !== '');
  const staging = env.SENTRY_ENVIRONMENT === 'staging';
  const allowed = rehearsalAllowed(env);
  const errors: string[] = [];
  if (set.length > 0 && !allowed) errors.push(`refusing rehearsal settings outside staging: ${set.join(', ')}`);
  if (env.AI_PROVIDER_MODE && !['live', 'rehearsal'].includes(env.AI_PROVIDER_MODE)) errors.push('AI_PROVIDER_MODE must be live or rehearsal');
  if (env.VENDOR_FAKE_MODE && env.VENDOR_FAKE_MODE !== 'fixtures') errors.push('VENDOR_FAKE_MODE must be fixtures');
  const liveRanks = (env.VENDOR_LIVE_RANK_SCANS ?? '').trim();
  if (liveRanks) {
    if (liveRanks !== 'true') errors.push('VENDOR_LIVE_RANK_SCANS must be true');
    // Without fixture mode every vendor is live already; the switch would mean nothing, so it is a mistake.
    if (env.VENDOR_FAKE_MODE !== 'fixtures') errors.push('VENDOR_LIVE_RANK_SCANS needs VENDOR_FAKE_MODE=fixtures');
    const fake = LIVE_RANK_KEYS.filter((k) => ['', 'fixture'].includes((env[k] ?? '').trim()));
    if (fake.length > 0) errors.push(`VENDOR_LIVE_RANK_SCANS needs real ${fake.join(', ')}`);
  }
  if ((env.CRAWL_HOST_ALLOWLIST ?? '').trim() && !(env.CRAWL_HOST_ALLOWLIST ?? '').split(',').some((h) => h.trim())) errors.push('CRAWL_HOST_ALLOWLIST has no hosts');
  if (staging && env.WEB_MONITORING_ENABLED === 'true' && !(env.CRAWL_HOST_ALLOWLIST ?? '').trim()) errors.push('staging crawling requires CRAWL_HOST_ALLOWLIST');
  if (staging && env.AI_PROVIDER_MODE !== 'rehearsal' && (env.REHEARSAL_LIVE_CLIENT_IDS ?? '').trim()) errors.push('REHEARSAL_LIVE_CLIENT_IDS needs AI_PROVIDER_MODE=rehearsal');
  return errors;
}
