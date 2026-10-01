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

export async function collectSitemapUrls(fetchText: FetchText, sitemapUrls: string[], opts: { maxUrls?: number; maxDepth?: number } = {}): Promise<string[]> {
  const maxUrls = opts.maxUrls ?? 500;
  const maxDepth = opts.maxDepth ?? 2;
  const seen = new Set<string>();
  const out = new Set<string>();
  let frontier = [...new Set(sitemapUrls)];
  for (let depth = 0; depth <= maxDepth && frontier.length > 0 && out.size < maxUrls; depth++) {
    const next: string[] = [];
    for (const sm of frontier) {
      if (seen.has(sm) || out.size >= maxUrls) continue;
      seen.add(sm);
      try {
        const res = await fetchText(sm);
        if (res.status < 200 || res.status >= 300) continue;
        const parsed = parseSitemap(res.body);
        for (const u of parsed.urls) if (out.size < maxUrls) out.add(u);
        next.push(...parsed.sitemaps);
      } catch {
        // one broken sitemap must not abort discovery
      }
    }
    frontier = next;
  }
  return [...out];
}
