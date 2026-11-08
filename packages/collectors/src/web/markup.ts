import { createHash } from 'node:crypto';
import type { SiteFeatureCategory } from '@cs/core';
import { SITE_FEATURE_REGISTRY } from './markup-registry';

export * from './markup-registry';

export interface SiteFeature {
  id: string;
  category: SiteFeatureCategory;
  vendor: string;
  url: string;
}

export interface StructuredOffer {
  type: 'Offer' | 'AggregateOffer';
  name: string | null;
  description: string | null;
  price: string | number | null;
  lowPrice: string | number | null;
  currency: string | null;
  hasPriceSpecification: boolean;
}

const MAX_OFFERS = 50;
const MAX_DEPTH = 24;
const SCAN_RE = /<!--|<(script|iframe|link|a|style|noscript)(?=[\s/>])/gi;

interface ScannedTag {
  tag: 'script' | 'iframe' | 'link' | 'a';
  attrs: string;
  /** script body only (other tags: empty). */
  body: string;
}

/** Index of the `>` closing an opening tag, skipping quoted attribute values; -1 if none. */
function tagEnd(html: string, from: number): number {
  let q: string | null = null;
  for (let i = from; i < html.length; i++) {
    const c = html[i]!;
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '>') return i;
  }
  // an unbalanced quote swallowed the rest: fall back to the first plain `>`
  return html.indexOf('>', from);
}

/**
 * Single linear pass: skips HTML comments and the bodies of script/style/noscript (so tag-shaped
 * text inside them is never seen) and returns the live script/iframe/link/a tags. An unclosed
 * comment, tag or script ends the scan.
 */
function scanTags(html: string): ScannedTag[] {
  const out: ScannedTag[] = [];
  const re = new RegExp(SCAN_RE.source, 'gi');
  for (;;) {
    const m = re.exec(html);
    if (!m) break;
    if (!m[1]) {
      const end = html.indexOf('-->', re.lastIndex);
      if (end < 0) break;
      re.lastIndex = end + 3;
      continue;
    }
    const name = m[1].toLowerCase();
    const gt = tagEnd(html, re.lastIndex);
    if (gt < 0) break;
    const attrs = html.slice(re.lastIndex, gt);
    re.lastIndex = gt + 1;
    if (name === 'script' || name === 'style' || name === 'noscript') {
      const close = new RegExp(`</${name}\\s*>`, 'gi');
      close.lastIndex = gt + 1;
      const c = close.exec(html);
      const bodyEnd = c ? c.index : html.length;
      if (name === 'script') out.push({ tag: 'script', attrs, body: html.slice(gt + 1, bodyEnd) });
      if (!c) break;
      re.lastIndex = close.lastIndex;
    } else {
      out.push({ tag: name as ScannedTag['tag'], attrs, body: '' });
    }
  }
  return out;
}

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

function resolveUrl(raw: string): URL | null {
  const v = raw.replace(/&amp;/gi, '&').trim();
  const abs = v.startsWith('//') ? `https:${v}` : v;
  if (!/^https?:\/\//i.test(abs)) return null; // relative URLs never match
  try {
    return new URL(abs);
  } catch {
    return null;
  }
}

function hostMatches(host: string, hosts: readonly string[]): boolean {
  const h = host.toLowerCase();
  return hosts.some((x) => h === x || h.endsWith(`.${x}`));
}

/** Third-party widgets referenced by tag attributes (never inline script text). Unique by id, sorted by id. */
export function siteFeatures(html: string): SiteFeature[] {
  const found = new Map<string, SiteFeature>();
  for (const t of scanTags(html)) {
    const tag = t.tag;
    const raw = attr(t.attrs, tag === 'script' || tag === 'iframe' ? 'src' : 'href');
    if (!raw) continue;
    const url = resolveUrl(raw);
    if (!url) continue;
    for (const sig of SITE_FEATURE_REGISTRY) {
      if (found.has(sig.id) || !sig.tags.includes(tag)) continue;
      if (!hostMatches(url.hostname, sig.hosts)) continue;
      if (sig.path && !sig.path.test(url.pathname)) continue;
      found.set(sig.id, { id: sig.id, category: sig.category, vendor: sig.vendor, url: url.toString() });
    }
  }
  return [...found.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

type Ctx = { name: string | null; description: string | null };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): string | number | null => (typeof v === 'string' || typeof v === 'number' ? v : null);

function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string');
}

function walk(node: unknown, ctx: Ctx, out: StructuredOffer[], depth: number): void {
  if (out.length >= MAX_OFFERS || depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, ctx, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const own: Ctx = { name: str(obj.name) ?? ctx.name, description: str(obj.description) ?? ctx.description };
  const types = typesOf(obj);
  const type = types.includes('AggregateOffer') ? 'AggregateOffer' : types.includes('Offer') ? 'Offer' : null;
  if (type) {
    const spec = obj.priceSpecification;
    out.push({
      type,
      name: own.name,
      description: own.description,
      price: num(obj.price),
      lowPrice: num(obj.lowPrice),
      currency: str(obj.priceCurrency),
      hasPriceSpecification: spec !== undefined && spec !== null && typeof spec === 'object',
    });
  }
  for (const v of Object.values(obj)) if (v && typeof v === 'object') walk(v, own, out, depth + 1);
}

/** Offer / AggregateOffer nodes from `application/ld+json` blocks (max 50). Broken JSON is skipped. */
export function jsonLdOffers(html: string): StructuredOffer[] {
  const out: StructuredOffer[] = [];
  for (const t of scanTags(html)) {
    if (out.length >= MAX_OFFERS) break;
    if (t.tag !== 'script' || !/^application\/ld\+json\s*(;|$)/i.test((attr(t.attrs, 'type') ?? '').trim())) continue;
    let data: unknown;
    try {
      data = JSON.parse(t.body);
    } catch {
      continue;
    }
    walk(data, { name: null, description: null }, out, 0);
  }
  return out.slice(0, MAX_OFFERS);
}

/** sha256 over feature ids + normalised offer tuples; the registry version is not part of it. */
export function markupSha(html: string): string {
  const ids = siteFeatures(html).map((f) => f.id).join(',');
  const offers = jsonLdOffers(html)
    .map((o) => [o.type, o.name, o.price, o.lowPrice, o.currency, o.hasPriceSpecification].map((x) => x ?? '').join('|'))
    .join('\n');
  return createHash('sha256').update(`${ids}\n${offers}`).digest('hex');
}
