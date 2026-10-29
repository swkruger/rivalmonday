import type { WebEnv } from './env';

const DEFAULT_SITE_ORIGIN = 'https://rivalmonday.com';

/** Exact match against the allowed list (no prefix, suffix or trailing-slash tolerance); null when absent or not allowed. */
export function allowedOrigin(origin: string | null, allowed: readonly string[]): string | null {
  return origin !== null && allowed.includes(origin) ? origin : null;
}

/** Where the marketing site's waitlist form lives. */
export function siteJoinUrl(env: Pick<WebEnv, 'siteOrigins'>): string {
  return `${env.siteOrigins[0] ?? DEFAULT_SITE_ORIGIN}/#join`;
}
