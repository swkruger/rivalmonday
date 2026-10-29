/**
 * The site's only env reader. Next.js inlines public (NEXT_PUBLIC_) variables only for literal
 * reads, so each variable is read by its full name below and the values are validated in `parseSiteEnv`.
 * The site holds no secrets: nothing here may be anything but public (import-boundary test).
 */
export const DEFAULT_APP_URL = 'https://rivalmonday.app';
export const DEFAULT_CLIENT_PRICE_USD = 99;

export type SocialNetwork = 'linkedin' | 'x' | 'youtube' | 'facebook' | 'instagram';

export type RawSiteEnv = {
  appUrl?: string;
  turnstileSiteKey?: string;
  social?: Partial<Record<SocialNetwork, string | undefined>>;
  clientPriceUsd?: string;
  vercelEnv?: string;
};

export type SiteEnv = {
  /** Origin of the app (sign-in, sign-up, `/api/waitlist`), no trailing slash. */
  appUrl: string;
  turnstileSiteKey: string | null;
  social: Record<SocialNetwork, string | null>;
  clientPriceUsd: number;
  /** `VERCEL_ENV === 'production'` — build/server only (not inlined client-side). */
  isProduction: boolean;
};

const SOCIAL_NETWORKS: readonly SocialNetwork[] = ['linkedin', 'x', 'youtube', 'facebook', 'instagram'];

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function appOrigin(value: string | undefined): string {
  const url = parseUrl(value);
  if (!url) return DEFAULT_APP_URL;
  if (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) return url.origin;
  return DEFAULT_APP_URL;
}

function httpsLink(value: string | undefined): string | null {
  const url = parseUrl(value);
  return url?.protocol === 'https:' ? url.href : null;
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value.trim())) return fallback;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function parseSiteEnv(raw: RawSiteEnv): SiteEnv {
  const key = raw.turnstileSiteKey?.trim();
  return {
    appUrl: appOrigin(raw.appUrl),
    turnstileSiteKey: key ? key : null,
    social: Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, httpsLink(raw.social?.[n])])) as Record<SocialNetwork, string | null>,
    clientPriceUsd: positiveInt(raw.clientPriceUsd, DEFAULT_CLIENT_PRICE_USD),
    isProduction: raw.vercelEnv === 'production',
  };
}

export const siteEnv: SiteEnv = parseSiteEnv({
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  social: {
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN,
    x: process.env.NEXT_PUBLIC_SOCIAL_X,
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
  },
  clientPriceUsd: process.env.NEXT_PUBLIC_CLIENT_PRICE_USD,
  vercelEnv: process.env.VERCEL_ENV,
});
