import { TRACKING_PARAM } from './urls';

/**
 * Identity of a page on a competitor's site (spec D6): bare lower-case host (no `www.`, port kept) + path without
 * trailing slashes + sorted non-tracking query. Scheme-free, so http/https and www/bare are one page. Fragments are
 * ignored. `null` for anything that is not an http(s) URL.
 */
export function pageKey(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '') + (u.port ? `:${u.port}` : '');
  const path = u.pathname.replace(/\/+$/, '');
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1));
  const query = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : '';
  return `${host}${path}${query}`;
}
