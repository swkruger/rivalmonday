/** Hosts that are link hubs or the networks themselves: a match on them proves nothing about ownership. */
const NO_CONFIRM_HOSTS: ReadonlySet<string> = new Set(['linktr.ee', 'linkin.bio', 'beacons.ai', 'app.trackable.io', 'facebook.com', 'instagram.com']);

/** Lower-case host with `www.` stripped; path/query ignored; null when the URL does not parse. */
export function siteHost(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

/** True when `url`'s host equals the competitor's domain host and is not a no-confirm host. */
export function confirmsDomain(url: string | null | undefined, competitorDomain: string | null | undefined): boolean {
  const a = siteHost(url);
  const b = siteHost(competitorDomain);
  return a !== null && a === b && !NO_CONFIRM_HOSTS.has(a);
}
