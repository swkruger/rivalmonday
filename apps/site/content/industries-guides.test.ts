// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { footerColumns, navItems } from '../src/components/shell/nav-items';
import sitemap from '../src/app/sitemap';
import { articleLd } from '../src/lib/json-ld';
import { pageMetadata } from '../src/lib/metadata';
import { GUIDES } from './guides';
import { ANNOUNCEMENT } from './home';
import { ANY_INDUSTRY, INDUSTRIES, INDUSTRY_EXAMPLE_LINKS, watchList, websitesLine } from './industries';
import { PAGES } from './pages';
import { SITE_URL } from './site';
import { SOURCE_DEPTH, SOURCES } from './sources';
import { WEBSITE_MONITORING_LIVE } from './website-monitoring';

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}
const copy = strings([INDUSTRIES, GUIDES, SOURCE_DEPTH, watchList(false), watchList(true)]);
const registered = new Set<string>(PAGES.map((p) => p.path));

describe('industry and guide copy', () => {
  it('never names a data vendor or makes an unprovable boast', () => {
    for (const s of copy) {
      expect(s, s).not.toMatch(/DataForSEO|Apify|ScrapeCreators|Stadia/);
      expect(s, s).not.toMatch(/nobody else|only platform|#1|best-in-class|guarantee|trusted by|customers love/i);
    }
  });

  it('claims nothing the ledger marks "not built" (social monitoring, public API)', () => {
    for (const s of copy) expect(s, s).not.toMatch(/\b(instagram posts|tiktok|social media monitoring|rest api|public api)\b/i);
  });

  it('website monitoring follows the one switch', () => {
    expect(websitesLine(false)).toMatch(/switching on soon/);
    expect(websitesLine(true)).not.toMatch(/soon/);
    expect(watchList().find((w) => w.source === 'competitor-websites')!.line).toBe(websitesLine(WEBSITE_MONITORING_LIVE));
  });

  it('every source has depth, and every guide and related link resolves to a registered page', () => {
    for (const s of SOURCES) {
      expect(SOURCE_DEPTH[s.slug].whyItMatters.length, s.slug).toBeGreaterThan(0);
      expect(SOURCE_DEPTH[s.slug].faq.length, s.slug).toBeGreaterThan(0);
      const g = SOURCE_DEPTH[s.slug].guide;
      if (g) expect(registered.has(`/guides/${g}`), g).toBe(true);
    }
    for (const g of GUIDES) for (const r of g.related) expect(registered.has(r.href), r.href).toBe(true);
    for (const i of INDUSTRIES) for (const g of i.guides) expect(registered.has(`/guides/${g}`), g).toBe(true);
  });

  it('every industry is complete and names no product brand', () => {
    expect(new Set(INDUSTRIES.map((i) => i.slug)).size).toBe(INDUSTRIES.length);
    for (const i of INDUSTRIES) {
      expect(i.rivalMoves.length, i.slug).toBe(6);
      expect(i.keywordExamples.length, i.slug).toBeLessThanOrEqual(5);
      expect(i.briefExamples.length, i.slug).toBe(3);
      expect(i.clientLabel, i.slug).toMatch(/^an? /);
      expect(JSON.stringify(i), i.slug).not.toMatch(/botox|invisalign|coolsculpting/i);
    }
  });

  it('the announcement bar links every industry it names, and every industry is named', () => {
    for (const e of ANNOUNCEMENT.examples) expect(INDUSTRY_EXAMPLE_LINKS[e], e).toMatch(/^\/for\//);
    expect(new Set(Object.values(INDUSTRY_EXAMPLE_LINKS))).toEqual(new Set(INDUSTRIES.map((i) => `/for/${i.slug}`)));
  });

  it('every guide has its own committed image with alt text', () => {
    for (const g of GUIDES) {
      expect(existsSync(join(__dirname, '..', 'public', g.image.src)), g.image.src).toBe(true);
      expect(g.image.alt.length, g.slug).toBeGreaterThan(20);
    }
    expect(new Set(GUIDES.map((g) => g.image.src)).size).toBe(GUIDES.length);
  });

  it('guides are substantial (at least ~600 words each)', () => {
    for (const g of GUIDES) {
      const words = strings([g.lead, g.sections]).join(' ').split(/\s+/).length;
      expect(words, g.slug).toBeGreaterThanOrEqual(600);
    }
  });
});

describe('discoverability without the top nav', () => {
  it('industry and guide pages are in the sitemap but not the header nav', () => {
    const urls = sitemap().map((e) => e.url);
    const nav = navItems().map((n) => n.href);
    for (const p of PAGES.filter((x) => x.group === 'industries' || x.group === 'guides')) {
      expect(urls, p.path).toContain(SITE_URL + p.path);
      expect(nav, p.path).not.toContain(p.path);
    }
  });

  it('the footer links every industry and guide', () => {
    const footer = footerColumns().flatMap((c) => c.links.map((l) => l.href));
    for (const i of INDUSTRIES) expect(footer).toContain(`/for/${i.slug}`);
    for (const g of GUIDES) expect(footer).toContain(`/guides/${g.slug}`);
    expect(footerColumns().flatMap((c) => c.links).find((l) => l.label === ANY_INDUSTRY.heading)).toMatchObject({ href: '/for', highlight: true });
    expect(footerColumns().find((c) => c.heading === 'Industries')?.twoColumn).toBe(true);
  });

  it('integration detail pages are served but noindex and kept out of the sitemap', () => {
    const urls = sitemap().map((e) => e.url);
    const details = PAGES.filter((p) => p.group === 'integrations' && p.path !== '/integrations');
    expect(details.length).toBeGreaterThan(0);
    for (const p of details) {
      expect(pageMetadata(p.path).robots, p.path).toEqual({ index: false, follow: true });
      expect(urls, p.path).not.toContain(SITE_URL + p.path);
    }
    expect(pageMetadata('/integrations').robots).toBeUndefined();
  });

  it('a guide is an Article by the organization with its dates', () => {
    const g = GUIDES[0]!;
    expect(articleLd({ path: `/guides/${g.slug}`, headline: g.h1, description: g.seo.description, published: g.published, updated: g.updated })).toMatchObject({
      '@type': 'Article', datePublished: g.published, dateModified: g.updated, author: { '@id': `${SITE_URL}/#organization` },
    });
  });
});
