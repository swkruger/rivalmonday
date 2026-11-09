/** Decision 5: the public library page of an ad, or null when Google gave no advertiser id. */
export function libraryUrl(a: { platform: string; externalId: string; advertiserId: string | null }): string | null {
  if (a.platform === 'meta') return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(a.externalId)}`;
  if (a.platform === 'google' && a.advertiserId) {
    return `https://adstransparency.google.com/advertiser/${encodeURIComponent(a.advertiserId)}/creative/${encodeURIComponent(a.externalId)}`;
  }
  return null;
}
