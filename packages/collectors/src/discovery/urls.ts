import type { PageType } from '@cs/core';

const TRACKING = /^(utm_|gclid$|fbclid$|msclkid$)/i;
const BINARY = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|docx?|xlsx?|pptx?|mp4|mp3|mov|avi|css|js|xml|json)$/i;
const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');

export function normalizeUrl(raw: string, site: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (bare(u.hostname) !== bare(site)) return null;
  if (BINARY.test(u.pathname)) return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

const RULES: [PageType, RegExp][] = [
  ['pricing', /pric|rates|cost|fees/i],
  ['promo', /special|offer|coupon|deal|promo|discount|financing/i],
  ['service_area', /service-?area|areas-?(we-)?serve|locations?\b|cities|near-me/i],
  ['careers', /career|jobs|join-?(our-)?team|hiring|employment/i],
  ['team', /\bteam\b|our-?people|staff|meet-/i],
  ['about', /about/i],
  ['contact', /contact/i],
  ['blog', /blog|news|articles|tips/i],
];

/** Cheap keyword hint used to prefilter candidates; the classifier makes the final call. */
export function guessPageType(url: string, linkText?: string): PageType | null {
  const path = new URL(url).pathname;
  if (path === '/' || path === '') return 'home';
  const haystack = `${path} ${linkText ?? ''}`;
  for (const [type, re] of RULES) if (re.test(haystack)) return type;
  return null;
}
