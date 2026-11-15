import 'server-only';
import { isUuid, MIN_LINK_SECRET_LENGTH, normalizeAdminEmails } from '@cs/core';
import { type HostEnv, parseHostEnv } from '@cs/db';
import { EMAIL_FROM_PROBLEM, isBareEmailAddress } from '@cs/email/branding';

export interface WebEnv {
  appUrl: string;
  /**
   * 13a1 (P2, N2): host routing env from `parseHostEnv`. Non-null after a clean parse. A missing `NEUTRAL_DOMAIN` refuses to boot only
   * when `VERCEL_ENV=production`; elsewhere agency/mcp hosts nest under APP_URL's own host (the R7 staging form).
   */
  hostEnv: HostEnv;
  appDatabaseUrl: string;
  serviceDatabaseUrl: string;
  /** Owner URL for pg-boss enqueue (decision 8; least privilege is a Phase 7 item). */
  queueDatabaseUrl: string;
  authSecret: string;
  linkSecrets: string[];
  emailFrom: string;
  google: { clientId: string; clientSecret: string } | null;
  defaultAgencyId: string | null;
  /** Decision 7 (5b-1): crawl competitor websites only when explicitly enabled (no bot page yet). */
  webMonitoring: boolean;
  /** Phase 6c: KB_IMPORT_ENABLED === 'true' enables URL import and weekly sync. */
  kbImport: boolean;
  /** 5b-2 decision 2: emails of platform operators (lower-cased). */
  platformAdmins: string[];
  /** 6b Q1: Ask runs on a deterministic scripted AI (E2E only; refused when VERCEL_ENV=production). */
  askFakeAi: boolean;
  /** Phase 11a: `find_business` answers from a fixed fixture (E2E only; refused when VERCEL_ENV=production). DEMO/TEST always use the fixture regardless. */
  setupFakeLookup: boolean;
  /** 15c-2a T10: `test_webhook` posts to an in-process fake receiver instead of Slack/Teams (E2E only; refused when VERCEL_ENV=production). */
  webhookFakeSend: boolean;
  /** Phase 10: all optional. No Turnstile secret => the fake verifier; `supportReplyTo` is the Reply-To of lifecycle emails. */
  turnstile?: { siteKey?: string; secretKey?: string };
  supportReplyTo?: string;
  /** Phase 17a: origins of the marketing site (SITE_ORIGIN first, then SITE_ORIGIN_EXTRA, comma-separated). Entries that are not a bare origin are dropped. */
  siteOrigins: string[];
  /** Phase 16: Stadia Maps key for geocoding the typed address; absent in a real environment => no geocoder (callers skip the centre). */
  stadiaApiKey?: string;
  /** Phase 7a1: all optional; Sentry is inert without a DSN. */
  sentry?: { dsn?: string; publicDsn?: string; environment?: string; issuesUrl?: string };
  /** Phase 7a2 (D19): Basic-auth password of `POST /api/postmark/webhook`; unset => the route answers 404. */
  postmarkWebhookSecret?: string;
  /**
   * Phase 9a: Stripe settings, all optional, shaped for `gatewayFor` (R27: no key in DEV/production => no gateway, billing
   * not configured). `BILLING_FAKE_GATEWAY=1` selects the fake gateway (E2E only; refused on any Vercel env; ignored by the worker).
   */
  stripe?: { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_CONNECT_WEBHOOK_SECRET?: string; STRIPE_TAX_ENABLED?: string; NODE_ENV?: string; VITEST?: string; BILLING_FAKE_GATEWAY?: string };
}

