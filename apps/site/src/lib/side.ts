export type Side = 'home' | 'agency' | 'business' | 'both';

type SidePaths = { agency: string[]; business: string[] };

/** Drops query, hash and a trailing slash (except on `/`). */
function normalise(pathname: string): string {
  const path = pathname.split('#')[0]!.split('?')[0]!;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Exact match only, no prefix matching: an unknown address (and `/_not-found`) is `both`. */
export function sideOf(pathname: string, paths: SidePaths): Side {
  const path = normalise(pathname);
  if (path === '/') return 'home';
  if (paths.agency.includes(path)) return 'agency';
  if (paths.business.includes(path)) return 'business';
  return 'both';
}

/** The other side's pricing page from a pricing page, else its landing page. */
export function switchHref(pathname: string, to: 'agency' | 'business'): string {
  const base = to === 'agency' ? '/agencies' : '/business';
  const path = normalise(pathname);
  return path === '/agencies/pricing' || path === '/business/pricing' ? `${base}/pricing` : base;
}
