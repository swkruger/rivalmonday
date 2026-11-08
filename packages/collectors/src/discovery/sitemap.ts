import { XMLParser } from 'fast-xml-parser';
import type { FetchText } from '../web/user-agent';

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const locs = (entries: unknown): string[] =>
  asArray(entries as { loc?: unknown } | { loc?: unknown }[])
    .map((e) => (typeof e?.loc === 'string' ? e.loc.trim() : ''))
    .filter(Boolean);

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  let doc: Record<string, { url?: unknown; sitemap?: unknown }>;
  try {
    doc = parser.parse(xml);
  } catch {
    return { urls: [], sitemaps: [] };
  }
  return { urls: locs(doc?.urlset?.url), sitemaps: locs(doc?.sitemapindex?.sitemap) };
}

/**
 * Reads sitemap URLs (indexes followed to `maxDepth`, at most `maxFiles` files and `maxUrls` URLs). `truncated` is true
 * when the read may be incomplete: a cap dropped URLs or left sitemap files unread, or a file failed (thrown, e.g.
 * robots-disallowed or off-site, or any non-2xx other than 404/410). A 404/410 file is simply absent, not truncated.
 * Re-discovery only trusts sitemap-only URLs as new, and only marks pages gone, after complete reads (spec D6).
 */
export async function collectSitemapUrls(
  fetchText: FetchText,
  sitemapUrls: string[],
  opts: { maxUrls?: number; maxDepth?: number; maxFiles?: number } = {},
): Promise<{ urls: string[]; truncated: boolean }> {
  const maxUrls = opts.maxUrls ?? 500;
  const maxDepth = opts.maxDepth ?? 2;
  const maxFiles = opts.maxFiles ?? 10;
  const seen = new Set<string>();
  const out = new Set<string>();
  let fetched = 0;
  let truncated = false;
  let frontier = [...new Set(sitemapUrls)];
  for (let depth = 0; frontier.length > 0; depth++) {
    if (depth > maxDepth) {
      if (frontier.some((sm) => !seen.has(sm))) truncated = true;
      break;
    }
    const next: string[] = [];
    for (const sm of frontier) {
      if (seen.has(sm)) continue;
      if (out.size >= maxUrls || fetched >= maxFiles) {
        truncated = true;
        continue;
      }
      seen.add(sm);
      fetched++;
      try {
        const res = await fetchText(sm);
        if (res.status === 404 || res.status === 410) continue;
        if (res.status < 200 || res.status >= 300) {
          truncated = true;
          continue;
        }
        const parsed = parseSitemap(res.body);
        for (const u of parsed.urls) {
          if (out.has(u)) continue;
          if (out.size < maxUrls) out.add(u);
          else truncated = true;
        }
        next.push(...parsed.sitemaps);
      } catch {
        // one broken sitemap must not abort discovery, but the read is incomplete
        truncated = true;
      }
    }
    frontier = next;
  }
  return { urls: [...out], truncated };
}