export function parseWebEnv(env: NodeJS.ProcessEnv): WebEnv {
  const problems: string[] = [];
  const need = (key: string) => {
    const v = env[key]?.trim();
    if (!v) problems.push(`${key} is required`);
    return v ?? '';
  };
  const secret = (key: string) => {
    const v = need(key);
    if (v && v.length < MIN_LINK_SECRET_LENGTH) problems.push(`${key} must be at least ${MIN_LINK_SECRET_LENGTH} characters`);
    return v;
  };
  const authSecret = secret('BETTER_AUTH_SECRET');
  const appUrl = need('APP_URL').replace(/\/+$/, '');
  if (appUrl && !/^https?:\/\//.test(appUrl)) problems.push('APP_URL must be an http(s) URL');
  const link = secret('LINK_SIGNING_SECRET');
  const previous = env.LINK_SIGNING_SECRET_PREVIOUS?.trim();
  const defaultAgencyId = env.DEFAULT_AGENCY_ID?.trim() || null;
  if (defaultAgencyId && !isUuid(defaultAgencyId)) problems.push('DEFAULT_AGENCY_ID must be a uuid');
  const askFake = env.ASK_FAKE_AI?.trim() ?? '';
  if (askFake && env.VERCEL_ENV?.trim() === 'production') problems.push('ASK_FAKE_AI must not be set in production');
  if (env.E2E_THROW_PAGE?.trim() && env.VERCEL_ENV?.trim() === 'production') problems.push('E2E_THROW_PAGE must not be set in production');
  const setupFake = env.SETUP_FAKE_LOOKUP?.trim() ?? '';
  if (setupFake && env.VERCEL_ENV?.trim() === 'production') problems.push('SETUP_FAKE_LOOKUP must not be set in production');
  const webhookFake = env.WEBHOOK_FAKE_SEND?.trim() ?? '';
  if (webhookFake && env.VERCEL_ENV?.trim() === 'production') problems.push('WEBHOOK_FAKE_SEND must not be set in production');
  const hostEnv = hostEnvFor(env, problems);
  const emailFrom = env.EMAIL_FROM?.trim();
  if (emailFrom && !isBareEmailAddress(emailFrom)) problems.push(EMAIL_FROM_PROBLEM);
  const billingFake = env.BILLING_FAKE_GATEWAY?.trim() || undefined;
  if (billingFake && env.VERCEL_ENV?.trim()) problems.push('BILLING_FAKE_GATEWAY must not be set on Vercel (any VERCEL_ENV)');
  // 13a1 R8: fake Vercel/Postmark domain vendors are an E2E-only switch (`domainVendorsFor`), like BILLING_FAKE_GATEWAY.
  if (env.DOMAINS_FAKE_VENDORS?.trim() && env.VERCEL_ENV?.trim()) problems.push('DOMAINS_FAKE_VENDORS must not be set on Vercel (any VERCEL_ENV)');
  const siteOrigins = [env.SITE_ORIGIN, ...(env.SITE_ORIGIN_EXTRA?.split(',') ?? [])]
    .map((x) => x?.trim().replace(/\/+$/, ''))
    .filter((x): x is string => !!x && isOrigin(x));
  const parsed: WebEnv = {
    appUrl, authSecret, hostEnv: hostEnv!,
    appDatabaseUrl: need('APP_DATABASE_URL'), serviceDatabaseUrl: need('SERVICE_DATABASE_URL'), queueDatabaseUrl: need('DATABASE_URL'),
    linkSecrets: [link, ...(previous && previous.length >= MIN_LINK_SECRET_LENGTH ? [previous] : [])],
    emailFrom: emailFrom || (appUrl ? `briefs@${safeHost(appUrl)}` : ''),
    google: env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() ? { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim() } : null,
    defaultAgencyId,
    webMonitoring: env.WEB_MONITORING_ENABLED?.trim() === 'true',
    kbImport: env.KB_IMPORT_ENABLED?.trim() === 'true',
    platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS),
    askFakeAi: askFake === '1',
    setupFakeLookup: setupFake === '1',
    webhookFakeSend: webhookFake === '1',
    turnstile: { siteKey: env.TURNSTILE_SITE_KEY?.trim() || undefined, secretKey: env.TURNSTILE_SECRET_KEY?.trim() || undefined },
    supportReplyTo: env.SUPPORT_REPLY_TO?.trim() || undefined,
    siteOrigins,
    stadiaApiKey: env.STADIA_API_KEY?.trim() || undefined,
    sentry: {
      dsn: env.SENTRY_DSN?.trim() || undefined,
      publicDsn: env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined,
      environment: env.SENTRY_ENVIRONMENT?.trim() || undefined,
      issuesUrl: env.SENTRY_ISSUES_URL?.trim() || undefined,
    },
    postmarkWebhookSecret: env.POSTMARK_WEBHOOK_SECRET?.trim() || undefined,
    stripe: {
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY?.trim() || undefined,
      STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
      STRIPE_CONNECT_WEBHOOK_SECRET: env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() || undefined,
      STRIPE_TAX_ENABLED: env.STRIPE_TAX_ENABLED?.trim() || undefined,
      NODE_ENV: env.NODE_ENV,
      VITEST: env.VITEST,
      BILLING_FAKE_GATEWAY: billingFake,
    },
  };
  if (problems.length) throw new Error(`Web app configuration problems:\n- ${problems.join('\n- ')}`);
  return parsed;
}

/**
 * N2: `parseHostEnv` problems go to `problems` as they are (no second web rule). Only "NEUTRAL_DOMAIN is required" is production-only:
 * elsewhere the APP_URL host stands in (refused like a set value when it is a Rival Monday root). Null only when `problems` grew.
 */
function hostEnvFor(env: NodeJS.ProcessEnv, problems: string[]): HostEnv | null {
  const first = parseHostEnv(env);
  if (first.hostEnv || !first.problems.length) return first.hostEnv; // null + no problem = APP_URL missing/invalid, reported above
  const missing = first.problems.length === 1 && first.problems[0] === 'NEUTRAL_DOMAIN is required';
  if (missing && env.VERCEL_ENV?.trim() !== 'production') {
    const fallback = parseHostEnv({ ...env, NEUTRAL_DOMAIN: new URL(env.APP_URL!.trim()).hostname });
    problems.push(...fallback.problems);
    return fallback.hostEnv;
  }
  problems.push(...first.problems);
  return null;
}

function isOrigin(x: string): boolean {
  try {
    return new URL(x).origin === x;
  } catch {
    return false;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

let cached: WebEnv | null = null;
export const webEnv = (): WebEnv => (cached ??= parseWebEnv(process.env));
