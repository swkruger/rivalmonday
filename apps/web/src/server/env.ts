import 'server-only';
import { isUuid, MIN_LINK_SECRET_LENGTH, normalizeAdminEmails } from '@cs/core';

export interface WebEnv {
  appUrl: string;
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
  /**
   * Phase 9a: Stripe settings, all optional, shaped for `gatewayFor` (R27: no key in DEV/production => no gateway, billing
   * not configured). `BILLING_FAKE_GATEWAY=1` selects the fake gateway (E2E only; refused on Vercel production).
   */
  /** Phase 10: all optional. No Turnstile secret => the fake verifier; `supportReplyTo` is the Reply-To of lifecycle emails. */
  turnstile?: { siteKey?: string; secretKey?: string };
  supportReplyTo?: string;
  postmarkBroadcastStream?: string;
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
  const billingFake = env.BILLING_FAKE_GATEWAY?.trim() || undefined;
  if (billingFake && env.VERCEL_ENV?.trim() === 'production') problems.push('BILLING_FAKE_GATEWAY must not be set in production');
  const parsed: WebEnv = {
    appUrl, authSecret,
    appDatabaseUrl: need('APP_DATABASE_URL'), serviceDatabaseUrl: need('SERVICE_DATABASE_URL'), queueDatabaseUrl: need('DATABASE_URL'),
    linkSecrets: [link, ...(previous && previous.length >= MIN_LINK_SECRET_LENGTH ? [previous] : [])],
    emailFrom: env.EMAIL_FROM?.trim() || (appUrl ? `briefs@${safeHost(appUrl)}` : ''),
    google: env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() ? { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim() } : null,
    defaultAgencyId,
    webMonitoring: env.WEB_MONITORING_ENABLED?.trim() === 'true',
    kbImport: env.KB_IMPORT_ENABLED?.trim() === 'true',
    platformAdmins: normalizeAdminEmails(env.PLATFORM_ADMIN_EMAILS),
    askFakeAi: askFake === '1',
    turnstile?: { siteKey: env.TURNSTILE_SITE_KEY?.trim() || undefined, secretKey: env.TURNSTILE_SECRET_KEY?.trim() || undefined },
    supportReplyTo: env.SUPPORT_REPLY_TO?.trim() || undefined,
    postmarkBroadcastStream: env.POSTMARK_BROADCAST_STREAM?.trim() || undefined,
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

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

let cached: WebEnv | null = null;
export const webEnv = (): WebEnv => (cached ??= parseWebEnv(process.env));
